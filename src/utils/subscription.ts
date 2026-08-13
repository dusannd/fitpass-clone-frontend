import axios from "axios";
import { api } from "../api/axios";

// Shared types and helpers for subscription plans.
// Same reasoning as utils/workout.ts and utils/profile.ts: these used to be
// duplicated inside Subscriptions.tsx and ManagePlans.tsx, and a file that exports
// a component should only export components or Vite fast refresh breaks.

// --- 1. TYPES (must mirror app/schemas/subscription.py 1:1) ---

/** The three tiers the backend accepts. Enforced there by a Literal. */
export type PlanTier = "Standard" | "Pro" | "VIP";

/** Order matters: this is what the admin dropdown renders, cheapest first. */
export const PLAN_TIERS: PlanTier[] = ["Standard", "Pro", "VIP"];

export interface GymLocation {
    id: number;
    name: string;
    address: string | null;
    is_24_7: boolean;
}

export interface PlanRule {
    id: number;
    allowed_time_start: string | null; // "HH:MM:SS"
    allowed_time_end: string | null;
    allowed_days: string | null; // "0,1,2,3,4" (0=Monday, 6=Sunday)
}

export interface Plan {
    id: number;
    name: string;
    description: string | null;
    price: number;
    duration_days: number;
    is_active: boolean;
    tier: PlanTier;
    locations: GymLocation[];
    rule: PlanRule | null;

    // What the membership actually INCLUDES, as opposed to how its card is
    // styled. See PLAN_PERKS below.
    includes_trainer: boolean;
    includes_group_classes: boolean;
    has_sauna_access: boolean;
    has_towel_service: boolean;
    allows_guest: boolean;
}

// --- 1b. PLAN PERKS ---
// One list, two consumers: the admin checkboxes and the member pricing bullets.
// Adding a perk here makes it appear in both at once - there is no second place
// to remember, and the two can never end up advertising different things.
//
// tier is decoration (see section 3); these are the columns that make an
// expensive plan worth more than the cheap one.

export type PerkKey =
    | "includes_trainer"
    | "includes_group_classes"
    | "has_sauna_access"
    | "has_towel_service"
    | "allows_guest";

export interface PlanPerk {
    key: PerkKey;
    /** The bullet on the pricing card, and the label beside the admin checkbox. */
    label: string;
    /** Only set where ticking the box changes what the backend allows. */
    note?: string;
}

export const PLAN_PERKS: PlanPerk[] = [
    {
        key: "includes_trainer",
        label: "Personal trainer included",
        note: "Enforced: members whose plan lacks this cannot request a trainer or book sessions.",
    },
    { key: "includes_group_classes", label: "Group classes" },
    { key: "has_sauna_access", label: "Sauna access" },
    { key: "has_towel_service", label: "Towel service" },
    { key: "allows_guest", label: "Bring a guest" },
];

/** The perks a plan actually carries, in the order they are advertised. */
export const activePerks = (plan: Plan): PlanPerk[] =>
    PLAN_PERKS.filter((perk) => plan[perk.key]);

/**
 * The caller's own active subscription, as returned by GET /subscriptions/my-subscription.
 * Must mirror MySubscriptionResponse in app/schemas/subscription.py 1:1.
 *
 * Note this carries the FULL nested plan, which is why the membership card can show
 * a real plan name and tier - the `subscriptions` array hanging off the Layout user
 * object only has plan_id.
 */
export interface MySubscription {
    id: number;
    user_id: number;
    plan_id: number;
    start_date: string;
    end_date: string;
    is_active: number;
    plan: Plan;
    /** null for legacy rows and passes the desk activated by hand - those have no billing portal. */
    stripe_subscription_id: string | null;
}

// --- 1c. THE CALLER'S OWN SUBSCRIPTION ---
// Read from the API rather than from the Layout user object, because only this
// endpoint carries the nested plan - `user.subscriptions` has a bare plan_id and
// therefore no name, no tier and no perks.
//
// Three pages need it now (Subscriptions, MemberCoaching, MemberAppointments), so
// the key and the fetch live here: one shared cache entry instead of three copies
// of the 404 handling below.

export const MY_SUBSCRIPTION_KEY = ["mySubscription"] as const;

/**
 * The caller's active subscription, or null when they have none.
 *
 * A 404 here is the backend saying "nothing active", which is the normal state for
 * a member who has not bought yet - not a failure. Every caller should pass
 * `retry: false` alongside this, since an expected answer is not worth retrying.
 */
export async function fetchMySubscription(): Promise<MySubscription | null> {
    try {
        const res = await api.get<MySubscription>("/subscriptions/my-subscription");
        return res.data;
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
    }
}

/**
 * Does the caller's active plan include personal training?
 *
 * No subscription at all reads the same as a plan without the perk - which is
 * exactly how the backend answers it too (app/api/coaching.py).
 *
 * This only decides what the UI shows. The real gate is the 403 from the API; a
 * member who edits their way past this still cannot book anything.
 */
export const planIncludesTrainer = (sub: MySubscription | null | undefined): boolean =>
    sub?.plan?.includes_trainer === true;

// --- 2. FORMATTING HELPERS ---

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * "0,1,2,3,4" -> [0,1,2,3,4]. Garbage entries are dropped rather than becoming NaN,
 * so a hand-edited row can't break the render.
 * Shared by the member pricing card (which labels them) and the admin form (which
 * needs the raw indexes to light up its weekday toggles).
 */
export function parseAllowedDays(allowedDays: string | null | undefined): number[] {
    if (!allowedDays) return [];
    return allowedDays
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !isNaN(d) && d >= 0 && d <= 6);
}

/** "0,1,2,3,4" -> "Mon, Tue, Wed, Thu, Fri" (or "Every day" when all seven). */
export function formatAllowedDays(allowedDays: string): string {
    const days = parseAllowedDays(allowedDays);

    if (days.length === 7) return "Every day";
    return days.map((d) => DAY_LABELS[d]).join(", ");
}

/** "09:00:00" -> "09:00" */
export function formatTime(t: string): string {
    return t.slice(0, 5);
}

// --- 2b. BILLING CYCLE MATH ---
// Both take `now` as an argument rather than calling Date.now() themselves. Reading a
// clock inside a render makes the component impure and trips react-hooks/purity, so
// the page computes `now` once and hands it down.

/**
 * How far through the billing period we are, 0-100, for the progress bar.
 *
 * A zero-length or inverted period (a hand-edited row, or a start_date that somehow
 * lands after end_date) would divide by zero, so it reports a full bar instead.
 */
export function billingCycleProgress(start: string, end: string, now: number): number {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    const span = endMs - startMs;
    if (!(span > 0)) return 100;

    const elapsed = ((now - startMs) / span) * 100;
    return Math.min(100, Math.max(0, elapsed));
}

/**
 * Whole days left on the pass, never negative.
 * Rounds UP so the last few hours still read as "1 day left" rather than "0".
 */
export function daysRemaining(end: string, now: number): number {
    const msLeft = new Date(end).getTime() - now;
    if (msLeft <= 0) return 0;

    return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
}

// --- 3. DECOY PRICING THEME ---
// Returns the Tailwind classes for a plan's tier. Standard = the plain "looks
// basic" option. Pro = the bestseller we push people towards. VIP = the expensive
// anchor that makes Pro look reasonable.
//
// This used to sniff the plan NAME for "gold"/"pro"/"vip", which meant renaming a
// plan silently restyled it. It now reads the real tier column instead.
//
// Every class string is written out in full, never assembled at runtime, because
// Tailwind scans the source text and would never see a composed class.

interface PlanTheme {
    cardClass: string;
    priceClass: string;
    subTextClass: string;
    checkColor: string;
    buttonClass: string;
    isPopular: boolean;
}

const PLAN_THEMES: Record<PlanTier, PlanTheme> = {
    Pro: {
        cardClass: "bg-gradient-to-br from-amber-400 to-orange-500 border-transparent text-white scale-105 shadow-2xl shadow-orange-500/30 z-10",
        priceClass: "text-white",
        subTextClass: "text-white/80",
        checkColor: "text-white",
        buttonClass: "bg-white text-orange-600 hover:bg-orange-50",
        isPopular: true,
    },
    VIP: {
        cardClass: "bg-gray-900 border border-purple-500 text-white shadow-xl shadow-purple-500/50",
        priceClass: "text-white",
        subTextClass: "text-gray-400",
        checkColor: "text-purple-400",
        buttonClass: "bg-purple-600 hover:bg-purple-500 text-white",
        isPopular: false,
    },
    Standard: {
        cardClass: "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white",
        priceClass: "text-slate-900 dark:text-white",
        subTextClass: "text-gray-500 dark:text-gray-400",
        checkColor: "text-emerald-500",
        buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
        isPopular: false,
    },
};

/**
 * Takes a plain string rather than PlanTier so a value we don't recognise (an older
 * backend, a hand-edited row) quietly falls back to Standard instead of rendering
 * an undefined theme.
 */
export const getPlanTheme = (tier: string): PlanTheme =>
    PLAN_THEMES[tier as PlanTier] ?? PLAN_THEMES.Standard;

/** The small tier pill on the admin plan cards. */
const TIER_BADGES: Record<PlanTier, string> = {
    Standard: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700",
    Pro: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    VIP: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
};

export const getTierBadgeClass = (tier: string): string =>
    TIER_BADGES[tier as PlanTier] ?? TIER_BADGES.Standard;
