import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import { trainerName } from "../../utils/coaching";
import ConfirmModal from "../../components/ConfirmModal";
import RefreshButton from "../../components/RefreshButton";
import { displayStatus, groupForTrainer, type Appointment, type StatusTone } from "../../utils/appointments";

// Badge colours for displayStatus(), same palette as the member's schedule.
const TONE_CLASSES: Record<StatusTone, string> = {
    blue: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300",
    amber: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300",
    rose: "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300",
};

export default function TrainerAppointments() {
    const queryClient = useQueryClient();
    const [actionNotes, setActionNotes] = useState<Record<number, string>>({});
    const [showPast, setShowPast] = useState(false);
    const [toCancel, setToCancel] = useState<Appointment | null>(null);

    // --- 1. THE SCHEDULE ---
    // No polling. Members book and cancel from their own phones, and the refresh
    // button in the header is how a new booking shows up without leaving the page.
    // `now` is stamped inside the queryFn so the grouping (and the Complete button
    // unlocking at the start time) moves on with each refresh while render stays pure.
    const {
        data,
        isPending,
        error: loadError,
        refetch,
    } = useQuery({
        queryKey: ["trainer", "appointments"],
        queryFn: async () => {
            const res = await api.get<Appointment[]>("/coaching/appointments/trainer");
            return { items: res.data, now: Date.now() };
        },
    });

    // --- 2. COMPLETE / CANCEL ---
    const updateStatus = useMutation({
        mutationFn: async ({ id, status }: { id: number; status: "COMPLETED" | "CANCELLED" }) => {
            // Only send 'notes' when something was actually typed. Sending null for an
            // empty box would tell the API to CLEAR whatever feedback is already
            // stored - and the member sees that text as "Trainer's Note".
            const note = (actionNotes[id] ?? "").trim();
            const payload: { status: string; notes?: string } = { status };
            if (note) payload.notes = note;

            await api.put(`/coaching/appointments/${id}`, payload);
        },
        onSettled: async () => {
            setToCancel(null);
            // Refreshes the whole trainer section, not just this list - the same
            // appointment shows up on the clients screen.
            await queryClient.invalidateQueries({ queryKey: ["trainer"] });
        },
    });

    // One banner for both failures. This used to be an alert() for the update path,
    // which blocks the page and looks nothing like the rest of the app.
    const error = loadError
        ? "Failed to load appointments."
        : updateStatus.error
          ? errorDetail(updateStatus.error, "Failed to update appointment.")
          : "";

    if (isPending) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading schedule...</div>;
    }

    const now = data?.now ?? 0;
    const { needsClosing, upcoming, past } = groupForTrainer(data?.items ?? [], now);

    const renderCard = (appt: Appointment) => {
        const status = displayStatus(appt, now);
        const clientName = appt.client ? trainerName(appt.client) : "Client";
        const start = new Date(appt.start_time);

        // The backend refuses to complete a session that hasn't begun, so mirror that
        // here - the trainer shouldn't have to discover the rule through an error.
        // Cancel stays available: cancelling something upcoming is the normal case.
        const hasStarted = now >= start.getTime();

        return (
            <div
                key={appt.id}
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-colors duration-200"
            >
                <div>
                    <div className="flex justify-between items-start gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 shrink-0 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center font-bold text-lg">
                                {clientName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate">{clientName}</h3>
                                {appt.client && <p className="text-xs text-gray-400 truncate">{appt.client.email}</p>}
                            </div>
                        </div>

                        <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase ${TONE_CLASSES[status.tone]}`}>
                            {status.label}
                        </span>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-800 text-sm text-gray-700 dark:text-gray-300 flex flex-col gap-1">
                        <p>
                            <strong>Date:</strong>{" "}
                            {start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        <p>
                            <strong>Time:</strong>{" "}
                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(appt.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                    </div>
                </div>

                {appt.status === "SCHEDULED" && (
                    <div className="mt-4 flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
                        {/* A textarea: feedback is a sentence or two, not a word. */}
                        <textarea
                            rows={2}
                            aria-label={`Feedback for ${clientName}`}
                            placeholder="Add feedback/notes (optional)..."
                            value={actionNotes[appt.id] ?? ""}
                            onChange={(e) => setActionNotes({ ...actionNotes, [appt.id]: e.target.value })}
                            className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                        ></textarea>
                        <div className="flex gap-2">
                            <button
                                onClick={() => updateStatus.mutate({ id: appt.id, status: "COMPLETED" })}
                                disabled={!hasStarted || updateStatus.isPending}
                                title={hasStarted ? undefined : "Session hasn't started yet"}
                                className={`flex-1 font-bold py-2 rounded-xl text-xs transition ${
                                    hasStarted
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                                        : "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                }`}
                            >
                                Complete
                            </button>
                            <button
                                // Cancelling can't be undone and the member is affected,
                                // so it asks first instead of firing on one tap.
                                onClick={() => setToCancel(appt)}
                                disabled={updateStatus.isPending}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-bold py-2 rounded-xl text-xs transition"
                            >
                                Cancel
                            </button>
                        </div>

                        {!hasStarted && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
                                ⏳ You can complete this once the session starts.
                            </p>
                        )}
                    </div>
                )}

                {appt.notes && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
                        <strong className="block mb-1">Feedback:</strong> "{appt.notes}"
                    </div>
                )}
            </div>
        );
    };

    const section = (title: string, items: Appointment[], hint?: string) =>
        items.length > 0 && (
            <section>
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-1">
                    {title} ({items.length})
                </h2>
                {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{hint}</p>}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${hint ? "" : "mt-3"}`}>{items.map(renderCard)}</div>
            </section>
        );

    return (
        <div className="max-w-5xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                        My Schedule
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                        Manage your upcoming training sessions with clients.
                    </p>
                </div>
                <RefreshButton onRefresh={() => refetch()} label="Refresh the schedule" className="mt-1" />
            </div>

            {error && (
                <div className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 p-4 rounded-xl font-bold text-sm border border-red-200 dark:border-red-800">
                    {error}
                </div>
            )}

            {needsClosing.length === 0 && upcoming.length === 0 && (
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-8 rounded-2xl text-center text-gray-500 dark:text-slate-400 shadow-sm transition-colors duration-200">
                    You have no upcoming appointments.
                </div>
            )}

            {/* Sessions that started but were never closed come first - they are the
                only ones waiting on the trainer to do something. */}
            {section("Needs closing", needsClosing, "These sessions have started. Mark them completed or cancelled.")}
            {section("Upcoming", upcoming)}

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
                    {showPast && <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{past.map(renderCard)}</div>}
                </section>
            )}

            <ConfirmModal
                isOpen={toCancel !== null}
                title="Cancel this session?"
                message={
                    toCancel
                        ? `The session with ${toCancel.client ? trainerName(toCancel.client) : "this client"} on ${new Date(
                              toCancel.start_time,
                          ).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} will be cancelled. The client will see it as cancelled.`
                        : ""
                }
                confirmText={updateStatus.isPending ? "Cancelling…" : "Cancel session"}
                cancelText="Keep it"
                onConfirm={() => {
                    if (toCancel) updateStatus.mutate({ id: toCancel.id, status: "CANCELLED" });
                }}
                onCancel={() => setToCancel(null)}
            />
        </div>
    );
}
