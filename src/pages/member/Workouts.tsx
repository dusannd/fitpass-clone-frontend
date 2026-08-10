import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { api } from "../../api/axios";
import { ProgressCard } from "../../components/ProgressCard";
import LiveWorkoutModal from "../../components/LiveWorkoutModal";
import type { ExerciseLog, WorkoutPlan, WorkoutSession } from "../../utils/workout";

// --- INTERFACES ---
interface Trainer {
    id: number;
    first_name: string;
}

// The three flavours a plan card can take. They share one shell and differ only in the
// accent, the badge and the call to action.
type PlanCardType = "explore" | "my_plan" | "assigned";

// --- CARD VARIANT LOOKUPS ---
// Kept next to each other so the visual language stays cohesive: change a colour here and
// every card of that type follows, instead of hunting through branched JSX.
const CARD_SHELL: Record<PlanCardType, string> = {
    assigned: "border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/25 dark:to-slate-900",
    my_plan: "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900",
    explore: "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900",
};

// The left stripe is what tells the three types apart at a glance while scanning the grid.
const CARD_STRIPE: Record<PlanCardType, string> = {
    assigned: "bg-gradient-to-b from-emerald-500 to-blue-500",
    my_plan: "bg-blue-500",
    explore: "bg-gray-200 dark:bg-slate-700",
};

const CARD_BADGE: Record<PlanCardType, { label: string; className: string }> = {
    assigned: {
        label: "🎯 Trainer Assigned",
        className: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    my_plan: {
        label: "Saved",
        className: "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700",
    },
    explore: {
        label: "Public 🔵",
        className: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    },
};

// One exercise inside a past session, rebuilt from its individual set rows.
interface GroupedExercise {
    key: string;
    name: string;
    sets: ExerciseLog[];
    topWeight: number | null;
}

/**
 * The API returns one row per set. The history screen wants one tile per exercise,
 * headlined by the heaviest set - which is exactly what counts as the PR.
 */
const groupLogsByExercise = (logs: ExerciseLog[]): GroupedExercise[] => {
    const groups = new Map<string, GroupedExercise>();

    logs.forEach((log) => {
        // exercise_id is nullable (the trainer may have deleted the exercise), so fall
        // back to the name to avoid merging unrelated rows under a single "null" key.
        const key = log.exercise_id !== null ? `id-${log.exercise_id}` : `name-${log.exercise?.name ?? "unknown"}`;

        const existing = groups.get(key);
        if (existing) {
            existing.sets.push(log);
            if (log.weight_kg !== null && (existing.topWeight === null || log.weight_kg > existing.topWeight)) {
                existing.topWeight = log.weight_kg;
            }
        } else {
            groups.set(key, {
                key,
                name: log.exercise?.name || "Unknown",
                sets: [log],
                topWeight: log.weight_kg,
            });
        }
    });

    return Array.from(groups.values());
};

export default function Workouts() {
    // --- STATE ---
    const [activeTab, setActiveTab] = useState<"explore" | "my_plans" | "history">("my_plans");
    const [loading, setLoading] = useState(true);

    const [publicPlans, setPublicPlans] = useState<WorkoutPlan[]>([]);
    const [savedPlans, setSavedPlans] = useState<WorkoutPlan[]>([]);
    const [privatePlans, setPrivatePlans] = useState<WorkoutPlan[]>([]);
    const [history, setHistory] = useState<WorkoutSession[]>([]);

    // Modal state
    const [activeWorkout, setActiveWorkout] = useState<WorkoutPlan | null>(null);

    // --- DATA FETCHING ---
    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const histRes = await api.get("/workouts/history");
            setHistory(histRes.data);

            const savedRes = await api.get("/workouts/my-plans");
            const privateRes = await api.get("/workouts/my-private-plans");
            setSavedPlans(savedRes.data);
            setPrivatePlans(privateRes.data);

            const trainersRes = await api.get("/workouts/trainers");
            let allPublic: WorkoutPlan[] = [];
            for (const t of trainersRes.data as Trainer[]) {
                const pRes = await api.get(`/workouts/trainers/${t.id}/plans`);
                allPublic = [...allPublic, ...pRes.data];
            }
            setPublicPlans(allPublic);

        } catch (err) {
            console.error("Failed to load workout data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAllData();
    }, [fetchAllData]);

    // --- ACTIONS ---
    const handleFollowPlan = async (planId: number) => {
        try {
            await api.post(`/workouts/${planId}/follow`);
            await fetchAllData();
            setActiveTab("my_plans");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                window.alert(err.response?.data?.detail || "Failed to follow plan.");
            }
        }
    };

    // The modal owns the logging itself, we only refresh and switch to the history tab.
    const handleWorkoutSaved = async () => {
        setActiveWorkout(null);
        await fetchAllData();
        setActiveTab("history");
    };

    // --- RENDER HELPERS ---
    // Every plan on the page goes through here, assigned ones included. They are ordinary
    // cards that happen to wear an emerald accent, not a separate widget.
    const renderPlanCard = (plan: WorkoutPlan, type: PlanCardType) => {
        const badge = CARD_BADGE[type];

        return (
            <div
                key={plan.id}
                className={`relative overflow-hidden border rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col justify-between ${CARD_SHELL[type]}`}
            >
                {/* Accent stripe: the one element that makes the card type readable at a glance */}
                <div className={`absolute inset-y-0 left-0 w-1.5 ${CARD_STRIPE[type]}`}></div>

                <div className="pl-2">
                    <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{plan.name}</h3>
                        <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${badge.className}`}>
                            {badge.label}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

                    <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50 mb-6">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Exercises ({plan.exercises.length})</p>
                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                            {plan.exercises.slice(0, 3).map((ex) => (
                                <li key={ex.id} className="flex justify-between gap-3">
                                    <span className="truncate">{ex.name}</span>
                                    <span className="text-gray-500 shrink-0">{ex.sets}x{ex.reps}</span>
                                </li>
                            ))}
                            {plan.exercises.length > 3 && (
                                <li className="text-xs text-blue-500 font-bold pt-1">+{plan.exercises.length - 3} more...</li>
                            )}
                        </ul>
                    </div>
                </div>

                <div className="pl-2">
                    {type === "explore" ? (
                        <button
                            onClick={() => void handleFollowPlan(plan.id)}
                            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-900 dark:text-white font-bold py-2.5 rounded-xl transition-colors"
                        >
                            Save & Follow Plan
                        </button>
                    ) : (
                        <button
                            onClick={() => setActiveWorkout(plan)}
                            className={`w-full text-white font-bold py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.99] touch-manipulation ${
                                type === "assigned"
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                            }`}
                        >
                            Start Workout 🚀
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // --- MY PLANS LIBRARY ---
    // Assigned plans lead: what a trainer built for you outranks anything you saved
    // yourself. The id filter is cheap insurance - the two endpoints should never return
    // the same plan, but if they ever did React would warn about duplicate keys and the
    // plan would be drawn twice.
    const myPlans = useMemo(() => {
        const assignedIds = new Set(privatePlans.map(p => p.id));
        return [
            ...privatePlans.map(plan => ({ plan, type: "assigned" as const })),
            ...savedPlans
                .filter(p => !assignedIds.has(p.id))
                .map(plan => ({ plan, type: "my_plan" as const })),
        ];
    }, [privatePlans, savedPlans]);

    if (loading) return <div className="p-6 text-gray-500 font-bold">Loading workouts...</div>;

    const savedPlanIds = savedPlans.map(p => p.id);
    const availablePublicPlans = publicPlans.filter(p => !savedPlanIds.includes(p.id));

    return (
        <div className="max-w-6xl mx-auto flex flex-col h-full">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Workout Center
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Find plans, crush your sets, and track your progress.
                </p>
            </div>

            {/* TABS NAVIGATION */}
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-900 rounded-2xl w-full sm:w-fit mb-8 border border-gray-200 dark:border-slate-800 transition-colors">
                <button
                    onClick={() => setActiveTab("my_plans")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "my_plans" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    📁 My Plans
                </button>
                <button
                    onClick={() => setActiveTab("explore")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "explore" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    🏋️ Explore
                </button>
                <button
                    onClick={() => setActiveTab("history")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "history" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    📈 History
                </button>
            </div>

            {/* TAB CONTENT: MY PLANS */}
            {activeTab === "my_plans" && (
                <div>
                    {/* The member's whole library in one grid: assigned plans first, then saved ones. */}
                    {myPlans.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-gray-200 dark:border-slate-800 text-center transition-colors">
                            <span className="text-4xl mb-4 block">🏃‍♂️</span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No plans yet</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't saved any plans yet. Go to Explore or ask your trainer!</p>
                            <button onClick={() => setActiveTab("explore")} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Go to Explore</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {myPlans.map(({ plan, type }) => renderPlanCard(plan, type))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: EXPLORE */}
            {activeTab === "explore" && (
                <div>
                    {availablePublicPlans.length === 0 ? (
                        <div className="bg-gray-50 dark:bg-slate-900/50 p-8 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 text-center text-gray-500 transition-colors">
                            No new public plans available right now.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {availablePublicPlans.map(p => renderPlanCard(p, "explore"))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: HISTORY & PROGRESS */}
            {activeTab === "history" && (
                <div className="flex flex-col gap-8">
                    <ProgressCard sessions={history} />

                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Past Sessions</h2>
                        {history.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-500 text-center transition-colors">
                                You haven't logged any workouts yet.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {history.map(session => {
                                    const exercises = groupLogsByExercise(session.exercise_logs);

                                    return (
                                        <div key={session.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="font-bold text-gray-900 dark:text-white">
                                                    {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                                </h3>
                                                <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                                                    {exercises.length} {exercises.length === 1 ? "Exercise" : "Exercises"}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {exercises.map(group => (
                                                    <div key={group.key} className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={group.name}>
                                                            {group.name}
                                                        </p>
                                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-black mt-0.5">
                                                            {group.sets.length} {group.sets.length === 1 ? "set" : "sets"}
                                                            {group.topWeight !== null ? ` · top ${group.topWeight} kg` : " · bodyweight"}
                                                        </p>

                                                        {/* The set by set breakdown, which is the whole point of per-set rows */}
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {group.sets.map(set => (
                                                                <span
                                                                    key={set.id}
                                                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400"
                                                                >
                                                                    {set.weight_kg !== null ? `${set.weight_kg}×${set.reps_completed}` : `${set.reps_completed} reps`}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {session.notes && (
                                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-sm text-gray-500 dark:text-gray-400 italic">
                                                    "{session.notes}"
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- LIVE WORKOUT MODAL --- */}
            {/* key= remounts the modal per plan, so the set grid is always rebuilt fresh */}
            {activeWorkout && (
                <LiveWorkoutModal
                    key={activeWorkout.id}
                    plan={activeWorkout}
                    onClose={() => setActiveWorkout(null)}
                    onSaved={() => void handleWorkoutSaved()}
                />
            )}
        </div>
    );
}