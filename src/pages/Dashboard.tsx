import { useEffect, useState, useRef, useCallback } from "react";
import { useOutletContext, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import axios from "axios";
import { api } from "../api/axios";
import Avatar from "../components/Avatar";
import { useGymWebSocket, type GymWsMessage } from "../hooks/useGymWebSocket";
import { parseGoals, getPrimaryAccent } from "../utils/profile";
import type { User } from "../components/Layout";

const WS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/^http/, 'ws');
const STORAGE_KEY = "fitpass_qr_state";

interface QrState {
    token: string;
    expiresAt: number;
    actionType: "ENTRY" | "EXIT";
    cooldownEndsAt: number;
}

// GET /access/my-status. Mirrors the backend Pydantic schema 1:1 - entered_at is
// null whenever the member is OUTSIDE, so it has to be nullable here too.
interface AccessStatus {
    status: "INSIDE" | "OUTSIDE";
    entered_at: string | null;
}

// The turnstile event the backend pushes over the socket. The hook hands
// messages back as `unknown` because it does not know or care what this app
// sends, so we narrow them here, once, at the point of use.
interface AccessEvent {
    type: "ACCESS_EVENT";
    access_granted: boolean;
    action_type: "ENTRY" | "EXIT";
    reason?: string;
}

const isAccessEvent = (value: unknown): value is AccessEvent =>
    typeof value === "object"
    && value !== null
    && (value as { type?: unknown }).type === "ACCESS_EVENT";

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
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const isMember = user.roles.some(r => r.name === "member");
    const isWorker = user.roles.some(r => r.name === "worker");
    const isTrainer = user.roles.some(r => r.name === "trainer");

    // --- PROFILE SUMMARY ---
    const myGoals = parseGoals(user.profile?.fitness_goals);
    const hasProfileInfo = Boolean(user.profile?.bio || myGoals.length > 0);
    const accent = getPrimaryAccent(user.roles.map(r => r.name));

    // --- STRIPE CHECKOUT SUCCESS HANDLING ---
    // Read the flag from the URL during the initial render (lazy initializer)
    // rather than setting it inside the effect below, so mounting doesn't
    // trigger an extra synchronous state update/re-render.
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(
        () => searchParams.get("payment") === "success"
    );

    useEffect(() => {
        if (!showPaymentSuccess) return;

        // CRITICAL: The Stripe webhook that activates the subscription can land
        // slightly after the browser redirect back here. Invalidate the cached
        // user profile so Layout/Dashboard refetch and pick up the new
        // subscription instead of showing stale "no active plan" state.
        void queryClient.invalidateQueries({ queryKey: ["userProfile"] });

        navigate("/dashboard", { replace: true });

        const timeoutId = setTimeout(() => setShowPaymentSuccess(false), 6000);
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- REAL-TIME STATUS STATE ---
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

    // Tells a first connection apart from a recovery. Only the latter needs a
    // resync (see effect 5).
    const hasConnectedRef = useRef(false);

    // --- 1. FETCH PHYSICAL STATUS ---
    // Is the member currently inside the gym, and since when. The whole QR panel
    // below keys off this: OUTSIDE offers an ENTRY code, INSIDE an EXIT one.
    const { data: accessStatus, refetch: refetchStatus } = useQuery({
        queryKey: ["access", "my-status"],
        queryFn: async () => {
            const res = await api.get<AccessStatus>("/access/my-status");
            return res.data;
        },
        // Only members have a physical status; a trainer-only account has nothing
        // to ask about here.
        enabled: isMember,
    });

    // Before the first response lands there is no honest answer yet, and the panel
    // stays hidden rather than guessing OUTSIDE and offering the wrong QR code.
    const physicalStatus: "INSIDE" | "OUTSIDE" | "LOADING" = accessStatus?.status ?? "LOADING";
    const enteredAt = accessStatus?.entered_at ?? null;

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

    // --- 4. LIVE TURNSTILE FEED ---
    // This used to be a hand-rolled `new WebSocket` in an effect right here. That
    // version died permanently on the first network hiccup - and a phone handing
    // off from mobile data to the gym WiFi is exactly that. useGymWebSocket keeps
    // the same message handling but reconnects itself with exponential backoff.
    //
    // The handler body below is unchanged from the old ws.onmessage. It stays a
    // callback rather than an effect on purpose: reacting to a door opening is an
    // event, not state to synchronise, and running these setState calls from an
    // effect body would cascade renders.
    const handleAccessEvent = (message: GymWsMessage) => {
        if (!isAccessEvent(message.data)) return;

        const data = message.data;

        // Worker-initiated admin actions (manual override / force checkout) must
        // instantly resync the UI, even if a QR flow was mid-flight.
        if (typeof data.reason === "string" && (data.reason.includes("Manual Override") || data.reason.includes("Force Checkout"))) {
            setQrToken("");
            setTimeLeft(0);
            localStorage.removeItem(STORAGE_KEY);
            void refetchStatus();
        }

        if (data.access_granted) {
            setAccessGranted(true);
            setScanMessage(data.action_type === "ENTRY" ? "Welcome in!" : "Goodbye!");

            // Instantly clear QR code
            setQrToken("");
            setTimeLeft(0);
            localStorage.removeItem(STORAGE_KEY);

            // Refresh physical state (Transforms Check-In to Check-Out UI)
            void refetchStatus();

            setTimeout(() => {
                setAccessGranted(false);
                setScanMessage("");
            }, 4000);
        } else {
            setError(`Denied: ${data.reason}`);
        }
    };

    const { status: wsStatus } = useGymWebSocket(
        `${WS_BASE_URL}/access/ws`,
        { enabled: isMember, onMessage: handleAccessEvent },
    );

    // --- 5. RESYNC AFTER A RECOVERED CONNECTION ---
    // Events that fire while the socket is down are gone for good - the backend
    // pushes them to a connection that no longer exists and nothing replays them.
    // So a member could be checked out at the desk during the outage and still see
    // "You are inside" after reconnecting. Refetching once on the way back from a
    // drop closes that gap. The very first connection is skipped, because the
    // status query has already fetched on mount.
    useEffect(() => {
        if (wsStatus !== "OPEN") return;

        // First time we ever connect: the status query already fetched on mount,
        // so a second request here would be pure duplication.
        if (!hasConnectedRef.current) {
            hasConnectedRef.current = true;
            return;
        }

        void refetchStatus();
    }, [wsStatus, refetchStatus]);

    // --- 6. QR GENERATION ---
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
            {/* STRIPE CHECKOUT SUCCESS BANNER */}
            {showPaymentSuccess && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 p-4 rounded-2xl flex items-center gap-3 transition-colors animate-in fade-in duration-300">
                    <p className="text-emerald-800 dark:text-emerald-300 text-sm font-bold">
                        🎉 Subscription activated! It may take a few seconds to appear below.
                    </p>
                </div>
            )}

            {/* WELCOME BANNER */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 flex justify-between items-center transition-colors">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">
                        Welcome back, {user.first_name}! 👋
                    </h1>
                    <p className="text-gray-500 dark:text-slate-400 text-sm">Ready to crush your goals today?</p>
                </div>
            </div>

            {/* MY PROFILE - short summary only, editing happens on /profile */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors">
                <div className="flex items-start gap-4">
                    {/* Same role colored ring as on the profile page */}
                    <div className={`rounded-full ring-2 ${accent.ring} shrink-0`}>
                        <Avatar profile={user.profile} firstName={user.first_name} size="md" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4 mb-2">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">My Profile</h2>
                            <Link
                                to="/profile"
                                className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors shrink-0"
                            >
                                {hasProfileInfo ? "Edit" : "Complete Profile"}
                            </Link>
                        </div>

                        {hasProfileInfo ? (
                            <>
                                {user.profile?.bio && (
                                    <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2 mb-3">
                                        {user.profile.bio}
                                    </p>
                                )}
                                {myGoals.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {myGoals.map((goal, i) => (
                                            <span
                                                key={`${goal}-${i}`}
                                                className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                            >
                                                {goal}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                {isTrainer
                                    ? "Add a bio and your specialties so members can find you."
                                    : "Add your goals and a short bio so trainers know who you are."}
                            </p>
                        )}
                    </div>
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

                        {/* LIVE FEED HEALTH */}
                        {/* Without this the page lies: the socket is dead, but the
                            screen looks exactly like a healthy one. Amber rather
                            than red on purpose - the gym still works, only the
                            instant feedback is missing. */}
                        {wsStatus !== "OPEN" && (
                            <div className="mb-4 inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-4 py-2 rounded-full border border-amber-200 dark:border-amber-800 text-sm font-bold">
                                {wsStatus === "CONNECTING" ? (
                                    <>
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                        </span>
                                        <span>Reconnecting to live feed...</span>
                                    </>
                                ) : (
                                    // CLOSED here means the hook gave up, which only
                                    // happens on close code 1008 - an expired or
                                    // missing session. Retrying cannot fix that.
                                    <>
                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                                        <span>Live feed offline - refresh the page</span>
                                    </>
                                )}
                            </div>
                        )}

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