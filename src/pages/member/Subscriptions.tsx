import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import axios from "axios";
import { api } from "../../api/axios";
import type { User } from "../../components/Layout";

interface Plan {
    id: number;
    name: string;
    description: string;
    price: number;
    duration_days: number;
    is_active: boolean;
}

export default function Subscriptions() {
    // Uzimamo 'user' iz Layout-a kako bismo proverili da li već ima aktivnu pretplatu
    const user = useOutletContext<User>();

    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Proveravamo da li trenutno ima aktivnu pretplatu
    const now = new Date();
    const activeSub = user?.subscriptions?.find(
        sub => sub.is_active === 1 && new Date(sub.end_date) > now
    );

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const response = await api.get("/subscriptions/plans");
                // Prikazujemo samo aktivne planove
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
            window.location.assign(response.data.checkout_url);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to initiate payment");
            } else {
                alert("An unexpected error occurred");
            }
        }
    };

    if (loading) return <div className="p-6 text-gray-500 font-bold">Loading plans...</div>;
    if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Gym Subscriptions
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Choose the best plan for your fitness journey.
                </p>
            </div>

            {/* AKO VEĆ IMA PRETPLATU, PRIKAZUJEMO BANER */}
            {activeSub && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 p-6 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4 transition-colors">
                    <div>
                        <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
                            🎉 You already have an active pass!
                        </h2>
                        <p className="text-emerald-700 dark:text-emerald-400 text-sm mt-1">
                            Your current subscription is valid until: <strong className="text-emerald-900 dark:text-emerald-100">{new Date(activeSub.end_date).toLocaleDateString()}</strong>.
                        </p>
                    </div>
                    <span className="bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100 px-4 py-2 rounded-xl font-black text-sm uppercase">
                        Active
                    </span>
                </div>
            )}

            {plans.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 transition-colors">
                    No active subscription plans found. The admin needs to create some first.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <div
                            key={plan.id}
                            className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border p-6 flex flex-col transition-all duration-200 ${
                                activeSub
                                    ? "border-gray-200 dark:border-slate-800 opacity-60"
                                    : "border-gray-200 dark:border-slate-800 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700"
                            }`}
                        >
                            <h2 className="text-2xl font-black text-gray-800 dark:text-white">{plan.name}</h2>
                            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm h-12 overflow-hidden">
                                {plan.description || "No description provided."}
                            </p>

                            <div className="my-6">
                                <span className="text-4xl font-black text-blue-600 dark:text-blue-400">
                                    {plan.price}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 font-bold ml-1">RSD</span>
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium mt-1">
                                    Valid for {plan.duration_days} days
                                </p>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-slate-800">
                                <button
                                    onClick={() => void handleBuy(plan.id)}
                                    disabled={!!activeSub} // ZAKLJUČAJ DUGME AKO IMA PRETPLATU
                                    className={`w-full font-bold py-3 px-4 rounded-xl transition-all shadow-sm ${
                                        activeSub
                                            ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                            : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md"
                                    }`}
                                >
                                    {activeSub ? "Already Subscribed" : "Buy Now via Stripe"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}