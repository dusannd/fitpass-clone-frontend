import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";

interface Exercise {
    name: string;
    sets: number;
    reps: string;
    rest_time_seconds: number;
}

interface WorkoutPlan {
    id: number;
    name: string;
    description: string;
    exercises: Exercise[];
}

export default function TrainerPlans() {
    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [loading, setLoading] = useState(true);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [exercises, setExercises] = useState<Exercise[]>([
        { name: "", sets: 3, reps: "10", rest_time_seconds: 60 },
    ]);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const fetchPlans = async () => {
        try {
            const res = await api.get("/trainer/plans");
            setPlans(res.data);
        } catch {
            setError("Failed to load your workout plans.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchPlans();
    }, []);

    const addExercise = () => {
        setExercises([...exercises, { name: "", sets: 3, reps: "10", rest_time_seconds: 60 }]);
    };

    const removeExercise = (index: number) => {
        setExercises(exercises.filter((_, i) => i !== index));
    };

    const updateExercise = (index: number, field: keyof Exercise, value: string | number) => {
        const newExercises = [...exercises];
        newExercises[index] = { ...newExercises[index], [field]: value };
        setExercises(newExercises);
    };

    const handleCreatePlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (exercises.length === 0) {
            return setError("You must add at least one exercise.");
        }
        if (exercises.some((ex) => !ex.name || !ex.reps)) {
            return setError("All exercises must have a name and reps filled out.");
        }

        try {
            await api.post("/trainer/plans", {
                name,
                description,
                exercises,
            });

            setMessage("Workout plan published successfully! 🎉");
            setName("");
            setDescription("");
            setExercises([{ name: "", sets: 3, reps: "10", rest_time_seconds: 60 }]);

            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    if (loading) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading plans...</div>;
    }

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto">
            {/* CREATE PLAN CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Create Workout Plan</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Build a new routine for your clients or the public.</p>

                {message && <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 p-3 rounded-xl mb-4 font-bold text-sm border border-green-200 dark:border-green-800">{message}</div>}
                {error && <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-3 rounded-xl mb-4 font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}

                <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Plan Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="e.g. Upper Body Strength"
                                className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Focus on chest and back."
                                className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* EXERCISES */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-800">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">Exercises</h3>
                            <button
                                type="button"
                                onClick={addExercise}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition"
                            >
                                + Add Exercise
                            </button>
                        </div>

                        {exercises.map((ex, index) => (
                            <div key={index} className="flex flex-wrap md:flex-nowrap gap-2 items-end mb-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                                <div className="flex-1 min-w-[140px]">
                                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Exercise Name</label>
                                    <input
                                        type="text"
                                        value={ex.name}
                                        onChange={(e) => updateExercise(index, "name", e.target.value)}
                                        required
                                        placeholder="Bench Press"
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div className="w-20">
                                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Sets</label>
                                    <input
                                        type="number"
                                        value={ex.sets}
                                        onChange={(e) => updateExercise(index, "sets", parseInt(e.target.value) || 1)}
                                        required
                                        min="1"
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Reps</label>
                                    <input
                                        type="text"
                                        value={ex.reps}
                                        onChange={(e) => updateExercise(index, "reps", e.target.value)}
                                        required
                                        placeholder="8-10"
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Rest (s)</label>
                                    <input
                                        type="number"
                                        value={ex.rest_time_seconds}
                                        onChange={(e) => updateExercise(index, "rest_time_seconds", parseInt(e.target.value) || 0)}
                                        required
                                        min="0"
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeExercise(index)}
                                    className="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 p-2 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/60 transition h-9 w-9 flex items-center justify-center font-bold"
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-md">
                        Publish Plan
                    </button>
                </form>
            </div>

            {/* MY PUBLISHED PLANS */}
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">My Published Plans</h2>
                {plans.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">You haven't created any plans yet.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{plan.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>
                                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-3 border border-gray-100 dark:border-slate-800">
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Exercises ({plan.exercises.length})</p>
                                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                                        {plan.exercises.map((ex, i) => (
                                            <li key={i} className="flex justify-between border-b border-gray-200/50 dark:border-slate-700/50 last:border-0 pb-1.5 last:pb-0">
                                                <span>{ex.name}</span>
                                                <span className="text-gray-500 dark:text-gray-400">{ex.sets}x{ex.reps}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}