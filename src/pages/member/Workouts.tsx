import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

// --- TYPESCRIPT INTERFACES ---
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
    exercise: { name: string };
    sets_completed: number;
    reps_completed: string;
    weight_kg: number;
}

interface WorkoutSession {
    id: number;
    date: string;
    notes: string;
    exercise_logs: ExerciseLog[];
}

// Form state for logging an exercise
interface LogInput {
    exercise_id: number;
    sets_completed: number;
    reps_completed: string;
    weight_kg: number;
}

export default function Workouts() {
    const [trainers, setTrainers] = useState<User[]>([]);
    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [history, setHistory] = useState<WorkoutSession[]>([]);

    const [selectedTrainer, setSelectedTrainer] = useState<string>("");
    const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);

    // State for the active workout session form
    const [notes, setNotes] = useState("");
    const [logInputs, setLogInputs] = useState<LogInput[]>([]);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // 1. Fetch initial data (Trainers & History)
    const fetchInitialData = useCallback(async () => {
        try {
            const [trainersRes, historyRes] = await Promise.all([
                api.get("/workouts/trainers"),
                api.get("/workouts/history")
            ]);
            setTrainers(trainersRes.data);
            setHistory(historyRes.data);
        } catch {
            setError("Failed to load initial data.");
        }
    }, []);

    useEffect(() => {
        void fetchInitialData();
    }, [fetchInitialData]);

    // 2. Fetch plans when a trainer is selected
    const handleTrainerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const trainerId = e.target.value;
        setSelectedTrainer(trainerId);
        setSelectedPlan(null);
        setPlans([]);

        if (!trainerId) return;

        try {
            const res = await api.get(`/workouts/trainers/${trainerId}/plans`);
            setPlans(res.data);
        } catch {
            setError("Failed to load trainer's plans.");
        }
    };

    // 3. Setup form when a plan is selected
    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const planId = parseInt(e.target.value);
        const plan = plans.find((p) => p.id === planId) || null;
        setSelectedPlan(plan);

        if (plan) {
            // Pre-fill the form with the target sets/reps so the user just types the weight
            const initialLogs = plan.exercises.map((ex) => ({
                exercise_id: ex.id,
                sets_completed: ex.sets,
                reps_completed: ex.reps,
                weight_kg: 0,
            }));
            setLogInputs(initialLogs);
        } else {
            setLogInputs([]);
        }
    };

    // 4. Update specific exercise log
    const handleLogChange = (index: number, field: keyof LogInput, value: string | number) => {
        const newLogs = [...logInputs];
        newLogs[index] = { ...newLogs[index], [field]: value };
        setLogInputs(newLogs);
    };

    // 5. Submit the workout session
    const handleSubmitWorkout = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (!selectedPlan) return;

        try {
            await api.post("/workouts/log-session", {
                plan_id: selectedPlan.id,
                notes: notes,
                exercises: logInputs,
            });

            setMessage("Workout logged successfully! Great job! 💪");
            setNotes("");
            setSelectedPlan(null);
            setSelectedTrainer("");

            // Refresh history
            const historyRes = await api.get("/workouts/history");
            setHistory(historyRes.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to log workout.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">

            {/* LEFT SIDE: LOG WORKOUT FORM */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Log a Workout</h2>
                    <p className="text-gray-600 mb-6">Select a trainer's plan and track your performance.</p>

                    {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 font-bold">{message}</div>}
                    {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-bold">{error}</div>}

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
                                        <p className="font-bold text-gray-700 mb-2">{ex.name} <span className="text-xs font-normal text-gray-500">(Target: {ex.sets}x{ex.reps})</span></p>
                                        <div className="flex gap-2">
                                            <div className="w-1/3">
                                                <label className="block text-xs font-bold text-gray-500">Sets Done</label>
                                                <input
                                                    type="number"
                                                    value={logInputs[i]?.sets_completed || 0}
                                                    onChange={(e) => handleLogChange(i, "sets_completed", parseInt(e.target.value))}
                                                    className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                                    required min="1"
                                                />
                                            </div>
                                            <div className="w-1/3">
                                                <label className="block text-xs font-bold text-gray-500">Reps Done</label>
                                                <input
                                                    type="text"
                                                    value={logInputs[i]?.reps_completed || ""}
                                                    onChange={(e) => handleLogChange(i, "reps_completed", e.target.value)}
                                                    className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                                    required
                                                />
                                            </div>
                                            <div className="w-1/3">
                                                <label className="block text-xs font-bold text-gray-500">Weight (kg)</label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={logInputs[i]?.weight_kg || 0}
                                                    onChange={(e) => handleLogChange(i, "weight_kg", parseFloat(e.target.value))}
                                                    className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                                    required min="0"
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

                            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 transition">
                                Finish & Save Workout
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* RIGHT SIDE: HISTORY */}
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
                                    <p className="text-sm text-gray-600 italic mb-4 bg-gray-50 p-2 rounded">
                                        "{session.notes}"
                                    </p>
                                )}

                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-xs uppercase bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="py-2 px-1">Exercise</th>
                                        <th className="py-2 px-1 text-center">Sets x Reps</th>
                                        <th className="py-2 px-1 text-right">Weight</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {session.exercise_logs.map((log, i) => (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="py-2 px-1 font-medium">{log.exercise?.name || "Unknown"}</td>
                                            <td className="py-2 px-1 text-center">{log.sets_completed} x {log.reps_completed}</td>
                                            <td className="py-2 px-1 text-right font-bold text-blue-600">{log.weight_kg} kg</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}