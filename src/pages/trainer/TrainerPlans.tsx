import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

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

    // Clean useEffect implementation
    useEffect(() => {
        api.get("/trainer/plans")
            .then((res) => {
                setPlans(res.data);
                setLoading(false);
            })
            .catch(() => {
                setError("Failed to load your workout plans.");
                setLoading(false);
            });
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

            // Manually refresh plans list
            const res = await api.get("/trainer/plans");
            setPlans(res.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6">Loading plans...</div>;

    return (
        <div className="flex flex-col gap-8 max-w-5xl">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Create Workout Plan</h1>
                <p className="text-gray-600 mb-6">Build a new routine for your clients or the public.</p>

                {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 font-bold">{message}</div>}
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-bold">{error}</div>}

                <form onSubmit={handleCreatePlan} className="flex flex-col gap-6">
                    <div className="flex gap-4">
                        <div className="w-1/2">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Plan Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="e.g. Upper Body Strength"
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Focus on chest and back."
                                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-700">Exercises</h3>
                            <button
                                type="button"
                                onClick={addExercise}
                                className="bg-green-600 text-white text-sm font-bold py-1 px-3 rounded hover:bg-green-700 transition"
                            >
                                + Add Exercise
                            </button>
                        </div>

                        {exercises.map((ex, index) => (
                            <div key={index} className="flex gap-2 items-end mb-3 bg-white p-3 rounded border border-gray-200 shadow-sm">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Exercise Name</label>
                                    <input
                                        type="text"
                                        value={ex.name}
                                        onChange={(e) => updateExercise(index, "name", e.target.value)}
                                        required
                                        placeholder="Bench Press"
                                        className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                    />
                                </div>
                                <div className="w-20">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Sets</label>
                                    <input
                                        type="number"
                                        value={ex.sets}
                                        onChange={(e) => updateExercise(index, "sets", parseInt(e.target.value))}
                                        required
                                        min="1"
                                        className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Reps</label>
                                    <input
                                        type="text"
                                        value={ex.reps}
                                        onChange={(e) => updateExercise(index, "reps", e.target.value)}
                                        required
                                        placeholder="8-10"
                                        className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-gray-600 mb-1">Rest (sec)</label>
                                    <input
                                        type="number"
                                        value={ex.rest_time_seconds}
                                        onChange={(e) => updateExercise(index, "rest_time_seconds", parseInt(e.target.value))}
                                        required
                                        min="0"
                                        className="w-full border border-gray-300 p-1.5 rounded text-sm"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeExercise(index)}
                                    className="bg-red-100 text-red-600 p-1.5 rounded hover:bg-red-200 transition h-8 w-8 flex items-center justify-center font-bold"
                                    title="Remove"
                                >
                                    X
                                </button>
                            </div>
                        ))}
                    </div>

                    <button type="submit" className="bg-gray-900 text-white font-bold py-3 px-4 rounded hover:bg-black transition">
                        Publish Plan
                    </button>
                </form>
            </div>

            <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">My Published Plans</h2>
                {plans.length === 0 ? (
                    <p className="text-gray-500">You haven't created any plans yet.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
                                <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Exercises ({plan.exercises.length})</p>
                                    <ul className="text-sm text-gray-700 space-y-1">
                                        {plan.exercises.map((ex, i) => (
                                            <li key={i} className="flex justify-between border-b border-gray-200 last:border-0 pb-1 last:pb-0">
                                                <span>{ex.name}</span>
                                                <span className="text-gray-500">{ex.sets}x{ex.reps}</span>
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