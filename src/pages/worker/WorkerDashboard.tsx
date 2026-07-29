import { useState } from "react";
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

export default function WorkerDashboard() {
    const [userId, setUserId] = useState<string>("");
    const [locationId, setLocationId] = useState<number>(3);
    const [statusData, setStatusData] = useState<StatusResponse | null>(null);

    const [loadingCheck, setLoadingCheck] = useState(false);
    const [loadingOverride, setLoadingHoverride] = useState(false);

    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

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
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "User not found or request failed.");
            } else {
                setError("An error occurred.");
            }
        } finally {
            setLoadingCheck(false);
        }
    };

    const handleManualOverride = async () => {
        if (!userId) return;
        setError("");
        setSuccessMsg("");
        setLoadingHoverride(true);

        try {
            const res = await api.post(`/worker/manual-entry/${userId}?location_id=${locationId}`);
            setSuccessMsg(res.data.message || "Door opened successfully!");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to open door.");
            } else {
                setError("An error occurred.");
            }
        } finally {
            setLoadingHoverride(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                        Desk Worker Panel
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                        Verify subscriptions and perform manual door overrides.
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex items-center gap-3">
                    <label className="text-xs font-bold text-gray-600 dark:text-slate-300">My Gym Location ID:</label>
                    <input
                        type="number"
                        value={locationId}
                        onChange={(e) => setLocationId(parseInt(e.target.value) || 1)}
                        className="w-16 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-1 text-center font-bold rounded-xl text-sm"
                    />
                </div>
            </div>

            {/* CHECK STATUS FORM */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <form onSubmit={(e) => void handleCheckStatus(e)} className="flex flex-col gap-4">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                        Enter Member ID
                    </label>

                    <div className="flex gap-4">
                        <input
                            type="number"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="e.g. 105"
                            required
                            className="flex-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg font-semibold"
                        />
                        <button
                            type="submit"
                            disabled={loadingCheck}
                            className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
                        >
                            {loadingCheck ? "Checking..." : "Check Status"}
                        </button>
                    </div>
                </form>

                {error && <div className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 p-4 rounded-xl mt-6 font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}
                {successMsg && <div className="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 p-4 rounded-xl mt-6 font-bold text-sm border border-green-200 dark:border-green-800">{successMsg}</div>}

                {/* USER STATUS RESULT DISPLAY */}
                {statusData && (
                    <div className="mt-8 border-t border-gray-100 dark:border-slate-800 pt-6 flex flex-col gap-6">
                        <div className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                            statusData.has_active_subscription
                                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200"
                                : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
                        }`}>
                            <div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block mb-2 ${
                                    statusData.has_active_subscription ? "bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100" : "bg-rose-200 dark:bg-rose-800 text-rose-800 dark:text-rose-100"
                                }`}>
                                    {statusData.has_active_subscription ? "ACTIVE SUBSCRIPTION 🟢" : "NO ACTIVE SUBSCRIPTION 🔴"}
                                </span>
                                <h2 className="text-2xl font-black">{statusData.full_name}</h2>
                                <p className="text-sm opacity-80">{statusData.email}</p>

                                {statusData.has_active_subscription && (
                                    <div className="mt-3 text-sm font-semibold flex flex-wrap gap-4">
                                        <span>Plan: <strong>{statusData.plan_name}</strong></span>
                                        <span>Days Left: <strong>{statusData.days_left} days</strong></span>
                                    </div>
                                )}
                            </div>

                            {/* MANUAL OVERRIDE BUTTON */}
                            <button
                                onClick={() => void handleManualOverride()}
                                disabled={loadingOverride}
                                className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold px-6 py-3 rounded-xl hover:bg-black dark:hover:bg-white transition shadow-md whitespace-nowrap self-stretch md:self-auto disabled:opacity-50"
                            >
                                {loadingOverride ? "Opening..." : "🔓 Manual Door Override"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}