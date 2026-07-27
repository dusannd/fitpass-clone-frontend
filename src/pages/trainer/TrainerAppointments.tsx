import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface UserInfo {
    first_name: string;
    last_name: string;
}

interface Appointment {
    id: number;
    client: UserInfo;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
}

export default function TrainerAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [activeApptId, setActiveApptId] = useState<number | null>(null);
    const [notes, setNotes] = useState("");

    const refreshAppointments = useCallback(async () => {
        try {
            const res = await api.get("/coaching/appointments/trainer");
            setAppointments(res.data);
        } catch {
            setError("Failed to refresh schedule.");
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const fetchInitialAppointments = async () => {
            try {
                const res = await api.get("/coaching/appointments/trainer");
                if (isMounted) {
                    setAppointments(res.data);
                }
            } catch {
                if (isMounted) {
                    setError("Failed to load appointments.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void fetchInitialAppointments();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleUpdateStatus = async (id: number, status: "COMPLETED" | "CANCELLED") => {
        try {
            await api.put(`/coaching/appointments/${id}`, {
                status: status,
                notes: notes
            });
            setActiveApptId(null);
            setNotes("");
            await refreshAppointments();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to update status");
            } else {
                alert("An unexpected error occurred");
            }
        }
    };

    if (loading) return <div className="p-6">Loading schedule...</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">My Schedule</h1>
            <p className="text-gray-600 mb-8">Manage your upcoming training sessions with clients.</p>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-6 font-bold">{error}</div>}

            {appointments.length === 0 ? (
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 text-center text-gray-500">
                    No appointments scheduled yet.
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {appointments.map((appt) => (
                        <div key={appt.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between md:items-center gap-4">

                            {/* INFO */}
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">
                                    Client: {appt.client?.first_name} {appt.client?.last_name}
                                </h3>
                                <p className="text-sm text-gray-600">
                                    🗓️ {new Date(appt.start_time).toLocaleDateString()} | 🕒 {new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(appt.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                                    Status: <span className={`${appt.status === "SCHEDULED" ? "text-blue-600" : appt.status === "COMPLETED" ? "text-green-600" : "text-red-600"}`}>{appt.status}</span>
                                </p>
                                {appt.notes && (
                                    <p className="mt-2 text-sm italic text-gray-600 border-l-2 border-gray-300 pl-2">
                                        Note: {appt.notes}
                                    </p>
                                )}
                            </div>

                            {/* ACTIONS */}
                            {appt.status === "SCHEDULED" && (
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                    {activeApptId === appt.id ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                                placeholder="Write session notes..."
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={() => void handleUpdateStatus(appt.id, "COMPLETED")} className="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded flex-1 hover:bg-green-700">Save</button>
                                                <button onClick={() => setActiveApptId(null)} className="bg-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded hover:bg-gray-300">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setActiveApptId(appt.id)}
                                                className="bg-blue-50 text-blue-700 border border-blue-200 text-sm font-bold px-4 py-2 rounded flex-1 hover:bg-blue-100 transition"
                                            >
                                                Complete
                                            </button>
                                            <button
                                                onClick={() => void handleUpdateStatus(appt.id, "CANCELLED")}
                                                className="bg-red-50 text-red-700 border border-red-200 text-sm font-bold px-4 py-2 rounded hover:bg-red-100 transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}