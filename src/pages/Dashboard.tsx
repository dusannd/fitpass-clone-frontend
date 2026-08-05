import { useEffect, useState, useRef, useCallback } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import axios from "axios";
import { api } from "../api/axios";
import type { User } from "../components/Layout";

const WS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/^http/, 'ws');
const STORAGE_KEY = "fitpass_qr_state";

interface QrState {
    token: string;
    expiresAt: number;
    actionType: "ENTRY" | "EXIT";
    cooldownEndsAt: number;
}

const getInitialQrState = (): QrState | null => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try { return JSON.parse(saved); }
        catch { localStorage.removeItem(STORAGE_KEY); }
    }
    return null;
};

export default function Dashboard() {
    const user = useOutletContext<User>();
    const isMember = user.roles.some(r => r.name === "member");
    const isWorker = user.roles.some(r => r.name === "worker");
    const isTrainer = user.roles.some(r => r.name === "trainer");

    // --- REAL-TIME STATUS STATE ---
    const [physicalStatus, setPhysicalStatus] = useState<"INSIDE" | "OUTSIDE" | "LOADING">("LOADING");
    const [enteredAt, setEnteredAt] = useState<string | null>(null);
    const [sessionDuration, setSessionDuration] = useState<string>("");

    // --- QR STATE WITH LAZY INITIALIZATION ---
    const [qrToken, setQrToken] = useState<string>(() => {
        const state = getInitialQrState();
        return (state && state.expiresAt > Date.now()) ? state.token : "";
    });

    const [timeLeft, setTimeLeft] = useState<number>(() => {
        const state = getInitialQrState();
        return (state && state.expiresAt > Date.now()) ? Math.ceil((state.expiresAt - Date.now()) / 1000) : 0;
    });

    const [cooldownLeft, setCooldownLeft] = useState<number>(() => {
        const state = getInitialQrState();
        return (state && state.cooldownEndsAt > Date.now()) ? Math.ceil((state.cooldownEndsAt - Date.now()) / 1000) : 0;
    });

    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [error, setError] = useState("");
    const [accessGranted, setAccessGranted] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string>("");

    const wsRef = useRef<WebSocket | null>(null);

    // --- 1. FETCH PHYSICAL STATUS ---
    const fetchStatus = useCallback(async () => {
        if (!isMember) return;
        try {
            const res = await api.get("/access/my-status");
            setPhysicalStatus(res.data.status);
            setEnteredAt(res.data.entered_at);
        } catch (err) {
            console.error("Failed to fetch physical status", err);
        }
    }, [isMember]);

    useEffect(() => {
        void fetchStatus();
    }, [fetchStatus]);

    // --- 2. SESSION DURATION TIMER ---
    useEffect(() => {
        if (physicalStatus !== "INSIDE" || !enteredAt) {
            // FIX: Wrap in setTimeout to prevent synchronous state update inside the effect
            const resetTimer = setTimeout(() => setSessionDuration(""), 0);
            return () => clearTimeout(resetTimer);
        }

        const updateDuration = () => {
            const diffMs = Date.now() - new Date(enteredAt).getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
            setSessionDuration(hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
        };

        // FIX: Execute asynchronously to prevent cascading renders
        const timeoutId = setTimeout(updateDuration, 0);
        const intervalId = setInterval(updateDuration, 60000);

        return () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };
    }, [physicalStatus, enteredAt]);

    // --- 3. MASTER QR & COOLDOWN TIMER ---
    useEffect(() => {
        if (!isMember) return;

        const interval = setInterval(() => {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (!savedState) {
                setTimeLeft(prev => prev > 0 ? 0 : prev);
                setCooldownLeft(prev => prev > 0 ? 0 : prev);
                return;
            }

            const parsed: QrState = JSON.parse(savedState);
            const now = Date.now();

            if (parsed.expiresAt > now) {
                setTimeLeft(Math.ceil((parsed.expiresAt - now) / 1000));
            } else {
                setTimeLeft(prev => prev > 0 ? 0 : prev);
                setQrToken(prev => {
                    if (prev !== "") {
                        setError("QR Code expired. Please generate a new one.");
                        return "";
                    }
                    return prev;
                });
                localStorage.removeItem(STORAGE_KEY);
            }

            if (parsed.cooldownEndsAt > now) {
                setCooldownLeft(Math.ceil((parsed.cooldownEndsAt - now) / 1000));
            } else {
                setCooldownLeft(prev => prev > 0 ? 0 : prev);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isMember]);

    // --- 4. WEBSOCKET CONNECTION ---
    useEffect(() => {
        if (!isMember) return;

        const ws = new WebSocket(`${WS_BASE_URL}/access/ws`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "ACCESS_EVENT") {
                if (data.access_granted) {
                    setAccessGranted(true);
                    setScanMessage(data.action_type === "ENTRY" ? "Welcome in!" : "Goodbye!");

                    // Instantly clear QR code
                    setQrToken("");
                    setTimeLeft(0);
                    localStorage.removeItem(STORAGE_KEY);

                    // Refresh physical state (Transforms Check-In to Check-Out UI)
                    void fetchStatus();

                    setTimeout(() => {
                        setAccessGranted(false);
                        setScanMessage("");
                    }, 4000);
                } else {
                    setError(`Denied: ${data.reason}`);
                }
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
        };
    }, [isMember, fetchStatus]);

    // --- 5. QR GENERATION ---
    const handleGenerateQr = useCallback(async () => {
        setIsGenerating(true);
        setError("");

        // Smart intent resolution based on actual physical state
        const intentType = physicalStatus === "INSIDE" ? "EXIT" : "ENTRY";

        try {
            const res = await api.post("/access/generate", { action_type: intentType });
            const token = res.data.qr_token;
            const expiresInSec = res.data.expires_in_seconds || 300;
            const now = Date.now();

            const newState: QrState = {
                token: token,
                expiresAt: now + (expiresInSec * 1000),
                cooldownEndsAt: now + (30 * 1000),
                actionType: intentType
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
            setQrToken(token);
            setTimeLeft(expiresInSec);
            setCooldownLeft(30);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response) {
                if (err.response.status === 429) {
                    const msg = err.response.data.detail;
                    const sec = parseInt(msg.match(/\d+/)?.[0] || "30");
                    const saved = localStorage.getItem(STORAGE_KEY);
                    const parsed = saved ? JSON.parse(saved) : { expiresAt: 0, token: "", actionType: intentType };

                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cooldownEndsAt: Date.now() + (sec * 1000) }));
                    setCooldownLeft(sec);
                    setError(msg);
                } else {
                    setError(err.response.data.detail);
                }
            }
        } finally {
            setIsGenerating(false);
        }
    }, [physicalStatus]);

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* WELCOME BANNER */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 flex justify-between items-center transition-colors">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">
                        Welcome back, {user.first_name}! 👋
                    </h1>
                    <p className="text-gray-500 dark:text-slate-400 text-sm">Ready to crush your goals today?</p>
                </div>
            </div>

            {/* MEMBER SECTION - DYNAMIC SMART QR CODE */}
            {isMember && physicalStatus !== "LOADING" && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-8 justify-between transition-colors">

                    {/* LEFT PANEL - UI LOGIC */}
                    <div className="flex-1 w-full flex flex-col items-center md:items-start text-center md:text-left">

                        {/* DYNAMIC STATUS BADGE */}
                        <div className="mb-4">
                            {physicalStatus === "INSIDE" ? (
                                <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-800">
                                    <span className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                    </span>
                                    <span className="font-bold text-sm tracking-wide uppercase">You are inside</span>
                                    {sessionDuration && <span className="text-emerald-900 dark:text-emerald-200 text-xs font-black ml-1 bg-emerald-200 dark:bg-emerald-800 px-2 py-0.5 rounded-lg">{sessionDuration}</span>}
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700">
                                    <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                                    <span className="font-bold text-sm tracking-wide uppercase">You are outside</span>
                                </div>
                            )}
                        </div>

                        <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                            {physicalStatus === "INSIDE" ? "Ready to leave?" : "Enter the Gym"}
                        </h2>
                        <p className="text-gray-500 dark:text-slate-400 mb-8 text-sm">
                            {physicalStatus === "INSIDE"
                                ? "Generate an exit code and scan it at the turnstiles to checkout."
                                : "Generate an entry code and hold your phone to the scanner."}
                        </p>

                        {/* MESSAGES */}
                        {error && !qrToken && (
                            <div className="w-full bg-red-100 text-red-700 p-4 rounded-xl font-bold border border-red-200 mb-4 text-sm text-left">
                                {error}
                            </div>
                        )}

                        {accessGranted && (
                            <div className="w-full bg-emerald-100 text-emerald-800 p-4 rounded-xl font-bold border border-emerald-200 animate-pulse mb-4 text-center">
                                ✅ {scanMessage}
                            </div>
                        )}

                        {/* GENERATE BUTTON */}
                        {!qrToken && !accessGranted && (
                            <button
                                onClick={() => void handleGenerateQr()}
                                disabled={isGenerating || cooldownLeft > 0}
                                className={`w-full font-black py-4 px-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 text-white ${
                                    cooldownLeft > 0
                                        ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-80"
                                        : physicalStatus === "OUTSIDE"
                                            ? "bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5"
                                            : "bg-rose-600 hover:bg-rose-700 hover:-translate-y-0.5"
                                }`}
                            >
                                {isGenerating ? "Generating..." : cooldownLeft > 0 ? `Wait ${cooldownLeft}s` : physicalStatus === "OUTSIDE" ? "Generate Check In QR" : "Generate Check Out QR"}
                            </button>
                        )}

                        {/* ACTIVE TOKEN TIMER */}
                        {qrToken && !accessGranted && (
                            <div className={`w-full flex justify-between items-center px-6 py-4 rounded-xl font-bold border ${physicalStatus === "OUTSIDE" ? "bg-blue-50 text-blue-800 border-blue-200" : "bg-rose-50 text-rose-800 border-rose-200"}`}>
                                <span>Code active for</span>
                                <span className="text-2xl font-black tabular-nums">
                                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANEL - QR CODE UI */}
                    <div className="relative bg-white dark:bg-slate-100 p-4 rounded-[2rem] shadow-xl border-8 border-gray-50 dark:border-slate-800 transition-colors flex items-center justify-center h-[260px] w-[260px] shrink-0 overflow-hidden">
                        {accessGranted ? (
                            <div className="flex flex-col items-center animate-bounce z-10">
                                <span className="text-6xl">🔓</span>
                                <span className="text-emerald-600 font-black mt-3 text-2xl tracking-tight">OPEN</span>
                            </div>
                        ) : qrToken ? (
                            <div className="z-10 animate-in fade-in zoom-in duration-300">
                                <QRCodeSVG value={qrToken} size={200} fgColor={physicalStatus === "OUTSIDE" ? "#0f172a" : "#9f1239"} />
                            </div>
                        ) : (
                            <>
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 filter blur-[3px] pointer-events-none">
                                    <QRCodeSVG value="locked" size={200} fgColor="#000000" />
                                </div>
                                <div className="z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
                                    <span className="text-xl mb-1">🔒</span>
                                    <span className="font-black text-xs text-gray-500 dark:text-gray-400 tracking-widest uppercase">Locked</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* QUICK LINKS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isWorker && (
                    <Link to="/worker/dashboard" className="bg-gradient-to-br from-gray-800 to-gray-950 text-white rounded-2xl p-6 shadow-md hover:-translate-y-1 transition duration-300">
                        <h3 className="font-bold text-xl mb-1">Desk Worker Panel</h3>
                        <p className="text-gray-400 text-sm">View currently inside members and manage doors.</p>
                    </Link>
                )}
                {isTrainer && (
                    <Link to="/trainer/clients" className="bg-gradient-to-br from-blue-700 to-blue-900 text-white rounded-2xl p-6 shadow-md hover:-translate-y-1 transition duration-300">
                        <h3 className="font-bold text-xl mb-1">My Clients</h3>
                        <p className="text-blue-200 text-sm">Manage pending coaching requests and active clients.</p>
                    </Link>
                )}
            </div>
        </div>
    );
}