import { useEffect, useMemo } from "react";
import { groupLogsByExercise, type WorkoutSession } from "../utils/workout";

interface SessionDetailModalProps {
    session: WorkoutSession;
    // Name of the plan this session was performed from, when we can still resolve it.
    planName: string | null;
    onClose: () => void;
}

/**
 * Read only view of one past workout: every single set, exactly as it was logged.
 * The history list only has room for a summary, so this is where the per-set rows we
 * store actually pay off - you can see that you did 80x10, 85x8, 85x6 and not just
 * "3 sets".
 */
export default function SessionDetailModal({ session, planName, onClose }: SessionDetailModalProps) {
    // Escape closes the modal, same as LiveWorkoutModal and the profile menu in Layout.
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    const exercises = useMemo(() => groupLogsByExercise(session.exercise_logs), [session.exercise_logs]);
    const totalSets = session.exercise_logs.length;

    const fullDate = new Date(session.date).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Workout on ${fullDate}`}
                className="relative w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/20 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl animate-menu-pop"
            >
                {/* HEADER */}
                <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200/70 dark:border-slate-700/60">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            {planName ?? "Workout Session"}
                        </p>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight truncate">
                            {fullDate}
                        </h2>
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
                            {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"} · {totalSets}{" "}
                            {totalSets === 1 ? "set" : "sets"}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* BODY: EVERY SET, EXERCISE BY EXERCISE */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    {exercises.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                            No sets were logged in this session.
                        </p>
                    ) : (
                        exercises.map((group) => (
                            <div
                                key={group.key}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4"
                            >
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h3 className="font-bold text-gray-900 dark:text-white truncate" title={group.name}>
                                        {group.name}
                                    </h3>
                                    <span className="shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                        {group.topWeight !== null ? `PR ${group.topWeight} kg` : "Bodyweight"}
                                    </span>
                                </div>

                                <ul className="flex flex-col gap-1.5">
                                    {group.sets.map((set) => {
                                        // The heaviest set of the exercise is the one that set the record
                                        // that day, so it is worth calling out.
                                        const isTopSet =
                                            group.topWeight !== null && set.weight_kg === group.topWeight;

                                        return (
                                            <li
                                                key={set.id}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm ${
                                                    isTopSet
                                                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60"
                                                        : "bg-gray-50 dark:bg-slate-800/60 border-gray-100 dark:border-slate-700/50"
                                                }`}
                                            >
                                                <span className="w-8 shrink-0 text-[11px] font-black text-gray-400 dark:text-gray-500 tabular-nums">
                                                    #{set.set_number}
                                                </span>
                                                <span className="font-bold text-gray-900 dark:text-white tabular-nums">
                                                    {set.weight_kg !== null
                                                        ? `${set.weight_kg} kg × ${set.reps_completed}`
                                                        : `${set.reps_completed} reps`}
                                                </span>
                                                {set.weight_kg === null && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                                        bodyweight
                                                    </span>
                                                )}
                                                {isTopSet && <span className="ml-auto">🏆</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))
                    )}

                    {session.notes && (
                        <div className="bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700/50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                                Session notes
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 italic">"{session.notes}"</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
