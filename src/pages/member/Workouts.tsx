import { useEffect, useState, useCallback } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";
import { ProgressCard } from "../../components/ProgressCard";

// --- INTERFACES ---
interface Exercise {
    id: number;
    name: string;
    sets: number;
    reps: string;
    rest_time_seconds: number;
    requires_weight: boolean;
}

interface WorkoutPlan {
    id: number;
    trainer_id: number;
    client_id: number | null;
    name: string;
    description: string;
    exercises: Exercise[];
}

interface ExerciseLog {
    id: number;
    exercise_id: number;
    sets_completed: number;
    reps_completed: string;
    weight_kg: number | null;
    exercise: Exercise;
}

interface WorkoutSession {
    id: number;
    user_id: number;
    plan_id: number;
    date: string;
    notes: string;
    exercise_logs: ExerciseLog[];
}

interface Trainer {
    id: number;
    first_name: string;
}

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
    const [workoutLog, setWorkoutLog] = useState<{ [exerciseId: number]: string }>({});
    const [workoutNotes, setWorkoutNotes] = useState("");
    const [isSubmittingLog, setIsSubmittingLog] = useState(false);

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

    const handleLogWorkout = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!activeWorkout) return;
        setIsSubmittingLog(true);

        try {
            const payload = {
                plan_id: activeWorkout.id,
                notes: workoutNotes,
                exercises: activeWorkout.exercises.map((ex) => ({
                    exercise_id: ex.id,
                    sets_completed: ex.sets,
                    reps_completed: ex.reps,
                    weight_kg: workoutLog[ex.id] ? parseFloat(workoutLog[ex.id]) : null
                }))
            };

            await api.post("/workouts/log-session", payload);

            setActiveWorkout(null);
            setWorkoutLog({});
            setWorkoutNotes("");
            await fetchAllData();
            setActiveTab("history");

        } catch (err) {
            window.alert("Failed to save workout session.");
            console.error(err);
        } finally {
            setIsSubmittingLog(false);
        }
    };

    // --- RENDER HELPERS ---
    const renderPlanCard = (plan: WorkoutPlan, type: "explore" | "my_plan" | "private") => (
        <div key={plan.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                    {type === "private" && (
                        <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[10px] font-black uppercase px-2 py-1 rounded-full border border-green-200 dark:border-green-800">
                            Assigned 🟢
                        </span>
                    )}
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
                    {privatePlans.length === 0 && savedPlans.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-gray-200 dark:border-slate-800 text-center transition-colors">
                            <span className="text-4xl mb-4 block">🏃‍♂️</span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No active plans</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't saved any plans yet. Go to Explore or ask your trainer!</p>
                            <button onClick={() => setActiveTab("explore")} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Go to Explore</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {privatePlans.map(p => renderPlanCard(p, "private"))}
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
                                {history.map(session => (
                                    <div key={session.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                                        <div className="flex justify-between items-center mb-3">
                                            <h3 className="font-bold text-gray-900 dark:text-white">
                                                {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                            </h3>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                                                {session.exercise_logs.length} Exercises
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                            {session.exercise_logs.map(log => (
                                                <div key={log.id} className="bg-gray-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={log.exercise?.name}>
                                                        {log.exercise?.name || "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-black mt-0.5">
                                                        {log.weight_kg ? `${log.weight_kg} kg` : "Bodyweight"}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        {session.notes && (
                                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-sm text-gray-500 dark:text-gray-400 italic">
                                                "{session.notes}"
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- WORKOUT LOGGING MODAL --- */}
            {activeWorkout && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => !isSubmittingLog && setActiveWorkout(null)}
                    ></div>

                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-slate-800">
                        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Active Workout</h2>
                                <p className="text-sm text-blue-600 dark:text-blue-400 font-bold">{activeWorkout.name}</p>
                            </div>
                            <button
                                onClick={() => setActiveWorkout(null)}
                                disabled={isSubmittingLog}
                                className="h-10 w-10 bg-gray-200 dark:bg-slate-800 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 rounded-full flex items-center justify-center transition-colors font-bold text-gray-600 dark:text-gray-400"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <form id="workout-form" onSubmit={(e) => void handleLogWorkout(e)} className="flex flex-col gap-6">

                                {activeWorkout.exercises.map((ex, idx) => (
                                    <div key={ex.id} className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center font-black">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white text-lg">{ex.name}</p>
                                                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                                    Target: {ex.sets} sets × {ex.reps} reps
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-bold text-gray-600 dark:text-gray-300">Weight (kg):</label>
                                            {ex.requires_weight ? (
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    placeholder="e.g. 60"
                                                    value={workoutLog[ex.id] || ""}
                                                    onChange={(e) => setWorkoutLog({...workoutLog, [ex.id]: e.target.value})}
                                                    className="w-24 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold"
                                                />
                                            ) : (
                                                <div className="w-24 bg-gray-100 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-gray-500 p-2.5 rounded-xl text-center font-bold text-xs flex items-center justify-center select-none uppercase tracking-wider">
                                                    N/A
                                                </div>
                                            )}
                                        </div>
                                    </div> // <--- OVO JE FALILO
                                ))}

                                <div className="mt-2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                        Session Notes (Optional)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={workoutNotes}
                                        onChange={(e) => setWorkoutNotes(e.target.value)}
                                        placeholder="How did you feel? Hit any PRs?"
                                        className="w-full bg-gray-50 dark:bg-slate-800/50 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-4 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                    ></textarea>
                                </div>
                            </form>
                        </div>

                        <div className="p-6 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <button
                                type="submit"
                                form="workout-form"
                                disabled={isSubmittingLog}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 text-lg flex justify-center items-center gap-2"
                            >
                                {isSubmittingLog ? "Saving..." : "✅ Finish & Save Workout"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}