import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import { MY_SUBSCRIPTION_KEY, fetchMySubscription, planIncludesTrainer } from "../../utils/subscription";
import { activeTrainers, trainerName, type CoachingLink } from "../../utils/coaching";
import ConfirmModal from "../../components/ConfirmModal";
import RefreshButton from "../../components/RefreshButton";
import {
    GYM_CLOSE_HOUR,
    GYM_OPEN_HOUR,
    MAX_BOOKING_HORIZON_DAYS,
    MAX_SESSION_HOURS,
    MEMBER_CANCEL_CUTOFF_HOURS,
    canMemberCancel,
    displayStatus,
    splitAppointments,
    validateBooking,
    type Appointment,
    type StatusTone,
} from "../../utils/appointments";

// Badge colours for displayStatus(). Kept in one lookup so both lists match.
const TONE_CLASSES: Record<StatusTone, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
};

const APPOINTMENTS_KEY = ["member", "appointments"];

const INPUT_CLASS =
    "w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all";

const pad = (n: number) => String(n).padStart(2, "0");

// Built from LOCAL date parts, not toISOString(). toISOString() converts to UTC first,
// so late at night in a UTC+X timezone it hands back yesterday's date and the calendar
// would block a day the user can legitimately still book.
const toDateInputValue = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function MemberAppointments() {
    const queryClient = useQueryClient();

    // --- 1. FORM STATE ---
    const [selectedTrainer, setSelectedTrainer] = useState("");
    const [sessionDate, setSessionDate] = useState("");
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("11:00");
    const [formError, setFormError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // --- 2. SCHEDULE STATE ---
    const [showPast, setShowPast] = useState(false);
    const [toCancel, setToCancel] = useState<Appointment | null>(null);

    // --- 3. DATA ---
    // No polling: the refresh button next to "My Schedule" picks up what the trainer
    // changed from their own device. `now` is stamped inside the queryFn rather than
    // read during render, so the grouping below ("upcoming", "awaiting trainer")
    // moves on with each refresh and the render stays pure.
    const appointmentsQuery = useQuery({
        queryKey: APPOINTMENTS_KEY,
        queryFn: async () => {
            const res = await api.get<Appointment[]>("/coaching/appointments/client");
            return { items: res.data, now: Date.now() };
        },
    });

    // Same key and shape as the Workouts page, so the two share one cache entry.
    const trainersQuery = useQuery({
        queryKey: ["coaching", "my-trainers"],
        queryFn: async () => (await api.get<CoachingLink[]>("/coaching/my-trainers")).data,
    });

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

    const trainers = activeTrainers(trainersQuery.data ?? []);

    // With a single trainer there is nothing to choose, so they are picked for you.
    // Derived rather than set in an effect: the select still works if a second
    // trainer shows up later.
    const trainerId = selectedTrainer || (trainers.length === 1 ? String(trainers[0].id) : "");

    // --- 4. BOOK ---
    const book = useMutation({
        mutationFn: async () => {
            await api.post("/coaching/appointments", {
                trainer_id: Number(trainerId),
                // Date + time from the inputs are local; toISOString() sends them as UTC.
                start_time: new Date(`${sessionDate}T${startTime}:00`).toISOString(),
                end_time: new Date(`${sessionDate}T${endTime}:00`).toISOString(),
            });
        },
        onSuccess: async () => {
            setSuccessMsg("Appointment scheduled successfully!");
            // Only the times are reset, so booking the same trainer on another day is quick.
            setStartTime("10:00");
            setEndTime("11:00");
            await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
        },
    });

    const handleSchedule = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSuccessMsg("");
        book.reset();

        // Checked here first, so the member hears about a closed gym or a time that
        // already passed now - not after a round trip. The server checks it all again.
        const problem = validateBooking(sessionDate, startTime, endTime, Date.now());
        setFormError(problem ?? "");
        if (problem) return;

        book.mutate();
    };

    // --- 5. CANCEL ---
    const cancel = useMutation({
        mutationFn: async (id: number) => {
            await api.post(`/coaching/appointments/${id}/cancel`);
        },
        onSettled: async () => {
            setToCancel(null);
            await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
        },
    });

    // --- 6. RENDER ---
    if (appointmentsQuery.isPending || trainersQuery.isPending) {
        return <div className="p-6 text-gray-500 dark:text-gray-400 font-bold">Loading...</div>;
    }

    // Kept apart from the booking error. The load error used to share one message
    // with a failed booking, while the right column kept insisting the schedule was
    // empty - so the member was told both that something failed and that nothing
    // was booked.
    const scheduleFailed = appointmentsQuery.isError;
    const trainersFailed = trainersQuery.isError;

    const now = appointmentsQuery.data?.now ?? 0;
    const { upcoming, past } = splitAppointments(appointmentsQuery.data?.items ?? [], now);

    const bookError = formError || (book.error ? errorDetail(book.error, "Failed to schedule.") : "");

    const todayStr = toDateInputValue(new Date(now));
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + MAX_BOOKING_HORIZON_DAYS);
    const maxDateStr = toDateInputValue(maxDate);

    const renderCard = (appt: Appointment) => {
        const status = displayStatus(appt, now);
        const name = appt.trainer ? trainerName(appt.trainer) : "Trainer";
        const start = new Date(appt.start_time);
        const isUpcoming = appt.status === "SCHEDULED" && new Date(appt.start_time).getTime() > now;

        return (
            <div
                key={appt.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col justify-between transition-colors duration-200"
            >
                <div>
                    <div className="flex justify-between items-start gap-3 mb-4">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 shrink-0 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center font-black">
                                {name.charAt(0).toUpperCase()}
                            </div>
                            <h3 className="font-bold text-lg text-gray-800 dark:text-white truncate">{name}</h3>
                        </div>
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-black uppercase ${TONE_CLASSES[status.tone]}`}>
                            {status.label}
                        </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50 text-sm text-gray-700 dark:text-gray-300 flex flex-col gap-1">
                        <p>
                            <strong className="text-gray-900 dark:text-white">Date:</strong>{" "}
                            {start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        <p>
                            <strong className="text-gray-900 dark:text-white">Time:</strong>{" "}
                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(appt.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                    </div>
                </div>

                {appt.notes && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800/50 text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-bold block mb-1 text-gray-900 dark:text-white">Trainer's Note:</span>
                        "{appt.notes}"
                    </div>
                )}

                {/* Cancel is only offered while the member is still allowed to. Inside
                    the cutoff the button is replaced with who to ask instead. */}
                {isUpcoming && (
                    canMemberCancel(appt, now) ? (
                        <button
                            type="button"
                            onClick={() => setToCancel(appt)}
                            disabled={cancel.isPending}
                            className="mt-4 w-full text-sm font-bold py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-60 transition-colors"
                        >
                            Cancel session
                        </button>
                    ) : (
                        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                            Less than {MEMBER_CANCEL_CUTOFF_HOURS}h to go - contact your trainer to cancel.
                        </p>
                    )
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
            {/* LEFT: BOOKING FORM */}
            <div className="w-full lg:w-1/3">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 lg:sticky top-6 transition-colors duration-200">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Book a Session</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Between {pad(GYM_OPEN_HOUR)}:00 and {pad(GYM_CLOSE_HOUR)}:00, up to {MAX_SESSION_HOURS} hours per session.
                    </p>

                    {successMsg && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-3 rounded-xl mb-4 text-sm font-bold border border-emerald-200 dark:border-emerald-800 transition-colors">
                            ✅ {successMsg}
                        </div>
                    )}
                    {bookError && (
                        <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-3 rounded-xl mb-4 text-sm font-bold border border-rose-200 dark:border-rose-800 transition-colors">
                            ❌ {bookError}
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
                    ) : trainersFailed ? (
                        <div className="text-sm text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 p-4 rounded-xl border border-rose-200 dark:border-rose-800 font-bold transition-colors">
                            Your trainers could not be loaded, so booking is unavailable right now.
                        </div>
                    ) : trainers.length === 0 ? (
                        <div className="text-sm text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors">
                            You don't have an active trainer yet. Go to the Find Trainer tab to request one!
                        </div>
                    ) : (
                        <form onSubmit={handleSchedule} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="booking-trainer" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Select Trainer</label>
                                <select
                                    id="booking-trainer"
                                    required
                                    value={trainerId}
                                    onChange={(e) => setSelectedTrainer(e.target.value)}
                                    className={INPUT_CLASS}
                                >
                                    <option value="">-- Choose --</option>
                                    {trainers.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {trainerName(t)}
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
                                    min={todayStr}
                                    max={maxDateStr}
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className={INPUT_CLASS}
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                    Up to {MAX_BOOKING_HORIZON_DAYS} days in advance.
                                </p>
                            </div>

                            {/* A grid, not two fixed-width halves, so the pair shares the row evenly. */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="booking-start" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Start Time</label>
                                    <input
                                        id="booking-start"
                                        type="time"
                                        required
                                        min={`${pad(GYM_OPEN_HOUR)}:00`}
                                        max={`${pad(GYM_CLOSE_HOUR)}:00`}
                                        step={900}
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="booking-end" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">End Time</label>
                                    <input
                                        id="booking-end"
                                        type="time"
                                        required
                                        min={`${pad(GYM_OPEN_HOUR)}:00`}
                                        max={`${pad(GYM_CLOSE_HOUR)}:00`}
                                        step={900}
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className={INPUT_CLASS}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                // Disabled while in flight: a double tap used to book twice,
                                // or show a 409 right under the success message.
                                disabled={book.isPending}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black py-3.5 rounded-xl transition-all shadow-sm hover:shadow-md mt-2"
                            >
                                {book.isPending ? "Booking…" : "Confirm Booking"}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* RIGHT: MY SCHEDULE */}
            <div className="w-full lg:w-2/3">
                <div className="flex items-center justify-between gap-4 mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">My Schedule</h2>
                    <RefreshButton onRefresh={() => appointmentsQuery.refetch()} label="Refresh my schedule" />
                </div>

                {cancel.error && (
                    <div className="mb-4 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-3 rounded-xl text-sm font-bold border border-rose-200 dark:border-rose-800">
                        ❌ {errorDetail(cancel.error, "Could not cancel this session.")}
                    </div>
                )}

                {scheduleFailed ? (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-rose-200 dark:border-rose-800 text-center text-rose-600 dark:text-rose-400 font-bold transition-colors">
                        Your schedule could not be loaded.
                        <button
                            type="button"
                            onClick={() => void appointmentsQuery.refetch()}
                            className="block mx-auto mt-3 text-sm underline"
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-8">
                        {/* UPCOMING - what the member actually came here to see, soonest first */}
                        <section>
                            <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">
                                Upcoming ({upcoming.length})
                            </h3>
                            {upcoming.length === 0 ? (
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 text-center text-gray-500 dark:text-gray-400 transition-colors">
                                    You have no upcoming appointments.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{upcoming.map(renderCard)}</div>
                            )}
                        </section>

                        {/* PAST - collapsed, so history never pushes a new booking off screen */}
                        {past.length > 0 && (
                            <section>
                                <button
                                    type="button"
                                    onClick={() => setShowPast((v) => !v)}
                                    aria-expanded={showPast}
                                    className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white mb-3 transition-colors"
                                >
                                    Past sessions ({past.length}) {showPast ? "▴" : "▾"}
                                </button>
                                {showPast && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{past.map(renderCard)}</div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={toCancel !== null}
                title="Cancel this session?"
                message={
                    toCancel
                        ? `Your session with ${toCancel.trainer ? trainerName(toCancel.trainer) : "your trainer"} on ${new Date(
                              toCancel.start_time,
                          ).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} will be cancelled. This can't be undone.`
                        : ""
                }
                confirmText={cancel.isPending ? "Cancelling…" : "Cancel session"}
                cancelText="Keep it"
                onConfirm={() => {
                    if (toCancel) cancel.mutate(toCancel.id);
                }}
                onCancel={() => setToCancel(null)}
            />
        </div>
    );
}
