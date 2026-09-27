import { useEffect } from "react";
import type { WorkoutPlan } from "../utils/workout";

interface PlanPreviewModalProps {
    plan: WorkoutPlan;
    onClose: () => void;
    // The card's own call to action, passed in so the modal and the card can never
    // disagree about what the button says or does ("Start Workout" / "Save & Follow").
    actionLabel: string;
    actionClassName: string;
    onAction: () => void;
}

// 90 -> "90s", 120 -> "2 min", 150 -> "2 min 30s". Gyms talk about short rests in
// seconds ("90 seconds", never "a minute thirty"), longer ones in minutes.
const formatRest = (seconds: number): string => {
    if (seconds < 120) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`;
};

/**
 * The whole plan, before you commit to it. The plan card only has room for the first
 * three exercises, and a member should know what they are signing up for - every
 * exercise, the target weight, the rest and the trainer's cues - before the live
 * workout starts counting sets.
 */
export default function PlanPreviewModal({ plan, onClose, actionLabel, actionClassName, onAction }: PlanPreviewModalProps) {
    // Escape closes the modal, same as the other modals on this page.
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    const totalSets = plan.exercises.reduce((sum, ex) => sum + ex.sets, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div
                role="dialog"
                aria-modal="true"
                aria-label={plan.name}
                className="relative bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:rounded-3xl sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-200 dark:border-slate-800 shadow-2xl animate-menu-pop"
            >
                {/* --- 1. HEADER --- */}
                <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            Plan preview
                        </p>
                        <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-tight">
                            {plan.name}
                        </h2>
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
                            {plan.exercises.length} {plan.exercises.length === 1 ? "exercise" : "exercises"} · {totalSets}{" "}
                            {totalSets === 1 ? "set" : "sets"}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="h-10 w-10 shrink-0 bg-gray-200 dark:bg-slate-800 hover:bg-gray-300 dark:hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors font-bold text-gray-600 dark:text-gray-400"
                    >
                        ✕
                    </button>
                </div>

                {/* --- 2. EVERY EXERCISE --- */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3">
                    {plan.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{plan.description}</p>
                    )}

                    {plan.exercises.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                            This plan has no exercises yet.
                        </p>
                    ) : (
                        <ol className="flex flex-col gap-3">
                            {plan.exercises.map((ex, i) => (
                                <li
                                    key={ex.id}
                                    className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="h-8 w-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 flex items-center justify-center text-sm font-black">
                                            {i + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-bold text-gray-900 dark:text-white leading-tight">{ex.name}</p>
                                                {!ex.requires_weight && (
                                                    <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">
                                                        Bodyweight
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                                                {ex.sets} × {ex.reps}
                                                {ex.requires_weight && ex.recommended_weight_kg !== null && (
                                                    <> @ {ex.recommended_weight_kg} kg</>
                                                )}
                                                {ex.rest_time_seconds > 0 && <> · rest {formatRest(ex.rest_time_seconds)}</>}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Form cues from the trainer, same box as in the live workout */}
                                    {ex.instructions && (
                                        <div className="mt-3 flex gap-2 items-start bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3">
                                            <span className="text-base leading-none mt-0.5">💡</span>
                                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                                                {ex.instructions}
                                            </p>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                {/* --- 3. ACTION --- */}
                <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <button
                        type="button"
                        onClick={onAction}
                        className={`w-full font-black py-4 rounded-2xl transition-all shadow-md hover:shadow-lg text-lg touch-manipulation active:scale-[0.99] ${actionClassName}`}
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
