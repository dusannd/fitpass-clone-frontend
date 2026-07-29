import { useEffect, useState } from "react";
import axios from "axios";
import { api } from "../../api/axios";

interface ClientInfo {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

interface CoachingLink {
    id: number;
    client_id: number;
    status: string;
    created_at: string;
    client: ClientInfo;
}

export default function TrainerClients() {
    const [requests, setRequests] = useState<CoachingLink[]>([]);
    const [activeClients, setActiveClients] = useState<CoachingLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const fetchData = async () => {
        try {
            const [pendingRes, activeRes] = await Promise.all([
                api.get("/coaching/requests"),
                api.get("/coaching/clients"),
            ]);
            setRequests(pendingRes.data);
            setActiveClients(activeRes.data);
        } catch {
            setError("Failed to load coaching data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, []);

    const handleResponse = async (linkId: number, status: "ACCEPTED" | "REJECTED") => {
        setError("");
        setSuccessMsg("");
        try {
            await api.put(`/coaching/requests/${linkId}`, { status });
            setSuccessMsg(`Request successfully ${status.toLowerCase()}!`);
            await fetchData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Action failed.");
            } else {
                setError("An error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading clients...</div>;

    return (
        <div className="max-w-5xl mx-auto flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Client Management
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Review incoming coaching requests and view your active personal training clients.
                </p>
            </div>

            {error && <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}
            {successMsg && <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 p-4 rounded-xl font-bold text-sm border border-green-200 dark:border-green-800">{successMsg}</div>}

            {/* PENDING REQUESTS CARD */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Pending Requests</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Members who want you to be their personal trainer.</p>

                {requests.length === 0 ? (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic py-4">No pending requests at the moment.</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {requests.map((req) => (
                            <div key={req.id} className="bg-gray-50 dark:bg-slate-800/60 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">
                                        {req.client?.first_name?.charAt(0) || "C"}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-base">
                                            {req.client?.first_name} {req.client?.last_name}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{req.client?.email}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => void handleResponse(req.id, "ACCEPTED")}
                                        className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition shadow-sm"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => void handleResponse(req.id, "REJECTED")}
                                        className="flex-1 sm:flex-none bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/60 text-xs font-bold py-2 px-4 rounded-lg transition"
                                    >
                                        Decline
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ACTIVE CLIENTS CARD */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">My Active Clients</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Members you are currently coaching.</p>

                {activeClients.length === 0 ? (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic py-4">You don't have any active clients yet.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeClients.map((link) => (
                            <div key={link.id} className="bg-gray-50 dark:bg-slate-800/60 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center gap-3">
                                <div className="h-10 w-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-sm">
                                    {link.client?.first_name?.charAt(0) || "C"}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-base">
                                        {link.client?.first_name} {link.client?.last_name}
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{link.client?.email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}