import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";

// --- INTERFACES ---
interface Plan {
    id: number;
    name: string;
    description: string;
    price: number;
    duration_days: number;
    is_active: boolean;
}

export default function ManagePlans() {
    // --- STATE ---
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form fields
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number>(3000);
    const [durationDays, setDurationDays] = useState<number>(30);
    const [locationIdsString, setLocationIdsString] = useState("3");

    // --- FETCH DATA ---
    const fetchPlans = useCallback(async () => {
        try {
            const res = await api.get("/subscriptions/plans");
            setPlans(res.data);
            setError("");
        } catch {
            setError("Failed to load plans.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchPlans();
    }, [fetchPlans]);

    // --- ACTIONS ---
    const handleCreatePlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setIsSubmitting(true);

        try {
            // Convert comma-separated string to an array of integers (e.g. "1, 3" -> [1, 3])
            const locationArray = locationIdsString
                .split(",")
                .map((id) => parseInt(id.trim(), 10))
                .filter((id) => !isNaN(id));

            await api.post("/subscriptions/plans", {
                name,
                description,
                price,
                duration_days: durationDays,
                location_ids: locationArray,
            });

            setSuccessMsg(`Plan "${name}" successfully created!`);

            // Clear form inputs
            setName("");
            setDescription("");
            setPrice(3000);
            setDurationDays(30);

            // Refresh the list immediately
            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="p-6 text-gray-500 font-bold">Loading plans...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-8 h-full">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Manage Subscription Plans
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Create new pricing packages and assign them to physical gym locations.
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">

                {/* LEFT COLUMN: CREATE PLAN FORM */}
                <div className="w-full lg:w-1/3 sticky top-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                            Create New Plan
                        </h2>

                        {successMsg && (
                            <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl mb-6 text-sm font-bold border border-emerald-200 dark:border-emerald-800 transition-colors">
                                ✅ {successMsg}
                            </div>
                        )}
                        {error && (
                            <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-4 rounded-xl mb-6 text-sm font-bold border border-rose-200 dark:border-rose-800 transition-colors">
                                ❌ {error}
                            </div>
                        )}

                        <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Plan Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Gold VIP"
                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Description
                                </label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Full 24/7 Access"
                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Price (RSD)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        value={price}
                                        onChange={(e) => setPrice(parseInt(e.target.value, 10) || 0)}
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Duration (Days)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={durationDays}
                                        onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* GYM LOCATION IDs */}
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl transition-colors">
                                <label className="block text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">
                                    Allowed Gym Locations (IDs)
                                </label>
                                <p className="text-xs text-blue-700 dark:text-blue-400 mb-3 opacity-80">
                                    Separate with commas (e.g. 1, 3)
                                </p>
                                <input
                                    type="text"
                                    required
                                    value={locationIdsString}
                                    onChange={(e) => setLocationIdsString(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 mt-2"
                            >
                                {isSubmitting ? "Creating..." : "Create Plan"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* RIGHT COLUMN: EXISTING PLANS LIST */}
                <div className="w-full lg:w-2/3">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                        Existing Plans
                    </h2>

                    {plans.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl text-center border border-gray-200 dark:border-slate-800 text-gray-500 transition-colors">
                            No plans created yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {plans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200 flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                                                {plan.name}
                                            </h3>
                                            <span
                                                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                    plan.is_active
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                                        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
                                                }`}
                                            >
                                                {plan.is_active ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                            {plan.description || "No description provided."}
                                        </p>
                                    </div>

                                    {/* PLAN METRICS */}
                                    <div className="flex justify-between items-center text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Price</span>
                                            <span className="text-blue-600 dark:text-blue-400 text-lg">{plan.price} RSD</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Duration</span>
                                            <span className="text-gray-900 dark:text-white text-lg">{plan.duration_days} <span className="text-sm font-medium">Days</span></span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}