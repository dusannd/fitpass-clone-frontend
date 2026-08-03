import { useEffect, useState, useRef, useCallback } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import axios from "axios";
import { api } from "../api/axios";
import type { User } from "../components/Layout";

const WS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/^http/, 'ws');

export default function Dashboard() {
    const user = useOutletContext<User>();

    const isMember = user.roles.some(r => r.name === "member");
    const isWorker = user.roles.some(r => r.name === "worker");
    const isTrainer = user.roles.some(r => r.name === "trainer");

    const [qrToken, setQrToken] = useState<string>("");
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [error, setError] = useState("");
    const [actionType, setActionType] = useState<"ENTRY" | "EXIT">("ENTRY");
    const [accessGranted, setAccessGranted] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string>("");

    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // --- 1. FETCH QR CODE ---
    const fetchQr = useCallback(async (currentAction: string) => {
        try {
            const res = await api.post("/access/generate", { action_type: currentAction });
            setQrToken(res.data.qr_token);
            setTimeLeft(res.data.expires_in_seconds || 60);
            setError("");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to generate access token.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    }, []);

    // --- 2. WEBSOCKET CONNECTION ---
    useEffect(() => {
        if (!isMember) return;

        const ws = new WebSocket(`${WS_BASE_URL}/access/ws`);
        wsRef.current = ws;

        ws.onopen = () => console.log("WebSocket connected!");

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "ACCESS_EVENT") {
                if (data.access_granted) {
                    setAccessGranted(true);
                    setScanMessage(`Access Granted: ${data.reason}`);
                    if (timerRef.current) clearInterval(timerRef.current);

                    setTimeout(() => {
                        setAccessGranted(false);
                        setScanMessage("");
                        void fetchQr(actionType);
                    }, 5000);
                } else {
                    setError(`Scanned & Denied: ${data.reason}`);
                }
            }
        };

        ws.onclose = () => console.log("WebSocket disconnected.");

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };
    }, [isMember, actionType, fetchQr]);

    // --- 3. COUNTDOWN TIMER ---
    useEffect(() => {
        if (!isMember || accessGranted) return;

        let isMounted = true;

        const loadInitialQr = async () => {
            if (isMounted) {
                await fetchQr(actionType);
            }
        };

        void loadInitialQr();

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    void fetchQr(actionType);
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            isMounted = false;
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isMember, actionType, accessGranted, fetchQr]);

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

            {/* MEMBER SECTION - DYNAMIC QR CODE & ANTI-PASSBACK */}
            {isMember && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-8 justify-center text-center md:text-left transition-colors duration-200">
                    <div className="flex-1 w-full">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white transition-colors">Gym Access</h2>

                            {/* ACTION TYPE TOGGLE (ENTRY vs EXIT) */}
                            <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                                <button
                                    onClick={() => setActionType("ENTRY")}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${actionType === "ENTRY" ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    Check In
                                </button>
                                <button
                                    onClick={() => setActionType("EXIT")}
                                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${actionType === "EXIT" ? "bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    Check Out
                                </button>
                            </div>
                        </div>

                        <p className="text-gray-600 dark:text-slate-400 mb-6 transition-colors">
                            Hold your phone up to the turnstile scanner. Do not share this code.
                        </p>

                        {error ? (
                            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold border border-red-200 dark:border-red-800 transition-colors">
                                {error}
                            </div>
                        ) : accessGranted ? (
                            <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl font-bold border border-emerald-200 dark:border-emerald-800 transition-colors animate-pulse">
                                ✅ {scanMessage}
                            </div>
                        ) : (
                            <div className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-4 py-2 rounded-full font-bold text-sm border border-blue-100 dark:border-blue-800 transition-colors">
                                Valid for: <span className="text-red-600 dark:text-red-400 text-lg">{timeLeft}s</span>
                            </div>
                        )}
                    </div>

                    {/* QR CODE RENDERER OR SUCCESS ANIMATION */}
                    <div className="bg-white dark:bg-slate-100 p-4 rounded-2xl shadow-md border-4 border-gray-100 dark:border-slate-700 transition-colors flex items-center justify-center min-h-[230px] min-w-[230px]">
                        {accessGranted ? (
                            <div className="flex flex-col items-center animate-bounce">
                                <span className="text-7xl">🔓</span>
                                <span className="text-emerald-600 font-black mt-2 text-xl tracking-tight">OPEN</span>
                            </div>
                        ) : qrToken ? (
                            <QRCodeSVG
                                value={qrToken}
                                size={200}
                                fgColor={actionType === "ENTRY" ? "#0f172a" : "#9f1239"} // Dark blue for Entry, Dark Red for Exit
                            />
                        ) : (
                            <span className="text-gray-400 font-bold">Loading...</span>
                        )}
                    </div>
                </div>
            )}

            {/* QUICK LINKS FOR STAFF */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isWorker && (
                    <Link to="/worker/dashboard" className="bg-gradient-to-br from-gray-800 to-gray-900 dark:from-slate-800 dark:to-slate-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-slate-800">
                        <h3 className="font-bold text-lg mb-1">Desk Worker Panel</h3>
                        <p className="text-gray-300 text-sm">Verify user statuses and manually open doors.</p>
                    </Link>
                )}
                {isTrainer && (
                    <Link to="/trainer/clients" className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-700 dark:to-blue-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-blue-900">
                        <h3 className="font-bold text-lg mb-1">My Clients</h3>
                        <p className="text-blue-100 text-sm">Manage pending coaching requests and active clients.</p>
                    </Link>
                )}
            </div>
        </div>
    );
}