import { useEffect, useState } from "react";
import axios from "axios";
import { api } from "../../api/axios";

interface UserInfo {
    first_name: string;
    last_name: string;
    email: string;
}

interface Appointment {
    id: number;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
    client: UserInfo;
}

export default function TrainerAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionNotes, setActionNotes] = useState<{ [key: number]: string }>({});

    const fetchAppointments = async () => {
        try {
            const res = await api.get("/coaching/appointments/trainer");
            setAppointments(res.data);
        } catch {
            setError("Failed to load appointments.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchAppointments();
    }, []);

    const handleUpdateStatus = async (id: number, status: string) => {
        try {
            await api.put(`/coaching/appointments/${id}`, {
                status: status,
                notes: actionNotes[id] || null,
            });
            await fetchAppointments();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to update appointment.");
            }
        }
    };

    if (loading) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading schedule...</div>;
    }

    return (
        <div className="max-w-5xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    My Schedule
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Manage your upcoming training sessions with clients.
                </p>
            </div>

            {error && (
                <div className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 p-4 rounded-xl font-bold text-sm border border-red-200 dark:border-red-800">
                    {error}
                </div>
            )}

            {appointments.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-8 rounded-2xl text-center text-gray-500 dark:text-slate-400 shadow-sm transition-colors duration-200">
                    You have no scheduled appointments.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {appointments.map((appt) => (
                        <div
                            key={appt.id}
                            className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-colors duration-200"
                        >
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center font-bold text-lg">
                                            {appt.client?.first_name?.charAt(0) || "C"}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                                Client: {appt.client?.first_name} {appt.client?.last_name}
                                            </h3>
                                            <p className="text-xs text-gray-400">{appt.client?.email}</p>
                                        </div>
                                    </div>

                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                            appt.status === "SCHEDULED"
                                                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                                                : appt.status === "COMPLETED"
                                                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                                    : "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                                        }`}
                                    >
                                        {appt.status}
                                    </span>
                                </div>

                                <div className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-800 text-sm text-gray-700 dark:text-gray-300 flex flex-col gap-1">
                                    <p>
                                        <strong>Date:</strong> {new Date(appt.start_time).toLocaleDateString()}
                                    </p>
                                    <p>
                                        <strong>Time:</strong>{" "}
                                        {new Date(appt.start_time).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}{" "}
                                        -{" "}
                                        {new Date(appt.end_time).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            </div>

                            {appt.status === "SCHEDULED" && (
                                <div className="mt-4 flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
                                    <input
                                        type="text"
                                        placeholder="Add feedback/notes (optional)..."
                                        value={actionNotes[appt.id] || ""}
                                        onChange={(e) =>
                                            setActionNotes({ ...actionNotes, [appt.id]: e.target.value })
                                        }
                                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => void handleUpdateStatus(appt.id, "COMPLETED")}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition"
                                        >
                                            Complete
                                        </button>
                                        <button
                                            onClick={() => void handleUpdateStatus(appt.id, "CANCELLED")}
                                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-xs transition"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {appt.notes && (
                                <div className="mt-4 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                                    <strong className="block mb-1">Feedback:</strong> "{appt.notes}"
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}