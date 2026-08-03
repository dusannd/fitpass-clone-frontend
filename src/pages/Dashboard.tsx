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

// Helper function for Lazy Initialization
const getInitialQrState = (): QrState | null => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            // Fixes the "unused 'e'" error
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return null;
};

export default function Dashboard() {
    const user = useOutletContext<User>();

    const isMember = user.roles.some(r => r.name === "member");
    const isWorker = user.roles.some(r => r.name === "worker");
    const isTrainer = user.roles.some(r => r.name === "trainer");

    // --- 1. STATE WITH LAZY INITIALIZATION (Fixes Cascading Renders) ---
    const [qrToken, setQrToken] = useState<string>(() => {
        const state = getInitialQrState();
        return (state && state.expiresAt > Date.now()) ? state.token : "";
    });

    const [actionType, setActionType] = useState<"ENTRY" | "EXIT">(() => {
        const state = getInitialQrState();
        return (state && state.expiresAt > Date.now()) ? state.actionType : "ENTRY";
    });

    const [timeLeft, setTimeLeft] = useState<number>(() => {
        const state = getInitialQrState();
        return (state && state.expiresAt > Date.now())
            ? Math.ceil((state.expiresAt - Date.now()) / 1000)
            : 0;
    });

    const [cooldownLeft, setCooldownLeft] = useState<number>(() => {
        const state = getInitialQrState();
        return (state && state.cooldownEndsAt > Date.now())
            ? Math.ceil((state.cooldownEndsAt - Date.now()) / 1000)
            : 0;
    });

    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [error, setError] = useState("");
    const [accessGranted, setAccessGranted] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string>("");

    const wsRef = useRef<WebSocket | null>(null);

    // --- 2. MASTER TIMER LOGIC ---
    useEffect(() => {
        if (!isMember) return;

        const interval = setInterval(() => {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (!savedState) {
                // Functional updates prevent unnecessary re-renders
                setTimeLeft(prev => prev > 0 ? 0 : prev);
                setCooldownLeft(prev => prev > 0 ? 0 : prev);
                return;
            }

            const parsed: QrState = JSON.parse(savedState);
            const now = Date.now();

            // Handle QR Expiration countdown
            if (parsed.expiresAt > now) {
                setTimeLeft(Math.ceil((parsed.expiresAt - now) / 1000));
            } else {
                setTimeLeft(prev => prev > 0 ? 0 : prev);

                // Only clear token and set error if a token actually exists
                setQrToken(prev => {
                    if (prev !== "") {
                        setError("QR Code expired. Please generate a new one.");
                        return "";
                    }
                    return prev;
                });

                localStorage.removeItem(STORAGE_KEY);
            }

            // Handle Cooldown countdown
            if (parsed.cooldownEndsAt > now) {
                setCooldownLeft(Math.ceil((parsed.cooldownEndsAt - now) / 1000));
            } else {
                setCooldownLeft(prev => prev > 0 ? 0 : prev);
            }

        }, 1000);

        return () => clearInterval(interval);
    }, [isMember]);


    // --- 3. WEBSOCKET CONNECTION ---
    useEffect(() => {
        if (!isMember) return;

        const ws = new WebSocket(`${WS_BASE_URL}/access/ws`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "ACCESS_EVENT") {
                if (data.access_granted) {
                    setAccessGranted(true);
                    setScanMessage(`Access Granted: ${data.reason}`);

                    // Clear the token immediately from memory and storage
                    setQrToken("");
                    setTimeLeft(0);
                    localStorage.removeItem(STORAGE_KEY);

                    // Revert back to generate state after 4 seconds
                    setTimeout(() => {
                        setAccessGranted(false);
                        setScanMessage("");
                    }, 4000);
                } else {
                    setError(`Scanned & Denied: ${data.reason}`);
                }
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };
    }, [isMember]);


    // --- 4. MANUAL QR GENERATION ---
    const handleGenerateQr = useCallback(async () => {
        setIsGenerating(true);
        setError("");

        try {
            const res = await api.post("/access/generate", { action_type: actionType });

            const token = res.data.qr_token;
            const expiresInSec = res.data.expires_in_seconds || 300;
            const now = Date.now();

            const newState: QrState = {
                token: token,
                expiresAt: now + (expiresInSec * 1000),
                cooldownEndsAt: now + (30 * 1000), // 30 seconds rate limit cooldown
                actionType: actionType
            };

            // Save to localStorage so it survives refresh!
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));

            setQrToken(token);
            setTimeLeft(expiresInSec);
            setCooldownLeft(30);

        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response) {
                if (err.response.status === 429) {
                    // Extract wait time from backend response
                    const msg = err.response.data.detail;
                    const match = msg.match(/\d+/);
                    const sec = match ? parseInt(match[0]) : 30;

                    const savedState = localStorage.getItem(STORAGE_KEY);
                    const parsed = savedState ? JSON.parse(savedState) : { expiresAt: 0, token: "", actionType };

                    localStorage.setItem(STORAGE_KEY, JSON.stringify({
                        ...parsed,
                        cooldownEndsAt: Date.now() + (sec * 1000)
                    }));

                    setCooldownLeft(sec);
                    setError(msg);
                } else {
                    setError(err.response.data.detail);
                }
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsGenerating(false);
        }
    }, [actionType]);

    // --- 5. RENDER FUNCTIONS ---
    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* WELCOME BANNER */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2 transition-colors">
                    Welcome back, {user.first_name}! 👋
                </h1>
                <p className="text-gray-600 dark:text-slate-400 transition-colors">
                    Your privileges: <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">{user.roles.map(r => r.name).join(", ")}</span>
                </p>
            </div>

            {/* MEMBER SECTION - DYNAMIC QR CODE */}
            {isMember && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-8 justify-center text-center md:text-left transition-colors duration-200">

                    <div className="flex-1 w-full flex flex-col items-center md:items-start">
                        <div className="flex flex-col sm:flex-row justify-between items-center w-full mb-6 gap-4">
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white transition-colors">Gym Access</h2>

                            {/* ACTION TYPE TOGGLE (ENTRY vs EXIT) */}
                            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-full sm:w-auto">
                                <button
                                    onClick={() => { setActionType("ENTRY"); setQrToken(""); setError(""); localStorage.removeItem(STORAGE_KEY); }}
                                    disabled={!!qrToken}
                                    className={`flex-1 px-4 py-2 rounded-md text-xs font-bold transition-all ${actionType === "ENTRY" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 hover:text-gray-700"} ${!!qrToken && "opacity-50 cursor-not-allowed"}`}
                                >
                                    Check In
                                </button>
                                <button
                                    onClick={() => { setActionType("EXIT"); setQrToken(""); setError(""); localStorage.removeItem(STORAGE_KEY); }}
                                    disabled={!!qrToken}
                                    className={`flex-1 px-4 py-2 rounded-md text-xs font-bold transition-all ${actionType === "EXIT" ? "bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm" : "text-gray-500 hover:text-gray-700"} ${!!qrToken && "opacity-50 cursor-not-allowed"}`}
                                >
                                    Check Out
                                </button>
                            </div>
                        </div>

                        <p className="text-gray-600 dark:text-slate-400 mb-6 transition-colors text-sm">
                            Generate a secure QR code and hold your screen up to the turnstile scanner.
                        </p>

                        {/* STATUS MESSAGES */}
                        {error && !qrToken && (
                            <div className="w-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold border border-red-200 dark:border-red-800 transition-colors mb-4 text-sm text-left">
                                {error}
                            </div>
                        )}

                        {accessGranted && (
                            <div className="w-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl font-bold border border-emerald-200 dark:border-emerald-800 transition-colors animate-pulse mb-4">
                                ✅ {scanMessage}
                            </div>
                        )}

                        {/* MANUAL GENERATE BUTTON */}
                        {!qrToken && !accessGranted && (
                            <button
                                onClick={() => void handleGenerateQr()}
                                disabled={isGenerating || cooldownLeft > 0}
                                className={`w-full text-white font-black py-4 px-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 ${
                                    cooldownLeft > 0
                                        ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-80"
                                        : actionType === "ENTRY"
                                            ? "bg-blue-600 hover:bg-blue-700"
                                            : "bg-rose-600 hover:bg-rose-700"
                                }`}
                            >
                                {isGenerating
                                    ? "Generating..."
                                    : cooldownLeft > 0
                                        ? `Wait ${cooldownLeft}s`
                                        : `Generate ${actionType} Code`
                                }
                            </button>
                        )}

                        {/* TIMER */}
                        {qrToken && !accessGranted && (
                            <div className={`w-full flex justify-between items-center px-5 py-4 rounded-xl font-bold text-sm border transition-colors ${
                                actionType === "ENTRY"
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/50"
                                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/50"
                            }`}>
                                <span className="flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${actionType === "ENTRY" ? "bg-blue-400" : "bg-rose-400"}`}></span>
                                      <span className={`relative inline-flex rounded-full h-3 w-3 ${actionType === "ENTRY" ? "bg-blue-500" : "bg-rose-500"}`}></span>
                                    </span>
                                    Code active
                                </span>
                                <span className="text-xl font-black tabular-nums">
                                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* QR CODE DISPLAY AREA */}
                    <div className="relative bg-white dark:bg-slate-100 p-4 rounded-2xl shadow-md border-4 border-gray-100 dark:border-slate-700 transition-colors flex items-center justify-center h-[230px] w-[230px] shrink-0 overflow-hidden">

                        {accessGranted ? (
                            <div className="flex flex-col items-center animate-bounce z-10">
                                <span className="text-6xl">🔓</span>
                                <span className="text-emerald-600 font-black mt-2 text-xl tracking-tight">OPEN</span>
                            </div>
                        ) : qrToken ? (
                            <div className="z-10 animate-in fade-in zoom-in duration-300">
                                <QRCodeSVG
                                    value={qrToken}
                                    size={190}
                                    fgColor={actionType === "ENTRY" ? "#0f172a" : "#9f1239"}
                                />
                            </div>
                        ) : (
                            // SLEEK PLACEHOLDER UI (Replaces the ugly emoji)
                            <>
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 filter blur-[2px] pointer-events-none">
                                    <QRCodeSVG value="https://fitpass.example/placeholder" size={190} fgColor="#000000" />
                                </div>
                                <div className="z-10 flex flex-col items-center justify-center">
                                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                                        <span className="font-bold text-sm text-gray-500 dark:text-gray-400 tracking-wide uppercase">
                                            Code Inactive
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* QUICK LINKS FOR STAFF */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isWorker && (
                    <Link to="/worker/dashboard" className="bg-gradient-to-br from-gray-800 to-gray-900 dark:from-slate-800 dark:to-slate-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-slate-800 flex flex-col justify-center">
                        <h3 className="font-bold text-lg mb-1">Desk Worker Panel</h3>
                        <p className="text-gray-300 text-sm">Verify user statuses and manually open doors.</p>
                    </Link>
                )}
                {isTrainer && (
                    <Link to="/trainer/clients" className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-700 dark:to-blue-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-blue-900 flex flex-col justify-center">
                        <h3 className="font-bold text-lg mb-1">My Clients</h3>
                        <p className="text-blue-100 text-sm">Manage pending coaching requests and active clients.</p>
                    </Link>
                )}
            </div>
        </div>
    );
}