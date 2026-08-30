import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import {
    activePerks,
    billingCycleProgress,
    daysRemaining,
    fetchMySubscription,
    formatAllowedDays,
    formatTime,
    getPlanTheme,
    getTierBadgeClass,
    sortPlansByPrice,
    MY_SUBSCRIPTION_KEY,
    type MySubscription,
    type Plan,
} from "../../utils/subscription";

// The membership card carries the moment its data arrived, stamped on in the query
// function. It has to travel WITH the data because a clock read during render makes
// the component impure - the same reasoning as InsidePage in WorkerDashboard.
type ActiveSubscription = MySubscription & { fetchedAt: number };

export default function Subscriptions() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // One shared banner for both mutations. There is no toast library in this repo,
    // so this follows the inline error pattern from WorkerDashboard.
    const [error, setError] = useState("");

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

    // --- 1. THE PRICING GRID ---
    const plansQuery = useQuery({
        queryKey: ["plans"],
        queryFn: async () => {
            const res = await api.get<Plan[]>("/subscriptions/plans");
            return res.data;
        },
    });

    // --- 2. THE CALLER'S OWN SUBSCRIPTION ---
    // This is read from the API rather than from the Layout user object because only
    // this endpoint carries the nested plan - the membership card needs the name and
    // tier, and `user.subscriptions` has neither.
    const mySubQuery = useQuery({
        queryKey: MY_SUBSCRIPTION_KEY,
        queryFn: async (): Promise<ActiveSubscription | null> => {
            // The fetch itself (including treating a 404 as "nothing active") is
            // shared with the coaching pages. Only the timestamp below is local to
            // this one.
            const sub = await fetchMySubscription();
            if (!sub) return null;

            // The clock is stamped HERE, not during render: reading it while
            // rendering makes the component impure (react-hooks/purity). The
            // days-left figure is therefore "as of the last refresh", which is
            // the honest reading anyway - nothing polls this page.
            return { ...sub, fetchedAt: Date.now() };
        },
        // The 404 handled inside fetchMySubscription is an expected answer, so
        // there is nothing to retry.
        retry: false,
    });

    // --- 3. CHECKOUT ---
    // The plan id travels as the mutation variable, so `buyMutation.variables` tells
    // us which card to put in its loading state - no separate piece of state needed.
    const buyMutation = useMutation({
        mutationFn: async (planId: number) => {
            const res = await api.post<{ checkout_url: string }>(
                `/payments/checkout-session?plan_id=${planId}`
            );
            return res.data;
        },
        onMutate: () => setError(""),
        onSuccess: (data) => {
            // Navigating away to Stripe - intentionally leave isPending true so the
            // button stays disabled/"Redirecting..." until the page unloads.
            window.location.assign(data.checkout_url);
        },
        onError: (err) => setError(errorDetail(err, "Failed to initiate payment.")),
    });

    // --- 4. STRIPE BILLING PORTAL ---
    // Cancelling, changing the card on file and downloading invoices all live on
    // Stripe's hosted page, so all we do is fetch a one-time URL and go there.
    const portalMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post<{ url: string }>("/payments/customer-portal");
            return res.data;
        },
        onMutate: () => setError(""),
        onSuccess: (data) => {
            window.location.href = data.url;
        },
        onError: (err) =>
            setError(errorDetail(err, "Could not open the billing portal. Please try again.")),
    });

    // Cheapest first, so the row reads like a price ladder and the raised "Most
    // Popular" card lands in the middle where its scale-105 was designed to sit.
    const plans = sortPlansByPrice(plansQuery.data ?? []);
    const activeSub = mySubQuery.data ?? null;

    // Travels with the data (see the queryFn). The 0 fallback never reaches the
    // screen: without data there is no membership card to render it into.
    const now = activeSub?.fetchedAt ?? 0;

    // isPending, not isFetching: the latter is true on every background refetch and
    // would throw the page back to a spinner after it has already rendered.
    if (plansQuery.isPending || mySubQuery.isPending) {
        return <div className="p-6 text-gray-500 font-bold">Loading plans...</div>;
    }

    if (plansQuery.isError) {
        return <div className="p-6 text-red-500 font-bold">Failed to load subscription plans.</div>;
    }

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

            {/* SHARED ERROR BANNER (checkout + portal) */}
            {error && (
                <div className="bg-red-100 dark:bg-rose-950/40 text-red-700 dark:text-rose-300 p-4 rounded-xl mb-8 font-bold text-sm border border-red-200 dark:border-rose-900/60 transition-colors">
                    {error}
                </div>
            )}

            {/* --- MEMBERSHIP CARD --- */}
            {/* Neutral card surface on purpose: the emerald now signals STATUS (the pill,
                the progress fill) instead of colouring the whole box, which leaves the
                pricing grid below as the only loud thing on the page. */}
            {activeSub && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-8 transition-colors">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Your Membership
                        </p>
                        <span className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                            {activeSub.plan.name}
                        </h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getTierBadgeClass(activeSub.plan.tier)}`}>
                            {activeSub.plan.tier}
                        </span>
                    </div>

                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
                        Renews {new Date(activeSub.end_date).toLocaleDateString()} ·{" "}
                        <strong className="text-slate-700 dark:text-slate-200">
                            {daysRemaining(activeSub.end_date, now)} days left
                        </strong>
                    </p>

                    {/* BILLING CYCLE PROGRESS */}
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 mt-4 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${billingCycleProgress(activeSub.start_date, activeSub.end_date, now)}%` }}
                        />
                    </div>

                    {/* MANAGE ACTION */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                        {activeSub.stripe_subscription_id ? (
                            <>
                                <button
                                    onClick={() => portalMutation.mutate()}
                                    disabled={portalMutation.isPending}
                                    className="bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold py-3 px-5 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm"
                                >
                                    {portalMutation.isPending ? "Redirecting…" : "⚙ Manage Subscription"}
                                </button>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Cancel, change your card or download invoices →
                                </p>
                            </>
                        ) : (
                            // No Stripe subscription behind this row, so there is no portal
                            // to open. Showing a button here would only ever produce a 400.
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                This pass was activated at the gym — talk to the desk to make changes.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {plans.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 transition-colors">
                    No active subscription plans found. The admin needs to create some first.
                </div>
            ) : (
                // No items-start: the cards stretch to a common height, so their buttons
                // line up along the bottom of the row no matter how long a plan's
                // description or feature list turns out to be.
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
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

                        // The bullets above are DERIVED from where and when the pass
                        // works. These are what the plan explicitly says it includes,
                        // so they go last - the trainer line is the one people are
                        // scanning for.
                        features.push(...activePerks(plan).map((perk) => perk.label));

                        const isDisabled = !!activeSub || buyMutation.isPending;

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
                                {/* A floor, not a ceiling. 2.5rem is two text-sm lines, so short
                                    descriptions still reserve the same space and the cards do not
                                    look ragged - but a longer one wraps instead of being cut off
                                    mid sentence, which is what a fixed h-10 used to do. */}
                                <p className={`mt-2 text-sm min-h-[2.5rem] ${theme.subTextClass}`}>
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
                                        onClick={() => buyMutation.mutate(plan.id)}
                                        disabled={isDisabled}
                                        className={`w-full font-bold py-3 px-4 rounded-xl transition-all shadow-sm ${
                                            isDisabled
                                                ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                                                : `${theme.buttonClass} hover:shadow-md`
                                        }`}
                                    >
                                        {activeSub
                                            ? "Already Subscribed"
                                            : buyMutation.isPending && buyMutation.variables === plan.id
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
