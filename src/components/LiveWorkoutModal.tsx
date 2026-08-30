import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/axios";
import { errorDetail } from "../utils/errors";
import RestTimer from "./RestTimer";
import NumberField from "./NumberField";
import {
    parseTargetReps,
    roundToStep,
    type Exercise,
    type WorkoutPlan,
} from "../utils/workout";

// One row of the live screen: what the client actually did on this specific set.
interface SetEntry {
    weight: number | null; // null on bodyweight exercises
    reps: number;
    done: boolean;
    // "touched" means the client changed this set by hand. We never overwrite those
    // with the smart auto-fill, otherwise we would undo what they deliberately typed.
    touched: boolean;
}

type WorkoutProgress = Record<number, SetEntry[]>;

interface ActiveTimer {
    exerciseId: number;
    seconds: number;
    // Bumped on every new set so the timer component restarts even when two sets in a
    // row happen to have the same rest length.
    runId: number;
}

interface LiveWorkoutModalProps {
    plan: WorkoutPlan;
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Builds the starting grid: one entry per set of every exercise, pre-filled with the
 * weight the trainer recommended and the reps they asked for. This is the first half of
 * the "zero typing" promise - the second half is the carry-forward in markSetDone().
 */
const buildInitialProgress = (plan: WorkoutPlan): WorkoutProgress => {
    const progress: WorkoutProgress = {};

    plan.exercises.forEach((ex) => {
        const setCount = Math.max(1, ex.sets);
        progress[ex.id] = Array.from({ length: setCount }, () => ({
            weight: ex.requires_weight ? ex.recommended_weight_kg : null,
            reps: parseTargetReps(ex.reps),
            done: false,
            touched: false,
        }));
    });

    return progress;
};

export default function LiveWorkoutModal({ plan, onClose, onSaved }: LiveWorkoutModalProps) {
    const [progress, setProgress] = useState<WorkoutProgress>(() => buildInitialProgress(plan));
    const [notes, setNotes] = useState("");
    const [timer, setTimer] = useState<ActiveTimer | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Escape closes the modal, same as the profile menu in Layout.
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isSubmitting) onClose();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isSubmitting, onClose]);

    // --- PROGRESS COUNTERS (header bar) ---
    const { totalSets, completedSets } = useMemo(() => {
        const all = Object.values(progress).flat();
        return {
            totalSets: all.length,
            completedSets: all.filter((s) => s.done).length,
        };
    }, [progress]);

    // --- SET EDITING ---
    const patchSet = (exerciseId: number, index: number, patch: Partial<SetEntry>) => {
        setProgress((prev) => {
            const sets = prev[exerciseId];
            if (!sets) return prev;

            const next = sets.map((set, i) => (i === index ? { ...set, ...patch } : set));
            return { ...prev, [exerciseId]: next };
        });
    };

    // The whole point of weight_step_kg: one tap adds exactly what this machine adds.
    const adjustWeight = (ex: Exercise, index: number, direction: 1 | -1) => {
        const current = progress[ex.id]?.[index]?.weight ?? ex.recommended_weight_kg ?? 0;
        const step = ex.weight_step_kg > 0 ? ex.weight_step_kg : 2.5;
        patchSet(ex.id, index, { weight: roundToStep(current + direction * step, step), touched: true });
    };

    const adjustReps = (exerciseId: number, index: number, delta: number) => {
        const current = progress[exerciseId]?.[index]?.reps ?? 10;
        patchSet(exerciseId, index, { reps: Math.max(1, current + delta), touched: true });
    };

    /**
     * Marks a set as finished, then does the smart auto-fill: the next set inherits the
     * exact weight and reps that were just performed, so a straight-across workout needs
     * no input at all and a drop set is a single tap of "-".
     */
    const markSetDone = (ex: Exercise, index: number) => {
        setProgress((prev) => {
            const sets = prev[ex.id];
            if (!sets) return prev;

            const finished = { ...sets[index], done: true };
            const next = [...sets];
            next[index] = finished;

            const following = next[index + 1];
            if (following && !following.done && !following.touched) {
                next[index + 1] = { ...following, weight: finished.weight, reps: finished.reps };
            }

            return { ...prev, [ex.id]: next };
        });

        // Start resting immediately - nobody wants to hunt for a start button mid set.
        const rest = ex.rest_time_seconds;
        if (rest && rest > 0) {
            setTimer((prev) => ({ exerciseId: ex.id, seconds: rest, runId: (prev?.runId ?? 0) + 1 }));
        }
    };

    const undoSet = (exerciseId: number, index: number) => {
        patchSet(exerciseId, index, { done: false });
    };

    // --- SUBMIT ---
    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");

        // One row per completed set. Sets that were never ticked are simply not logged,
        // so a workout you had to cut short stays honest instead of claiming full volume.
        const exercises = plan.exercises.flatMap((ex) =>
            (progress[ex.id] ?? [])
                .filter((set) => set.done)
                .map((set, i) => ({
                    exercise_id: ex.id,
                    set_number: i + 1,
                    reps_completed: String(set.reps),
                    weight_kg: ex.requires_weight ? set.weight : null,
                }))
        );

        if (exercises.length === 0) {
            setError("Tick at least one set as done before saving.");
            return;
        }

        setIsSubmitting(true);
        try {
            await api.post("/workouts/log-session", {
                plan_id: plan.id,
                notes,
                exercises,
            });
            onSaved();
        } catch (err: unknown) {
            setError(errorDetail(err, "Failed to save workout session."));
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => !isSubmitting && onClose()}
            ></div>

            <div className="relative bg-white dark:bg-slate-900 w-full h-full sm:h-auto sm:rounded-3xl sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-200 dark:border-slate-800 shadow-2xl animate-menu-pop">

                {/* HEADER + OVERALL PROGRESS */}
                <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50">
                    <div className="flex justify-between items-start gap-4">
                        <div className="min-w-0">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Active Workout</h2>
                            <p className="text-sm text-blue-600 dark:text-blue-400 font-bold truncate">{plan.name}</p>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            aria-label="Close workout"
                            className="h-10 w-10 shrink-0 bg-gray-200 dark:bg-slate-800 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 rounded-full flex items-center justify-center transition-colors font-bold text-gray-600 dark:text-gray-400"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="mt-4">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">
                            <span>Progress</span>
                            <span>{completedSets} / {totalSets} sets</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-300 motion-reduce:transition-none"
                                style={{ width: totalSets > 0 ? `${(completedSets / totalSets) * 100}%` : "0%" }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* EXERCISE CARDS */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                    <form id="workout-form" onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-5">

                        {plan.exercises.map((ex, exIndex) => {
                            const sets = progress[ex.id] ?? [];
                            const step = ex.weight_step_kg > 0 ? ex.weight_step_kg : 2.5;
                            const doneCount = sets.filter((s) => s.done).length;
                            const isFinished = doneCount === sets.length && sets.length > 0;

                            return (
                                <div
                                    key={ex.id}
                                    className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
                                        isFinished
                                            ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50"
                                            : "bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700"
                                    }`}
                                >
                                    {/* EXERCISE HEADER */}
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-black ${
                                            isFinished
                                                ? "bg-emerald-500 text-white"
                                                : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                                        }`}>
                                            {isFinished ? "✓" : exIndex + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{ex.name}</p>
                                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                                Target: {ex.sets} × {ex.reps}
                                                {ex.requires_weight && ex.recommended_weight_kg !== null && (
                                                    <> @ {ex.recommended_weight_kg} kg</>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* FORM CUES FROM THE TRAINER */}
                                    {ex.instructions && (
                                        <div className="mb-4 flex gap-2 items-start bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3">
                                            <span className="text-base leading-none mt-0.5">💡</span>
                                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                                                {ex.instructions}
                                            </p>
                                        </div>
                                    )}

                                    {/* SETS */}
                                    <div className="flex flex-col gap-2.5">
                                        {sets.map((set, setIndex) => {
                                            if (set.done) {
                                                // Finished sets collapse so the screen always shows what is next.
                                                return (
                                                    <div
                                                        key={setIndex}
                                                        className="flex items-center justify-between gap-3 bg-emerald-500 text-white rounded-xl px-4 py-3"
                                                    >
                                                        <span className="font-black text-sm">
                                                            Set {setIndex + 1}
                                                        </span>
                                                        <span className="font-bold text-sm">
                                                            {ex.requires_weight && set.weight !== null
                                                                ? `${set.weight} kg × ${set.reps}`
                                                                : `${set.reps} reps`}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => undoSet(ex.id, setIndex)}
                                                            className="text-[10px] font-black uppercase tracking-wider bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-colors"
                                                        >
                                                            Undo
                                                        </button>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={setIndex}
                                                    className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                                                            Set {setIndex + 1}
                                                        </span>
                                                        {ex.requires_weight && (
                                                            <span className="text-[10px] font-bold text-gray-400">
                                                                +{step} kg per tap
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* WEIGHT STEPPER */}
                                                    {ex.requires_weight && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => adjustWeight(ex, setIndex, -1)}
                                                                aria-label={`Remove ${step} kg`}
                                                                className="h-12 w-12 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-2xl font-black flex items-center justify-center active:scale-95 touch-manipulation transition-transform hover:bg-gray-200 dark:hover:bg-slate-700"
                                                            >
                                                                −
                                                            </button>

                                                            <div className="flex-1 relative">
                                                                <input
                                                                    type="number"
                                                                    inputMode="decimal"
                                                                    step="0.25"
                                                                    min="0"
                                                                    placeholder="0"
                                                                    value={set.weight ?? ""}
                                                                    onChange={(e) =>
                                                                        patchSet(ex.id, setIndex, {
                                                                            weight: e.target.value === "" ? null : parseFloat(e.target.value),
                                                                            touched: true,
                                                                        })
                                                                    }
                                                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white py-3 pr-10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center text-xl font-black"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">
                                                                    kg
                                                                </span>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => adjustWeight(ex, setIndex, 1)}
                                                                aria-label={`Add ${step} kg`}
                                                                className="h-12 w-12 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-2xl font-black flex items-center justify-center active:scale-95 touch-manipulation transition-transform"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* REPS STEPPER + DONE */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-2 flex-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => adjustReps(ex.id, setIndex, -1)}
                                                                aria-label="One rep less"
                                                                className="h-12 w-12 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-xl font-black flex items-center justify-center active:scale-95 touch-manipulation transition-transform hover:bg-gray-200 dark:hover:bg-slate-700"
                                                            >
                                                                −
                                                            </button>
                                                            <div className="flex-1 relative">
                                                                <NumberField
                                                                    inputMode="numeric"
                                                                    min={1}
                                                                    step={1}
                                                                    value={set.reps}
                                                                    onValueChange={(reps) =>
                                                                        patchSet(ex.id, setIndex, {
                                                                            reps,
                                                                            touched: true,
                                                                        })
                                                                    }
                                                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white py-3 pr-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center text-xl font-black"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">
                                                                    reps
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => adjustReps(ex.id, setIndex, 1)}
                                                                aria-label="One rep more"
                                                                className="h-12 w-12 shrink-0 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 text-xl font-black flex items-center justify-center active:scale-95 touch-manipulation transition-transform hover:bg-gray-200 dark:hover:bg-slate-700"
                                                            >
                                                                +
                                                            </button>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => markSetDone(ex, setIndex)}
                                                            className="h-12 px-5 shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation transition-transform shadow-sm"
                                                        >
                                                            ✔️ Done
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* REST TIMER - lives under the exercise it belongs to */}
                                    {timer?.exerciseId === ex.id && (
                                        <div className="mt-3">
                                            <RestTimer
                                                key={timer.runId}
                                                seconds={timer.seconds}
                                                onDone={() => setTimer(null)}
                                                onSkip={() => setTimer(null)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* SESSION NOTES */}
                        <div className="mt-1">
                            <label htmlFor="session-notes" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                How did you feel? Hit any PRs?
                            </label>
                            <textarea
                                id="session-notes"
                                rows={3}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Optional - anything worth remembering next time."
                                className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-4 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            ></textarea>
                        </div>
                    </form>
                </div>

                {/* FOOTER */}
                <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    {error && (
                        <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-3 rounded-xl mb-3 font-bold text-sm border border-red-200 dark:border-red-800">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        form="workout-form"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-lg flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? "Saving..." : `✅ Finish & Save (${completedSets} sets)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
