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
}

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
