// Small helpers for the user profile.
// They live outside Avatar.tsx so Vite fast refresh keeps working
// (a file holding a component should only export components).

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/**
 * Turns whatever is stored in profile_picture_url into something an <img> can use.
 * The backend saves a relative path (/static/avatars/xyz.jpg) so the database
 * doesn't care where the API is mounted. If we ever move to S3 the URL will
 * already be absolute, so we just pass it through.
 */
export const resolveAvatarUrl = (url?: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${BASE_URL}${url}`;
};

/**
 * fitness_goals is one comma separated string in the DB ("Lose weight, Build muscle").
 * Everywhere we draw badges we need it as a clean array.
 */
export const parseGoals = (goals?: string | null): string[] => {
    if (!goals) return [];
    return goals.split(",").map(g => g.trim()).filter(Boolean);
};

// --- COLORS PER ROLE ---
// Every role gets its own ring around the picture and its own badge color,
// so you can tell at a glance if you are looking at a trainer, a worker
// or a regular member.
// The class names are written out in full (never built at runtime) because
// Tailwind scans the source code and would never see a class we assemble
// inside a string.
interface RoleAccent {
    ring: string;
    glow: string;
    badge: string;
}

const ROLE_ACCENTS: Record<string, RoleAccent> = {
    admin: {
        ring: "ring-amber-500/50 dark:ring-amber-400/40",
        glow: "from-amber-500 via-orange-500 to-rose-500",
        badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
    },
    trainer: {
        ring: "ring-purple-500/50 dark:ring-purple-400/40",
        glow: "from-purple-500 via-fuchsia-500 to-pink-500",
        badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
    },
    worker: {
        ring: "ring-teal-500/50 dark:ring-teal-400/40",
        glow: "from-teal-500 via-cyan-500 to-sky-500",
        badge: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400",
    },
    member: {
        ring: "ring-blue-500/40 dark:ring-blue-400/30",
        glow: "from-blue-500 via-indigo-500 to-purple-500",
        badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
    },
};

// Someone with several roles (a trainer who is also a member) gets the "strongest" one
const ROLE_PRIORITY = ["admin", "trainer", "worker", "member"];

/**
 * Colors for one specific role (used by the badges).
 */
export const getRoleAccent = (roleName: string): RoleAccent => {
    return ROLE_ACCENTS[roleName] ?? ROLE_ACCENTS.member;
};

/**
 * Colors for the user as a whole - picks the strongest role they have.
 */
export const getPrimaryAccent = (roleNames: string[]): RoleAccent => {
    const top = ROLE_PRIORITY.find(r => roleNames.includes(r));
    return getRoleAccent(top ?? "member");
};
