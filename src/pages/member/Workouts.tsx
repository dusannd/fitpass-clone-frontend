import { useEffect, useState, useCallback } from "react";
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
    // Assigned plans are not drawn by this helper - they get the richer card in the
    // "Assigned by Your Trainer" section above the tabs.
    const renderPlanCard = (plan: WorkoutPlan, type: "explore" | "my_plan") => (
        <div key={plan.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                    {type === "explore" && (
                        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase px-2 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                            Public 🔵
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

                <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50 mb-6">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Exercises ({plan.exercises.length})</p>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                        {plan.exercises.slice(0, 3).map((ex) => (
                            <li key={ex.id} className="flex justify-between">
                                <span>{ex.name}</span>
                                <span className="text-gray-500">{ex.sets}x{ex.reps}</span>
                            </li>
                        ))}
                        {plan.exercises.length > 3 && (
                            <li className="text-xs text-blue-500 font-bold pt-1">+{plan.exercises.length - 3} more...</li>
                        )}
                    </ul>
                </div>
            </div>

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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors shadow-sm"
                >
                    Start Workout 🚀
                </button>
            )}
        </div>
    );

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

            {/*
              ASSIGNED BY YOUR TRAINER
              Sits above the tabs on purpose. What your trainer built specifically for you
              is the single most important thing on this page, so it should never be hidden
              behind a tab next to plans you saved yourself.
            */}
            {privatePlans.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">🎯</span>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">Assigned by Your Trainer</h2>
                        <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                            {privatePlans.length} {privatePlans.length === 1 ? "plan" : "plans"}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {privatePlans.map((plan) => (
                            <div
                                key={plan.id}
                                className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-blue-950/30 p-6 shadow-sm hover:shadow-lg transition-shadow flex flex-col"
                            >
                                {/* Accent stripe so the card reads as "special" at a glance */}
                                <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-500 to-blue-500"></div>

                                <div className="flex-1 pl-2">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                                        Personal Plan
                                    </p>
                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                                        {plan.name}
                                    </h3>
                                    {plan.description && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5">{plan.description}</p>
                                    )}

                                    {/* Exercise chips: enough of a preview to know what you are walking into */}
                                    <div className="flex flex-wrap gap-1.5 mt-4">
                                        {plan.exercises.slice(0, 4).map((ex) => (
                                            <span
                                                key={ex.id}
                                                className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700"
                                            >
                                                {ex.name} · {ex.sets}×{ex.reps}
                                            </span>
                                        ))}
                                        {plan.exercises.length > 4 && (
                                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-700">
                                                +{plan.exercises.length - 4} more
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => setActiveWorkout(plan)}
                                    className="w-full mt-6 ml-0 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.99] touch-manipulation text-base"
                                >
                                    Start Workout 🚀
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                    {/*
                      Only plans the member saved themselves. The ones their trainer
                      assigned have their own section above the tabs, so listing them
                      here as well would show every assigned plan twice on one screen.
                    */}
                    {savedPlans.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-gray-200 dark:border-slate-800 text-center transition-colors">
                            <span className="text-4xl mb-4 block">🏃‍♂️</span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No saved plans</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't saved any plans yet. Go to Explore or ask your trainer!</p>
                            <button onClick={() => setActiveTab("explore")} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Go to Explore</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {savedPlans.map(p => renderPlanCard(p, "my_plan"))}
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