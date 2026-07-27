import { useEffect, useState, useCallback } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface UserInfo {
    first_name: string;
    last_name: string;
}

interface Appointment {
    id: number;
    trainer_id: number;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
    trainer: UserInfo;
}

interface MyTrainer {
    trainer_id: number;
    status: string;
    trainer: UserInfo;
}

export default function MemberAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [myTrainers, setMyTrainers] = useState<MyTrainer[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Nova razdvojena forma (Datum, Vreme početka, Vreme kraja)
    const [selectedTrainer, setSelectedTrainer] = useState("");
    const [sessionDate, setSessionDate] = useState("");
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("11:00");

    const refreshData = useCallback(async () => {
        try {
            const [apptsRes, trainersRes] = await Promise.all([
                api.get("/coaching/appointments/client"),
                api.get("/coaching/my-trainers")
            ]);

            const fetchedTrainers = trainersRes.data as MyTrainer[];
            const acceptedTrainers = fetchedTrainers.filter((t: MyTrainer) => t.status === "ACCEPTED");

            setAppointments(apptsRes.data);
            setMyTrainers(acceptedTrainers);
        } catch {
            setError("Failed to load appointments.");
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const fetchInitialData = async () => {
            try {
                const [apptsRes, trainersRes] = await Promise.all([
                    api.get("/coaching/appointments/client"),
                    api.get("/coaching/my-trainers")
                ]);

                if (isMounted) {
                    const fetchedTrainers = trainersRes.data as MyTrainer[];
                    const acceptedTrainers = fetchedTrainers.filter((t: MyTrainer) => t.status === "ACCEPTED");

                    setAppointments(apptsRes.data);
                    setMyTrainers(acceptedTrainers);
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

        void fetchInitialData();
        return () => { isMounted = false; };
    }, []);

    const handleSchedule = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");

        try {
            // Spajamo izabrani Datum i Vreme u pravi ISO format za backend
            const startDateTime = new Date(`${sessionDate}T${startTime}:00`).toISOString();
            const endDateTime = new Date(`${sessionDate}T${endTime}:00`).toISOString();

            await api.post("/coaching/appointments", {
                trainer_id: parseInt(selectedTrainer),
                start_time: startDateTime,
                end_time: endDateTime
            });

            setSuccessMsg("Appointment scheduled successfully!");
            // Resetuj samo vremena da bi klijent mogao lako da zakaže sledeći dan
            setStartTime("10:00");
            setEndTime("11:00");

            await refreshData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to schedule.");
            } else {
                setError("An error occurred.");
            }
        }
    };

    // Dobijamo današnji datum u formatu "YYYY-MM-DD" da blokiramo biranje jučerašnjeg dana u HTML-u
    const todayStr = new Date().toISOString().split("T")[0];

    if (loading) return <div className="p-6">Loading...</div>;

    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
            {/* LEFT: BOOKING FORM */}
            <div className="w-full lg:w-1/3">
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 sticky top-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Book a Session</h2>
                    <p className="text-sm text-gray-500 mb-6">Select a date and time. Sessions cannot exceed 3 hours.</p>

                    {successMsg && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm font-bold">{successMsg}</div>}
                    {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm font-bold">{error}</div>}

                    {myTrainers.length === 0 ? (
                        <div className="text-sm text-orange-600 bg-orange-50 p-3 rounded">
                            You don't have an active trainer yet. Go to the Coaching tab to request one!
                        </div>
                    ) : (
                        <form onSubmit={(e) => void handleSchedule(e)} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Select Trainer</label>
                                <select
                                    required
                                    value={selectedTrainer}
                                    onChange={(e) => setSelectedTrainer(e.target.value)}
                                    className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">-- Choose --</option>
                                    {myTrainers.map((t) => (
                                        <option key={t.trainer_id} value={t.trainer_id}>
                                            {t.trainer.first_name} {t.trainer.last_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    min={todayStr} // Zabrana biranja u prošlosti direkt u kalendaru
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        required
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">End Time</label>
                                    <input
                                        type="time"
                                        required
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                    />
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3 rounded hover:bg-black transition mt-4">
                                Confirm Booking
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* RIGHT: MY APPOINTMENTS */}
            <div className="w-full lg:w-2/3">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">My Schedule</h2>
                {appointments.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 text-center text-gray-500">
                        You have no upcoming appointments.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {appointments.map((appt) => (
                            <div key={appt.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">
                                                {appt.trainer?.first_name.charAt(0)}
                                            </div>
                                            <h3 className="font-bold text-lg text-gray-800">
                                                {appt.trainer?.first_name} {appt.trainer?.last_name}
                                            </h3>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                            appt.status === "SCHEDULED" ? "bg-blue-100 text-blue-700" :
                                                appt.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                                                    "bg-red-100 text-red-700"
                                        }`}>
                                            {appt.status}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded border border-gray-100 text-sm text-gray-700 flex flex-col gap-1">
                                        <p><strong>Date:</strong> {new Date(appt.start_time).toLocaleDateString()}</p>
                                        <p><strong>Time:</strong> {new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(appt.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                </div>

                                {appt.notes && (
                                    <div className="mt-4 bg-yellow-50 p-3 rounded border border-yellow-200 text-sm text-gray-700">
                                        <span className="font-bold block mb-1">Trainer's Note:</span>
                                        "{appt.notes}"
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}