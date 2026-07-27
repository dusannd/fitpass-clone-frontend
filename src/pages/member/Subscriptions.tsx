import { useEffect, useState } from "react";
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

export default function Subscriptions() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const response = await api.get("/subscriptions/plans");
                const activePlans = response.data.filter((p: Plan) => p.is_active);
                setPlans(activePlans);
            } catch {
                setError("Failed to load subscription plans.");
            } finally {
                setLoading(false);
            }
        };

        void fetchPlans();
    }, []);

    const handleBuy = async (planId: number) => {
        try {
            const response = await api.post(`/payments/checkout-session?plan_id=${planId}`);
            // Koristimo .assign() umesto .href = da linter ne bi prijavio "immutability" grešku
            window.location.assign(response.data.checkout_url);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to initiate payment");
            } else {
                alert("An unexpected error occurred");
            }
        }
    };

    if (loading) return <div className="p-6">Loading plans...</div>;
    if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Gym Subscriptions</h1>
                <p className="text-gray-600 mt-2">
                    Choose the best plan for your fitness journey.
                </p>
            </div>

            {plans.length === 0 ? (
                <div className="bg-yellow-50 text-yellow-800 p-4 rounded border border-yellow-200">
                    No active subscription plans found. The admin needs to create some first.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className="bg-white rounded-lg shadow-md border border-gray-200 p-6 flex flex-col hover:shadow-lg transition"
                        >
                            <h2 className="text-2xl font-black text-gray-800">{plan.name}</h2>
                            <p className="text-gray-500 mt-2 h-12 overflow-hidden">
                                {plan.description || "No description provided."}
                            </p>

                            <div className="my-6">
                <span className="text-4xl font-bold text-blue-600">
                  {plan.price} RSD
                </span>
                                <span className="text-gray-500 ml-2">/ {plan.duration_days} days</span>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-100">
                                <button
                                    onClick={() => void handleBuy(plan.id)}
                                    className="w-full bg-gray-900 text-white font-bold py-3 px-4 rounded hover:bg-black transition"
                                >
                                    Buy Now via Stripe
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}