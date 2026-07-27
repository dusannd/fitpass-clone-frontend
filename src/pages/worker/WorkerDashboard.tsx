import { useState, type FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface UserStatus {
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
    const [userIdInput, setUserIdInput] = useState("");

    // NOVO: Radnik može da menja na kojoj je lokaciji (ti si rekao da je 3 aktivna)
    const [currentLocationId, setCurrentLocationId] = useState<number>(3);

    const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const handleCheckStatus = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setUserStatus(null);
        setLoading(true);

        try {
            const res = await api.get(`/worker/user/${userIdInput}/status`);
            setUserStatus(res.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to find user.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleManualOverride = async () => {
        if (!userStatus) return;
        setError("");
        setSuccessMsg("");

        try {
            // Šaljemo izabranu lokaciju sa frontenda na backend
            const res = await api.post(`/worker/manual-entry/${userStatus.user_id}?location_id=${currentLocationId}`);
            setSuccessMsg(res.data.message || "Door manually opened!");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to open door. Does this location ID exist?");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Desk Worker Panel</h1>
                    <p className="text-gray-600 mt-2">Verify subscriptions and perform manual door overrides.</p>
                </div>

                {/* SETOVANJE LOKACIJE RADNIKA */}
                <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg text-sm flex items-center gap-2">
                    <label className="font-bold text-blue-800">My Gym Location ID:</label>
                    <input
                        type="number"
                        min="1"
                        value={currentLocationId}
                        onChange={(e) => setCurrentLocationId(parseInt(e.target.value))}
                        className="w-16 p-1 rounded border border-blue-300 text-center font-bold"
                    />
                </div>
            </div>

            {/* SEARCH FORM */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <form onSubmit={(e) => void handleCheckStatus(e)} className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Enter Member ID</label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={userIdInput}
                            onChange={(e) => setUserIdInput(e.target.value)}
                            placeholder="e.g. 105"
                            className="w-full border border-gray-300 p-3 rounded focus:ring-2 focus:ring-blue-500 text-lg"
                        />
                    </div>
                    <button type="submit" disabled={loading} className="bg-blue-600 text-white font-bold py-3 px-8 rounded hover:bg-blue-700 transition">
                        {loading ? "Checking..." : "Check Status"}
                    </button>
                </form>
                {error && <div className="mt-4 bg-red-100 text-red-700 p-3 rounded font-bold text-sm">{error}</div>}
                {successMsg && <div className="mt-4 bg-green-100 text-green-700 p-3 rounded font-bold text-sm">{successMsg}</div>}
            </div>

            {/* STATUS RESULT CARD */}
            {userStatus && (
                <div className={`rounded-lg shadow-sm p-6 border-2 flex flex-col md:flex-row justify-between items-center gap-6 ${
                    userStatus.has_active_subscription ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl font-bold text-gray-800">{userStatus.full_name}</h2>
                            <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1 rounded">ID: {userStatus.user_id}</span>
                        </div>
                        <p className="text-gray-600 mb-4">{userStatus.email}</p>

                        {userStatus.has_active_subscription ? (
                            <div className="text-green-800 font-bold">
                                <p className="text-lg">✅ Active: {userStatus.plan_name}</p>
                                <p className="text-sm font-normal">Expires in: {userStatus.days_left} days</p>
                            </div>
                        ) : (
                            <div className="text-red-800 font-bold">
                                <p className="text-lg">❌ {userStatus.message}</p>
                            </div>
                        )}
                    </div>

                    <div className="w-full md:w-auto flex flex-col gap-2">
                        <button
                            onClick={() => void handleManualOverride()}
                            className="bg-gray-900 text-white font-bold py-4 px-8 rounded-lg hover:bg-black transition shadow-md"
                        >
                            🚨 MANUAL OVERRIDE <br/><span className="text-sm font-normal">(Open Door)</span>
                        </button>
                        <p className="text-xs text-center text-gray-500">Action logged at Location {currentLocationId}</p>
                    </div>
                </div>
            )}
        </div>
    );
}