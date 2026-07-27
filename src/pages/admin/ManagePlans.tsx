import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

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

    // Helper function exclusively for button clicks
    const refreshPlans = async () => {
        try {
            const res = await api.get("/subscriptions/plans");
            setPlans(res.data);
            setError("");
        } catch {
            setError("Failed to load plans.");
        }
    };

    // Safe useEffect for initial mount
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
                .map(id => parseInt(id.trim()))
                .filter(id => !isNaN(id));

            await api.post("/subscriptions/plans", {
                name,
                description,
                price,
                duration_days: durationDays,
                location_ids: locationArray
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

    if (loading) return <div className="p-6">Loading...</div>;

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Manage Subscription Plans</h1>
                <p className="text-gray-600 mt-2">Create new pricing packages and assign gym locations.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* CREATE PLAN FORM */}
                <div className="w-full lg:w-1/3">
                    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 sticky top-6">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Create New Plan</h2>

                        {successMsg && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm font-bold">{successMsg}</div>}
                        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm font-bold">{error}</div>}

                        <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Plan Name</label>
                                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold VIP" className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Full 24/7 Access" className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500" />
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Price (RSD)</label>
                                    <input type="number" required min="0" value={price} onChange={(e) => setPrice(parseInt(e.target.value))} className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Duration (Days)</label>
                                    <input type="number" required min="1" value={durationDays} onChange={(e) => setDurationDays(parseInt(e.target.value))} className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>

                            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                                <label className="block text-sm font-bold text-blue-900 mb-1">Allowed Gym Locations (IDs)</label>
                                <p className="text-xs text-blue-700 mb-2">Separate with commas (e.g. 1, 3)</p>
                                <input
                                    type="text"
                                    required
                                    value={locationIdsString}
                                    onChange={(e) => setLocationIdsString(e.target.value)}
                                    className="w-full border border-blue-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3 rounded hover:bg-black transition mt-2">
                                Create Plan
                            </button>
                        </form>
                    </div>
                </div>

                {/* LIST OF EXISTING PLANS */}
                <div className="w-full lg:w-2/3">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Existing Plans</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg text-gray-800">{plan.name}</h3>
                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {plan.is_active ? "Active" : "Inactive"}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                                <div className="flex justify-between text-sm font-bold text-gray-800 bg-gray-50 p-2 rounded">
                                    <span>{plan.price} RSD</span>
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