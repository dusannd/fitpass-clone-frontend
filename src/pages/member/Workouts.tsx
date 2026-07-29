import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";
import { ProgressCard } from "../../components/ProgressCard";
import type { WorkoutSessionItem } from "../../components/ProgressCard";

interface User {
    id: number;
    first_name: string;
    last_name: string;
}

interface Exercise {
    id: number;
    name: string;
    sets: number;
    reps: string;
}

interface WorkoutPlan {
    id: number;
    name: string;
    description: string;
    exercises: Exercise[];
}

interface ExerciseLog {
    id?: number;
    exercise: { id?: number; name: string } | null;
    sets_completed: number;
    reps_completed: string;
    weight_kg: number | null;
}

interface WorkoutSession {
    id: number;
    date: string;
    notes: string | null;
    exercise_logs: ExerciseLog[];
}

interface LogInput {
    exercise_id: number;
    sets_completed: number;
    reps_completed: string;
    weight_kg: number;
    is_bodyweight: boolean;
}

export default function Workouts() {
    // 1. DATA STATES
    const [trainers, setTrainers] = useState<User[]>([]);
    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [history, setHistory] = useState<WorkoutSession[]>([]);

    // 2. PAGINATION STATES
    const [skip, setSkip] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // 3. FORM STATES
    const [selectedTrainer, setSelectedTrainer] = useState<string>("");
    const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
    const [notes, setNotes] = useState("");
    const [logInputs, setLogInputs] = useState<LogInput[]>([]);

    // 4. UI STATES
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // --- FETCHING LOGIC ---

    // Safe function for refreshing data AFTER submitting a workout
    const refreshData = useCallback(async () => {
        try {
            const [trainersRes, historyRes] = await Promise.all([
                api.get("/workouts/trainers"),
                api.get("/workouts/history?skip=0&limit=10")
            ]);

            setTrainers(trainersRes.data as User[]);

            const fetchedHistory = historyRes.data as WorkoutSession[];
            setHistory(fetchedHistory);

            if (fetchedHistory.length < 10) setHasMore(false);
        } catch {
            setError("Failed to refresh data.");
        }
    }, []);

    // Safe useEffect for initial component mount
    useEffect(() => {
        let isMounted = true;

        const fetchInitialData = async () => {
            try {
                const [trainersRes, historyRes] = await Promise.all([
                    api.get("/workouts/trainers"),
                    api.get("/workouts/history?skip=0&limit=10")
                ]);

                if (isMounted) {
                    setTrainers(trainersRes.data as User[]);

                    const fetchedHistory = historyRes.data as WorkoutSession[];
                    setHistory(fetchedHistory);

                    if (fetchedHistory.length < 10) setHasMore(false);
                }
            } catch {
                if (isMounted) {
                    setError("Failed to load initial data.");
                }
            }
        };

        void fetchInitialData();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleLoadMore = async () => {
        setLoadingMore(true);
        const newSkip = skip + 10;

        try {
            const res = await api.get(`/workouts/history?skip=${newSkip}&limit=10`);
            const moreHistory = res.data as WorkoutSession[];

            if (moreHistory.length === 0) {
                setHasMore(false);
            } else {
                setHistory((prev) => [...prev, ...moreHistory]);
                setSkip(newSkip);
                if (moreHistory.length < 10) setHasMore(false);
            }
        } catch {
            setError("Failed to load older workouts.");
        } finally {
            setLoadingMore(false);
        }
    };

    // --- FORM LOGIC ---

    const handleTrainerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const trainerId = e.target.value;
        setSelectedTrainer(trainerId);
        setSelectedPlan(null);
        setPlans([]);

        if (!trainerId) return;

        try {
            const res = await api.get(`/workouts/trainers/${trainerId}/plans`);
            setPlans(res.data as WorkoutPlan[]);
        } catch {
            setError("Failed to load trainer's plans.");
        }
    };

    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const planId = parseInt(e.target.value);
        const plan = plans.find((p) => p.id === planId) || null;
        setSelectedPlan(plan);

        if (plan) {
            const initialLogs: LogInput[] = plan.exercises.map((ex) => ({
                exercise_id: ex.id,
                sets_completed: ex.sets,
                reps_completed: ex.reps,
                weight_kg: 0,
                is_bodyweight: false
            }));
            setLogInputs(initialLogs);
        } else {
            setLogInputs([]);
        }
    };

    const handleLogChange = (index: number, field: keyof LogInput, value: string | number | boolean) => {
        const newLogs = [...logInputs];
        newLogs[index] = { ...newLogs[index], [field]: value };
        setLogInputs(newLogs);
    };

    const handleSubmitWorkout = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (!selectedPlan) return;

        const invalidExercise = logInputs.find(log => !log.is_bodyweight && log.weight_kg <= 0);
        if (invalidExercise) {
            setError("If an exercise is not Bodyweight, the weight must be greater than 0 kg.");
            return;
        }

        const formattedLogs = logInputs.map(log => ({
            exercise_id: log.exercise_id,
            sets_completed: log.sets_completed,
            reps_completed: log.reps_completed,
            weight_kg: log.is_bodyweight ? 0 : log.weight_kg
        }));

        try {
            await api.post("/workouts/log-session", {
                plan_id: selectedPlan.id,
                notes: notes,
                exercises: formattedLogs,
            });

            setMessage("Workout logged successfully! Great job! 💪");

            // RESET FORM
            setNotes("");
            setSelectedPlan(null);
            setSelectedTrainer("");
            setSkip(0);
            setHasMore(true);

            // REFRESH LIST
            await refreshData();

        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to log workout.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    // --- RENDER ---

    return (
        <div className="flex flex-col gap-8 max-w-7xl mx-auto">
            {/* 1. TOP SECTION: PROGRESS CHART */}
            <ProgressCard sessions={history as unknown as WorkoutSessionItem[]} />

            {/* 2. MAIN TWO-COLUMN SECTION */}
            <div className="flex flex-col lg:flex-row gap-8">
                {/* LEFT SIDE: LOG WORKOUT FORM */}
                <div className="w-full lg:w-1/2 flex flex-col gap-6">
                    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Log a Workout</h2>
                        <p className="text-gray-600 mb-6">Select a trainer's plan and track your performance.</p>

                        {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 font-bold text-sm">{message}</div>}
                        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-bold text-sm">{error}</div>}

                        {/* Trainer & Plan Selection */}
                        <div className="flex flex-col gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Select Trainer</label>
                                <select
                                    value={selectedTrainer}
                                    onChange={(e) => void handleTrainerChange(e)}
                                    className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">-- Choose a Trainer --</option>
                                    {trainers.map((t) => (
                                        <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedTrainer && (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Select Plan</label>
                                    <select
                                        value={selectedPlan?.id || ""}
                                        onChange={handlePlanChange}
                                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                                    >
                                        <option value="">-- Choose a Workout Plan --</option>
                                        {plans.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Active Logging Form */}
                        {selectedPlan && (
                            <form onSubmit={(e) => void handleSubmitWorkout(e)} className="flex flex-col gap-4 border-t border-gray-200 pt-6">
                                <h3 className="font-bold text-lg text-gray-800">{selectedPlan.name}</h3>
                                <p className="text-sm text-gray-500 mb-2">{selectedPlan.description}</p>

                                <div className="bg-gray-50 p-4 rounded border border-gray-200 space-y-4">
                                    {selectedPlan.exercises.map((ex, i) => (
                                        <div key={ex.id} className="bg-white p-3 rounded shadow-sm border border-gray-200">

                                            <div className="flex justify-between items-center mb-2">
                                                <p className="font-bold text-gray-700">
                                                    {ex.name} <span className="text-xs font-normal text-gray-500">(Target: {ex.sets}x{ex.reps})</span>
                                                </p>

                                                {/* BODYWEIGHT CHECKBOX */}
                                                <label className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200 transition">
                                                    <input
                                                        type="checkbox"
                                                        checked={logInputs[i]?.is_bodyweight || false}
                                                        onChange={(e) => handleLogChange(i, "is_bodyweight", e.target.checked)}
                                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                    />
                                                    Bodyweight
                                                </label>
                                            </div>

                                            <div className="flex gap-2">
                                                <div className="w-1/3">
                                                    <label className="block text-xs font-bold text-gray-500">Sets Done</label>
                                                    <input
                                                        type="number"
                                                        value={logInputs[i]?.sets_completed || ""}
                                                        onChange={(e) => handleLogChange(i, "sets_completed", parseInt(e.target.value) || 0)}
                                                        className="w-full border border-gray-300 p-1.5 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                        required min="1"
                                                    />
                                                </div>
                                                <div className="w-1/3">
                                                    <label className="block text-xs font-bold text-gray-500">Reps Done</label>
                                                    <input
                                                        type="text"
                                                        value={logInputs[i]?.reps_completed || ""}
                                                        onChange={(e) => handleLogChange(i, "reps_completed", e.target.value)}
                                                        className="w-full border border-gray-300 p-1.5 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                        required
                                                    />
                                                </div>
                                                <div className="w-1/3">
                                                    <label className="block text-xs font-bold text-gray-500">Weight (kg)</label>
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        disabled={logInputs[i]?.is_bodyweight}
                                                        value={logInputs[i]?.is_bodyweight ? 0 : (logInputs[i]?.weight_kg || "")}
                                                        onChange={(e) => handleLogChange(i, "weight_kg", parseFloat(e.target.value) || 0)}
                                                        className={`w-full border p-1.5 rounded text-sm focus:ring-2 focus:ring-blue-500 ${
                                                            logInputs[i]?.is_bodyweight ? "bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed" : "border-gray-300 bg-white text-black"
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Session Notes (Optional)</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Felt strong today!"
                                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 h-20"
                                    />
                                </div>

                                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition shadow-sm">
                                    Finish & Save Workout
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* RIGHT SIDE: HISTORY WITH PAGINATION */}
                <div className="w-full lg:w-1/2">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Workout History</h2>

                    {history.length === 0 ? (
                        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 text-center text-gray-500">
                            You haven't logged any workouts yet. Time to hit the gym!
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {history.map((session) => (
                                <div key={session.id} className="bg-white rounded-lg shadow-sm p-5 border border-gray-200">
                                    <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-lg">Workout Session</h3>
                                            <p className="text-xs text-gray-500">{new Date(session.date).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {session.notes && (
                                        <p className="text-sm text-gray-600 italic mb-4 bg-gray-50 p-2 rounded border border-gray-100">
                                            "{session.notes}"
                                        </p>
                                    )}

                                    <table className="w-full text-sm text-left text-gray-600">
                                        <thead className="text-xs uppercase bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="py-2 px-1 rounded-tl">Exercise</th>
                                            <th className="py-2 px-1 text-center">Sets x Reps</th>
                                            <th className="py-2 px-1 text-right rounded-tr">Weight</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {session.exercise_logs.map((log, i) => {
                                            const isBodyweight = log.weight_kg === null || log.weight_kg === 0;

                                            return (
                                                <tr key={i} className="border-t border-gray-100">
                                                    <td className="py-2 px-1 font-medium">{log.exercise?.name || "Unknown"}</td>
                                                    <td className="py-2 px-1 text-center">{log.sets_completed} x {log.reps_completed}</td>
                                                    <td className="py-2 px-1 text-right font-bold">
                                                        {isBodyweight ? (
                                                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs">Bodyweight</span>
                                                        ) : (
                                                            <span className="text-blue-600">{log.weight_kg} kg</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            ))}

                            {/* LOAD MORE BUTTON */}
                            {hasMore && (
                                <button
                                    onClick={() => void handleLoadMore()}
                                    disabled={loadingMore}
                                    className="w-full bg-gray-100 text-gray-700 border border-gray-300 font-bold py-3 rounded hover:bg-gray-200 transition mt-2 disabled:opacity-50"
                                >
                                    {loadingMore ? "Loading..." : "Load Older Workouts ⬇️"}
                                </button>
                            )}
                            {!hasMore && history.length > 0 && (
                                <div className="text-center text-sm text-gray-400 mt-2 italic">
                                    You have reached the end of your history.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}