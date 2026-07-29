import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";

// --- INTERFACES ---
interface Exercise {
    name: string;
    sets: number;
    reps: string;
    rest_time_seconds: number;
    requires_weight: boolean; // <-- NEW FIELD
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
    // Default state now includes requires_weight: true
    const [exercises, setExercises] = useState<Exercise[]>([
        { name: "", sets: 3, reps: "10", rest_time_seconds: 60, requires_weight: true },
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
        setExercises([...exercises, { name: "", sets: 3, reps: "10", rest_time_seconds: 60, requires_weight: true }]);
    };

    const removeExercise = (index: number) => {
        setExercises(exercises.filter((_, i) => i !== index));
    };

    const updateExercise = (index: number, field: keyof Exercise, value: string | number | boolean) => {
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
            setExercises([{ name: "", sets: 3, reps: "10", rest_time_seconds: 60, requires_weight: true }]);

            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading plans...</div>;

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto h-full">
            {/* CREATE PLAN CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Create Workout Plan</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Build a new routine for your clients or the public.</p>

                {message && <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6 font-bold text-sm border border-green-200 dark:border-green-800">{message}</div>}
                {error && <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-4 rounded-xl mb-6 font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}

                <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Plan Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="e.g. Upper Body Strength"
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                            />
                        </div>
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Focus on chest and back."
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* EXERCISES SECTION */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200">Exercises</h3>
                            <button
                                type="button"
                                onClick={addExercise}
                                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors"
                            >
                                + Add Exercise
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            {exercises.map((ex, index) => (
                                <div key={index} className="flex flex-col lg:flex-row gap-4 items-start lg:items-end bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm relative transition-colors">

                                    <div className="flex-1 w-full lg:min-w-[140px]">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Exercise Name</label>
                                        <input
                                            type="text"
                                            value={ex.name}
                                            onChange={(e) => updateExercise(index, "name", e.target.value)}
                                            required
                                            placeholder="e.g. Bench Press"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-20">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Sets</label>
                                        <input
                                            type="number"
                                            value={ex.sets}
                                            onChange={(e) => updateExercise(index, "sets", parseInt(e.target.value) || 1)}
                                            required
                                            min="1"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-24">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Reps</label>
                                        <input
                                            type="text"
                                            value={ex.reps}
                                            onChange={(e) => updateExercise(index, "reps", e.target.value)}
                                            required
                                            placeholder="8-10"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-24">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Rest (s)</label>
                                        <input
                                            type="number"
                                            value={ex.rest_time_seconds}
                                            onChange={(e) => updateExercise(index, "rest_time_seconds", parseInt(e.target.value) || 0)}
                                            required
                                            min="0"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>

                                    {/* WEIGHT TOGGLE CHECKBOX */}
                                    <div className="w-full lg:w-36 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800/50 transition-colors">
                                        <label className="text-xs font-bold text-blue-800 dark:text-blue-300 cursor-pointer select-none">
                                            Track Weight?
                                        </label>
                                        <input
                                            type="checkbox"
                                            checked={ex.requires_weight}
                                            onChange={(e) => updateExercise(index, "requires_weight", e.target.checked)}
                                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                        />
                                    </div>

                                    {/* REMOVE BUTTON */}
                                    <button
                                        type="button"
                                        onClick={() => removeExercise(index)}
                                        className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 p-3 rounded-xl transition-colors h-[46px] w-full lg:w-[46px] flex items-center justify-center font-bold"
                                        title="Remove Exercise"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-md text-lg mt-2">
                        Publish Workout Plan
                    </button>
                </form>
            </div>

            {/* MY PUBLISHED PLANS */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">My Published Plans</h2>
                {plans.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-900 p-8 rounded-2xl text-center border border-gray-200 dark:border-slate-800">
                        You haven't created any plans yet. Start building routines for your clients!
                    </p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200 flex flex-col justify-between">
                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 border border-gray-100 dark:border-slate-700/50">
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                                        Exercises ({plan.exercises.length})
                                    </p>
                                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                                        {plan.exercises.map((ex, i) => (
                                            <li key={i} className="flex justify-between items-center border-b border-gray-200/50 dark:border-slate-700/50 last:border-0 pb-2 last:pb-0">
                                                <span className="flex items-center gap-2 font-medium">
                                                    {ex.name}
                                                    {!ex.requires_weight && (
                                                        <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">
                                                            Bodyweight
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-gray-500 dark:text-gray-400 font-bold">{ex.sets} × {ex.reps}</span>
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