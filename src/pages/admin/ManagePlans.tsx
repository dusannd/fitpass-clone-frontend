import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";

interface Plan {
    id: number;
    name: string;
    description: string;
    price: number;
    duration_days: number;
    is_active: boolean;
}

export default function ManagePlans() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState<number>(3000);
    const [durationDays, setDurationDays] = useState<number>(30);
    const [locationIdsString, setLocationIdsString] = useState("3");

    // Refresh plans helper
    const refreshPlans = async () => {
        try {
            const res = await api.get("/subscriptions/plans");
            setPlans(res.data);
            setError("");
        } catch {
            setError("Failed to load plans.");
        }
    };

    // Safe useEffect on component mount
    useEffect(() => {
        let isMounted = true;

        const fetchInitialPlans = async () => {
            try {
                const res = await api.get("/subscriptions/plans");
                if (isMounted) {
                    setPlans(res.data);
                    setError("");
                }
            } catch {
                if (isMounted) {
                    setError("Failed to load plans.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void fetchInitialPlans();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleCreatePlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");

        try {
            const locationArray = locationIdsString
                .split(",")
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));

            await api.post("/subscriptions/plans", {
                name,
                description,
                price,
                duration_days: durationDays,
                location_ids: locationArray,
            });

            setSuccessMsg(`Plan "${name}" successfully created!`);
            setName("");
            setDescription("");

            await refreshPlans();
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
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
            {/* PAGE HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Manage Subscription Plans
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Create new pricing packages and assign gym locations.
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* CREATE PLAN FORM */}
                <div className="w-full lg:w-1/3">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 sticky top-6 transition-colors duration-200">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                            Create New Plan
                        </h2>

                        {successMsg && (
                            <div className="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 p-3 rounded-xl mb-4 text-sm font-bold border border-green-200 dark:border-green-800">
                                {successMsg}
                            </div>
                        )}
                        {error && (
                            <div className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 p-3 rounded-xl mb-4 text-sm font-bold border border-red-200 dark:border-red-800">
                                {error}
                            </div>
                        )}

                        <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Plan Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Gold VIP"
                                    className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                    Description
                                </label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Full 24/7 Access"
                                    className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        Price (RSD)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        value={price}
                                        onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                                        Duration (Days)
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={durationDays}
                                        onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                                        className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl">
                                <label className="block text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">
                                    Allowed Gym Locations (IDs)
                                </label>
                                <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
                                    Separate with commas (e.g. 1, 3)
                                </p>
                                <input
                                    type="text"
                                    required
                                    value={locationIdsString}
                                    onChange={(e) => setLocationIdsString(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 text-gray-900 dark:text-white p-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-md mt-2"
                            >
                                Create Plan
                            </button>
                        </form>
                    </div>
                </div>

                {/* LIST OF EXISTING PLANS */}
                <div className="w-full lg:w-2/3">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                        Existing Plans
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map((plan) => (
                            <div
                                key={plan.id}
                                className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg text-gray-800 dark:text-white">
                                            {plan.name}
                                        </h3>
                                        <span
                                            className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                                                plan.is_active
                                                    ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                                                    : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                                            }`}
                                        >
                                            {plan.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        {plan.description || "No description provided."}
                                    </p>
                                </div>

                                <div className="flex justify-between text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                                    <span className="text-blue-600 dark:text-blue-400">{plan.price} RSD</span>
                                    <span>{plan.duration_days} Days</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}