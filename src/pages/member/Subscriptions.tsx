import { useEffect, useState } from "react";
import { useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { api } from "../../api/axios";
import type { User } from "../../components/Layout";
import { formatAllowedDays, formatTime, getPlanTheme, type Plan } from "../../utils/subscription";

export default function Subscriptions() {
    // Uzimamo 'user' iz Layout-a kako bismo proverili da li već ima aktivnu pretplatu
    const user = useOutletContext<User>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [loadingPlanId, setLoadingPlanId] = useState<number | null>(null);

    // Stripe redirected the user back here after they cancelled checkout.
    // Read it once via lazy initializer (rather than setting state inside an
    // effect) so the banner survives the URL cleanup below without an extra render.
    const [wasCancelled] = useState(() => searchParams.get("payment") === "cancelled");

    useEffect(() => {
        if (wasCancelled) {
            navigate("/subscriptions", { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Proveravamo da li trenutno ima aktivnu pretplatu
    const now = new Date();
    const activeSub = user?.subscriptions?.find(
        sub => sub.is_active === 1 && new Date(sub.end_date) > now
    );

    // --- FETCH PLANS ---
    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const response = await api.get<Plan[]>("/subscriptions/plans");
                setPlans(response.data);
            } catch {
                setError("Failed to load subscription plans.");
            } finally {
                setLoading(false);
            }
        };

        void fetchPlans();
    }, []);

    // --- BUY NOW ---
    const handleBuy = async (planId: number) => {
        setLoadingPlanId(planId);
        try {
            const response = await api.post(`/payments/checkout-session?plan_id=${planId}`);
            // Navigating away to Stripe — intentionally leave loadingPlanId set so the
            // button stays disabled/"Redirecting..." until the page unloads.
            window.location.assign(response.data.checkout_url);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to initiate payment");
            } else {
                alert("An unexpected error occurred");
            }
            setLoadingPlanId(null);
        }
    };

    if (loading) return <div className="p-6 text-gray-500 font-bold">Loading plans...</div>;
    if (error) return <div className="p-6 text-red-500 font-bold">{error}</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8 text-center">
                <h1 className="text-3xl sm:text-4xl font-black text-gray-800 dark:text-white transition-colors duration-200">
                    Choose Your Plan
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Simple pricing. Cancel anytime. Pick the plan that fits your grind.
                </p>
            </div>

            {/* STRIPE CHECKOUT CANCELLED WARNING */}
            {wasCancelled && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl mb-8 flex items-center gap-3 transition-colors">
                    <span className="text-2xl">⚠️</span>
                    <p className="text-amber-800 dark:text-amber-300 text-sm font-bold">
                        Checkout was cancelled. No charge was made — feel free to try again whenever you're ready.
                    </p>
                </div>
            )}

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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start pt-4">
                    {plans.map((plan) => {
                        const theme = getPlanTheme(plan.tier);

                        // Build the feature list from the plan's real nested data
                        const features: string[] = [
                            `Access to ${plan.locations.length} premium location${plan.locations.length === 1 ? "" : "s"}`
                        ];

                        if (plan.rule) {
                            const hasHours = plan.rule.allowed_time_start && plan.rule.allowed_time_end;
                            if (hasHours) {
                                features.push(`Access hours: ${formatTime(plan.rule.allowed_time_start!)} – ${formatTime(plan.rule.allowed_time_end!)}`);
                            }
                            if (plan.rule.allowed_days) {
                                features.push(`Available: ${formatAllowedDays(plan.rule.allowed_days)}`);
                            }
                        } else {
                            features.push("24/7 Unlimited Access");
                        }

                        const isDisabled = !!activeSub || loadingPlanId !== null;

                        return (
                            <div
                                key={plan.id}
                                className={`relative rounded-3xl border p-8 flex flex-col transition-all duration-200 ${theme.cardClass} ${
                                    activeSub ? "opacity-60" : ""
                                }`}
                            >
                                {/* BESTSELLER BADGE */}
                                {theme.isPopular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                                        🔥 Most Popular
                                    </div>
                                )}

                                <h2 className="text-2xl font-black">{plan.name}</h2>
                                <p className={`mt-2 text-sm h-10 overflow-hidden ${theme.subTextClass}`}>
                                    {plan.description || "No description provided."}
                                </p>

                                <div className="my-6">
                                    <span className={`text-4xl font-black ${theme.priceClass}`}>
                                        {plan.price}
                                    </span>
                                    <span className={`font-bold ml-1 ${theme.subTextClass}`}>RSD</span>
                                    <p className={`text-sm font-medium mt-1 ${theme.subTextClass}`}>
                                        Valid for {plan.duration_days} days
                                    </p>
                                </div>

                                {/* FEATURE LIST */}
                                <ul className="flex flex-col gap-2 mb-8">
                                    {features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-sm font-medium">
                                            <span className={theme.checkColor}>✅</span>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-auto">
                                    <button
                                        onClick={() => void handleBuy(plan.id)}
                                        disabled={isDisabled}
                                        className={`w-full font-bold py-3 px-4 rounded-xl transition-all shadow-sm ${
                                            isDisabled
                                                ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                                : `${theme.buttonClass} hover:shadow-md`
                                        }`}
                                    >
                                        {activeSub
                                            ? "Already Subscribed"
                                            : loadingPlanId === plan.id
                                                ? "Redirecting..."
                                                : "Buy Now via Stripe"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
