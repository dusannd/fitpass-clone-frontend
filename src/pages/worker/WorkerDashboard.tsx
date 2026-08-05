import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { api } from "../../api/axios";

interface StatusResponse {
    user_id: number;
    full_name: string;
    email: string;
    has_active_subscription: boolean;
    plan_name?: string;
    days_left?: number;
    expires_on?: string;
    message: string;
}

interface InsideUser {
    user_id: number;
    full_name: string;
    email: string;
    entered_at: string;
}

export default function WorkerDashboard() {
    const [userId, setUserId] = useState<string>("");
    const [locationId, setLocationId] = useState<number>(3);
    const [statusData, setStatusData] = useState<StatusResponse | null>(null);

    const [loadingCheck, setLoadingCheck] = useState(false);
    const [loadingOverride, setLoadingHoverride] = useState(false);

    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // --- CURRENTLY INSIDE STATE ---
    const [insideUsers, setInsideUsers] = useState<InsideUser[]>([]);
    const [loadingInside, setLoadingInside] = useState(true);

    const fetchInsideUsers = useCallback(async () => {
        try {
            const res = await api.get("/worker/currently-inside");
            setInsideUsers(res.data);
        } catch (err) {
            console.error("Failed to fetch inside users", err);
        } finally {
            setLoadingInside(false);
        }
    }, []);

    useEffect(() => {
        void fetchInsideUsers();
        // Refresh table every 10 seconds to keep live durations accurate
        const interval = setInterval(fetchInsideUsers, 10000);
        return () => clearInterval(interval);
    }, [fetchInsideUsers]);

    const handleForceCheckout = async (targetId: number, name: string) => {
        if (!confirm(`Are you sure you want to force checkout ${name}?`)) return;
        try {
            await api.post(`/worker/force-checkout/${targetId}`);
            alert(`${name} checked out successfully.`);
            void fetchInsideUsers(); // Refresh table immediately
        } catch {
            alert("Failed to force checkout.");
        }
    };

    const handleCheckStatus = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setStatusData(null);
        if (!userId) return;
        setLoadingCheck(true);
        try {
            const res = await api.get(`/worker/user/${userId}/status`);
            setStatusData(res.data as StatusResponse);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) setError(err.response?.data?.detail || "User not found.");
            else setError("An error occurred.");
        } finally {
            setLoadingCheck(false);
        }
    };

    const handleManualOverride = async () => {
        if (!userId) return;
        setLoadingHoverride(true);
        try {
            const res = await api.post(`/worker/manual-entry/${userId}?location_id=${locationId}`);
            setSuccessMsg(res.data.message || "Door opened successfully!");
            void fetchInsideUsers(); // Refresh attendance list immediately after manual override
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) setError(err.response?.data?.detail || "Failed to open door.");
        } finally {
            setLoadingHoverride(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* --- LEFT PANEL: MANUAL CHECK & OVERRIDE --- */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Desk Worker Panel</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">Verify subscriptions and perform overrides.</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800">
                        <form onSubmit={(e) => void handleCheckStatus(e)} className="flex flex-col gap-4">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Enter Member ID</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500">Location ID:</span>
                                    <input type="number" value={locationId} onChange={(e) => setLocationId(parseInt(e.target.value) || 1)} className="w-12 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-center rounded text-xs p-1"/>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <input type="number" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. 105" required className="flex-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold" />
                                <button type="submit" disabled={loadingCheck} className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-sm">{loadingCheck ? "Checking..." : "Check"}</button>
                            </div>
                        </form>

                        {error && <div className="bg-red-100 text-red-700 p-4 rounded-xl mt-6 font-bold text-sm border border-red-200">{error}</div>}
                        {successMsg && <div className="bg-green-100 text-green-700 p-4 rounded-xl mt-6 font-bold text-sm border border-green-200">{successMsg}</div>}

                        {statusData && (
                            <div className="mt-8 border-t border-gray-100 dark:border-slate-800 pt-6 flex flex-col gap-6">
                                <div className={`p-6 rounded-2xl border flex flex-col items-start gap-4 ${
                                    statusData.has_active_subscription
                                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                                        : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
                                }`}>
                                    <div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block mb-2 ${statusData.has_active_subscription ? "bg-emerald-200 text-emerald-800" : "bg-rose-200 text-rose-800"}`}>
                                            {statusData.has_active_subscription ? "ACTIVE SUBSCRIPTION 🟢" : "NO ACTIVE SUBSCRIPTION 🔴"}
                                        </span>
                                        <h2 className="text-2xl font-black">{statusData.full_name}</h2>
                                        <p className="text-sm opacity-80">{statusData.email}</p>
                                    </div>
                                    <button onClick={() => void handleManualOverride()} disabled={loadingOverride} className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold px-6 py-3 rounded-xl hover:bg-black transition shadow-md">
                                        {loadingOverride ? "Opening..." : "🔓 Manual Door Override"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- RIGHT PANEL: CURRENTLY INSIDE LIST --- */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col h-[500px]">
                    <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Live Attendance</h2>
                            <p className="text-xs text-gray-500">Members currently inside the gym.</p>
                        </div>
                        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 font-black px-3 py-1 rounded-full text-sm">
                            {insideUsers.length} Active
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {loadingInside ? (
                            <p className="text-gray-500 text-center mt-10 font-bold">Loading live data...</p>
                        ) : insideUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <span className="text-4xl mb-2">👻</span>
                                <p>The gym is completely empty.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {insideUsers.map((user) => {
                                    // Calculate time spent inside prior to render
                                    const diff = Date.now() - new Date(user.entered_at).getTime();
                                    const mins = Math.floor(diff / 60000);

                                    return (
                                        <div key={user.user_id} className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex justify-between items-center group transition hover:border-blue-300">
                                            <div>
                                                <h3 className="font-bold text-sm text-gray-900 dark:text-white">{user.full_name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-500">ID: {user.user_id}</span>
                                                    <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                                                    <span className={`text-xs font-bold ${mins > 120 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                        {mins > 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`} inside
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => void handleForceCheckout(user.user_id, user.full_name)}
                                                className="opacity-0 group-hover:opacity-100 transition bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold py-2 px-3 rounded-lg"
                                            >
                                                Force Exit
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}