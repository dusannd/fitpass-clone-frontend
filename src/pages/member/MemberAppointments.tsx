import { useEffect, useState, useCallback } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/axios.ts";
import { errorDetail } from "../../utils/errors";
import { MY_SUBSCRIPTION_KEY, fetchMySubscription, planIncludesTrainer } from "../../utils/subscription";

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

// Mirrors MAX_BOOKING_HORIZON_DAYS in app/api/coaching.py. The server is still the
// one that enforces it; this just stops the calendar offering dates it will reject.
const MAX_BOOKING_HORIZON_DAYS = 60;

export default function MemberAppointments() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [myTrainers, setMyTrainers] = useState<MyTrainer[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Separate from `error`, which this page also uses for a failed booking. The load
    // error lived in the left card while the right column kept insisting the schedule
    // was empty - so a member whose appointments failed to load was told, on the same
    // screen, both that something went wrong and that they have nothing booked.
    const [loadFailed, setLoadFailed] = useState(false);

    // Nova razdvojena forma (Datum, Vreme početka, Vreme kraja)
    const [selectedTrainer, setSelectedTrainer] = useState("");
    const [sessionDate, setSessionDate] = useState("");
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("11:00");

    // Booking needs a plan that includes personal training, same as requesting a
    // trainer does - otherwise a member who linked up and then downgraded would keep
    // booking forever. Shares its cache entry with the pricing and coaching pages.
    const subQuery = useQuery({
        queryKey: MY_SUBSCRIPTION_KEY,
        queryFn: fetchMySubscription,
        retry: false,
    });

    // isPending, not isFetching: keyed to isFetching, the form would swap itself for
    // an upgrade notice on every background refetch. Assume nothing until the first
    // response lands.
    const entitlementKnown = !subQuery.isPending;
    const canBook = planIncludesTrainer(subQuery.data);

    // Jedna funkcija za povlačenje podataka — koristi je i inicijalni load i refresh posle zakazivanja
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
            setLoadFailed(false);
        } catch (err: unknown) {
            setLoadFailed(true);
            setError(errorDetail(err, "Failed to load appointments."));
        }
    }, []);

    useEffect(() => {
        // Standard fetch-on-mount: setLoading only runs after the async call settles, not
        // synchronously in the effect body.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshData().finally(() => setLoading(false));
    }, [refreshData]);

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
            setError(errorDetail(err, "Failed to schedule."));
        }
    };

    // --- DATE PICKER BOUNDS ---
    // Built from LOCAL date parts, not toISOString(). toISOString() converts to UTC
    // first, so late at night in a UTC+X timezone it hands back yesterday's date and
    // the calendar would block a day the user can legitimately still book.
    const toDateInputValue = (d: Date): string => {
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${month}-${day}`;
    };

    const todayStr = toDateInputValue(new Date());

    // The backend caps bookings at 60 days out, so the calendar greys out anything
    // further instead of letting the user find out via an error message.
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + MAX_BOOKING_HORIZON_DAYS);
    const maxDateStr = toDateInputValue(maxDate);

    if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400 font-bold">Loading...</div>;

    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
            {/* LEFT: BOOKING FORM */}
            <div className="w-full lg:w-1/3">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 sticky top-6 transition-colors duration-200">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Book a Session</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Select a date and time. Sessions cannot exceed 3 hours.</p>

                    {successMsg && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-3 rounded-xl mb-4 text-sm font-bold border border-emerald-200 dark:border-emerald-800 transition-colors">
                            ✅ {successMsg}
                        </div>
                    )}
                    {error && (
                        <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-3 rounded-xl mb-4 text-sm font-bold border border-rose-200 dark:border-rose-800 transition-colors">
                            ❌ {error}
                        </div>
                    )}

                    {/* The entitlement is checked BEFORE the trainer list, because a
                        member whose plan dropped the perk still has their trainer -
                        telling them to "go request one" would send them to a page that
                        refuses them too. Sessions already booked stay listed on the
                        right; only new bookings are blocked, and the 403 from the API
                        is what actually enforces that. */}
                    {entitlementKnown && !canBook ? (
                        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800/50 p-4 rounded-xl transition-colors">
                            <p className="text-sm text-purple-800 dark:text-purple-400 mb-4 leading-relaxed">
                                {subQuery.data
                                    ? `Your ${subQuery.data.plan.name} plan doesn't include personal training, so new sessions can't be booked.`
                                    : "You need an active membership that includes personal training to book a session."}
                            </p>
                            <Link
                                to="/subscriptions"
                                className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-black py-2.5 px-5 rounded-xl transition-all shadow-sm hover:shadow-md"
                            >
                                View Plans
                            </Link>
                        </div>
                    ) : loadFailed ? (
                        <div className="text-sm text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 p-4 rounded-xl border border-rose-200 dark:border-rose-800 font-bold transition-colors">
                            Your trainers could not be loaded, so booking is unavailable right now.
                        </div>
                    ) : myTrainers.length === 0 ? (
                        <div className="text-sm text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors">
                            You don't have an active trainer yet. Go to the Find Trainer tab to request one!
                        </div>
                    ) : (
                        <form onSubmit={(e) => void handleSchedule(e)} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="booking-trainer" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Select Trainer</label>
                                <select
                                    id="booking-trainer"
                                    required
                                    value={selectedTrainer}
                                    onChange={(e) => setSelectedTrainer(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
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
                                <label htmlFor="booking-date" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Date</label>
                                <input
                                    id="booking-date"
                                    type="date"
                                    required
                                    min={todayStr} // Zabrana biranja u prošlosti direkt u kalendaru
                                    max={maxDateStr} // I ne dalje od 60 dana unaprijed
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                    Up to {MAX_BOOKING_HORIZON_DAYS} days in advance.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label htmlFor="booking-start" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Start Time</label>
                                    <input
                                        id="booking-start"
                                        type="time"
                                        required
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label htmlFor="booking-end" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">End Time</label>
                                    <input
                                        id="booking-end"
                                        type="time"
                                        required
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl transition-all shadow-sm hover:shadow-md mt-2"
                            >
                                Confirm Booking
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* RIGHT: MY APPOINTMENTS */}
            <div className="w-full lg:w-2/3">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">My Schedule</h2>
                {loadFailed ? (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-rose-200 dark:border-rose-800 text-center text-rose-600 dark:text-rose-400 font-bold transition-colors">
                        Your schedule could not be loaded. Refresh the page to try again.
                    </div>
                ) : appointments.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 text-center text-gray-500 dark:text-gray-400 transition-colors">
                        You have no upcoming appointments.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {appointments.map((appt) => (
                            <div
                                key={appt.id}
                                className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col justify-between transition-colors duration-200"
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center font-black">
                                                {appt.trainer?.first_name.charAt(0)}
                                            </div>
                                            <h3 className="font-bold text-lg text-gray-800 dark:text-white">
                                                {appt.trainer?.first_name} {appt.trainer?.last_name}
                                            </h3>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase ${
                                            appt.status === "SCHEDULED" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                                                appt.status === "COMPLETED" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                                                    "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                                        }`}>
                                            {appt.status}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50 text-sm text-gray-700 dark:text-gray-300 flex flex-col gap-1">
                                        <p><strong className="text-gray-900 dark:text-white">Date:</strong> {new Date(appt.start_time).toLocaleDateString()}</p>
                                        <p><strong className="text-gray-900 dark:text-white">Time:</strong> {new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(appt.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                </div>

                                {appt.notes && (
                                    <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 text-sm text-gray-700 dark:text-gray-300">
                                        <span className="font-bold block mb-1 text-gray-900 dark:text-white">Trainer's Note:</span>
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
