import { useEffect, useState } from "react";
import { useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { api } from "../../api/axios";
import type { User } from "../../components/Layout";

// --- TYPES ---
// Matches the nested JSON from GET /subscriptions/plans (locations + rule eagerly loaded)
interface GymLocation {
    id: number;
    name: string;
    address: string | null;
    is_24_7: boolean;
}

interface PlanRule {
    id: number;
    allowed_time_start: string | null; // "HH:MM:SS"
    allowed_time_end: string | null;
    allowed_days: string | null; // e.g. "0,1,2,3,4" (0=Monday, 6=Sunday)
}

interface Plan {
    id: number;
    name: string;
    description: string | null;
    price: number;
    duration_days: number;
    is_active: boolean;
    locations: GymLocation[];
    rule: PlanRule | null;
}

// --- HELPERS ---
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "0,1,2,3,4" -> "Mon-Fri" style summary
function formatAllowedDays(allowedDays: string): string {
    const days = allowedDays
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !isNaN(d) && d >= 0 && d <= 6);

    if (days.length === 7) return "Every day";
    return days.map((d) => DAY_LABELS[d]).join(", ");
}

// "09:00:00" -> "09:00"
function formatTime(t: string): string {
    return t.slice(0, 5);
}

// --- DECOY PRICING THEME ---
// Parses the plan name and returns the Tailwind classes for its tier.
// Standard/Basic = the plain "looks basic" option. Gold/Pro = the bestseller
// we push people towards. VIP/Premium = the expensive anchor that makes Gold
// look reasonable.
function getPlanTheme(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes("gold") || lower.includes("pro")) {
        return {
            cardClass: "bg-gradient-to-br from-amber-400 to-orange-500 border-transparent text-white scale-105 shadow-2xl shadow-orange-500/30 z-10",
            priceClass: "text-white",
            subTextClass: "text-white/80",
            checkColor: "text-white",
            buttonClass: "bg-white text-orange-600 hover:bg-orange-50",
            isPopular: true,
        };
    }

    if (lower.includes("vip") || lower.includes("premium")) {
        return {
            cardClass: "bg-gray-900 border border-purple-500 text-white shadow-xl shadow-purple-500/50",
            priceClass: "text-white",
            subTextClass: "text-gray-400",
            checkColor: "text-purple-400",
            buttonClass: "bg-purple-600 hover:bg-purple-500 text-white",
            isPopular: false,
        };
    }

    // Default: Standard / Basic (or anything else)
    return {
        cardClass: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white",
        priceClass: "text-slate-900 dark:text-white",
        subTextClass: "text-gray-500 dark:text-gray-400",
        checkColor: "text-emerald-500",
        buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
        isPopular: false,
    };
}

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
                        const theme = getPlanTheme(plan.name);

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
