import { useState, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../../api/axios";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";

// --- INTERFACES ---
interface AnalyticsData {
    total_successful_entries_today: number;
    total_failed_attempts_today: number;
    total_registered_users: number;
}

interface FinanceData {
    active_subscriptions: number;
    total_users: number;
    mrr: number;
}

interface DayAttendance {
    day: string;
    entries: number;
}

interface PeakHour {
    hour: string;
    count: number;
}

interface BasicUser {
    email: string;
    first_name: string | null;
    last_name: string | null;
}

interface BasicLocation {
    name: string;
}

interface EntryLog {
    id: number;
    timestamp: string;
    access_granted: boolean;
    reason: string | null;
    action_type: string;
    location: BasicLocation | null;
    worker: BasicUser | null;
    user: BasicUser | null;
}

// The admin search returns is_active and roles as well, so the dropdown can flag
// a deactivated account instead of showing it as an ordinary member.
interface AdminSearchResult {
    user_id: number;
    full_name: string;
    email: string;
    is_active: boolean;
    roles: string[];
}

// Every list endpoint answers with the same envelope, so the two tables here
// share one type and one set of Prev/Next controls.
interface Paginated<T> {
    total: number;
    items: T[];
}

// --- CONSTANTS ---
const MIN_SEARCH_LENGTH = 2; // Mirrors the backend's Query(min_length=2)
const PAGE_SIZE = 10; // Matches the backend's default limit

const COLOR_PASS = "#10B981";
const COLOR_FAIL = "#F43F5E";
const COLOR_ACTIVE = "#3B82F6";
const COLOR_INACTIVE = "#64748B";

/**
 * Delays a value until the admin stops typing.
 *
 * Copied rather than imported from WorkerDashboard: that file deliberately keeps
 * it private, because a module exporting both a component and a plain function
 * makes Vite give up on fast refresh for the whole file.
 */
function useDebouncedValue(value: string, delay = 300): string {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

/**
 * Both name columns are nullable, so "{first} {last}" on an account that has
 * neither renders as a lone space - a cell that just looks broken.
 */
function displayName(user: BasicUser | null): string {
    if (!user) return "Unknown user";
    return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email;
}

/** Money is shown whole - nobody reads a gym's MRR to two decimal places. */
function formatCurrency(amount: number): string {
    return `${new Intl.NumberFormat("sr-RS", { maximumFractionDigits: 0 }).format(amount)} RSD`;
}

export default function AdminAnalytics() {
    const [activeTab, setActiveTab] = useState<"overview" | "audit">("overview");

    // --- AUDIT TAB STATE ---
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedTerm = useDebouncedValue(searchTerm);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AdminSearchResult | null>(null);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // --- PAGINATION STATE ---
    const [overridePage, setOverridePage] = useState(0);
    const [dossierPage, setDossierPage] = useState(0);

    const isAuditTab = activeTab === "audit";

    // --- 1. OVERVIEW QUERIES ---
    // All keyed under ["admin", ...] so one invalidateQueries({ queryKey: ["admin"] })
    // can refresh the whole panel later, the way the worker desk does it.
    const todayQuery = useQuery({
        queryKey: ["admin", "analytics", "today"],
        queryFn: () => api.get<AnalyticsData>("/admin/analytics/today").then((res) => res.data),
    });

    const financeQuery = useQuery({
        queryKey: ["admin", "analytics", "finances"],
        queryFn: () => api.get<FinanceData>("/admin/analytics/finances").then((res) => res.data),
    });

    const weeklyQuery = useQuery({
        queryKey: ["admin", "analytics", "weekly"],
        queryFn: () => api.get<DayAttendance[]>("/admin/analytics/weekly").then((res) => res.data),
    });

    const peakQuery = useQuery({
        queryKey: ["admin", "analytics", "peak-hours"],
        queryFn: () => api.get<PeakHour[]>("/admin/analytics/peak-hours").then((res) => res.data),
    });

    // --- 2. AUDIT QUERIES ---
    // enabled by the tab, so opening the page does not pull an audit log nobody
    // has asked to see yet.
    const overridesQuery = useQuery({
        queryKey: ["admin", "audit", "overrides", overridePage],
        queryFn: () =>
            api
                .get<Paginated<EntryLog>>(
                    `/admin/audit/manual-overrides?skip=${overridePage * PAGE_SIZE}&limit=${PAGE_SIZE}`
                )
                .then((res) => res.data),
        enabled: isAuditTab,
        placeholderData: keepPreviousData, // Keeps the current page on screen while the next loads
    });

    const searchQuery = useQuery({
        queryKey: ["admin", "users", "search", debouncedTerm],
        queryFn: () =>
            api
                .get<AdminSearchResult[]>(
                    `/admin/users/search?query=${encodeURIComponent(debouncedTerm.trim())}`
                )
                .then((res) => res.data),
        enabled: isAuditTab && debouncedTerm.trim().length >= MIN_SEARCH_LENGTH,
        staleTime: 30_000,
        // Each keystroke is a new query key, so without this the dropdown emptied
        // itself between terms and flashed a loading row on every letter typed.
        placeholderData: keepPreviousData,
    });

    const dossierQuery = useQuery({
        queryKey: ["admin", "users", "logs", selectedUser?.user_id, dossierPage],
        queryFn: () =>
            api
                .get<Paginated<EntryLog>>(
                    `/admin/users/${selectedUser?.user_id}/logs?skip=${dossierPage * PAGE_SIZE}&limit=${PAGE_SIZE}`
                )
                .then((res) => res.data),
        enabled: isAuditTab && selectedUser !== null,
        placeholderData: keepPreviousData,
    });

    // --- DERIVED PAGING VALUES ---
    const overrides = overridesQuery.data?.items ?? [];
    const overrideTotal = overridesQuery.data?.total ?? 0;
    const overridePageCount = Math.max(1, Math.ceil(overrideTotal / PAGE_SIZE));

    const dossierLogs = dossierQuery.data?.items ?? [];
    const dossierTotal = dossierQuery.data?.total ?? 0;
    const dossierPageCount = Math.max(1, Math.ceil(dossierTotal / PAGE_SIZE));

    // Close the dropdown on a click outside or on Escape, same as the desk panel.
    useEffect(() => {
        if (!isDropdownOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsDropdownOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isDropdownOpen]);

    // --- DERIVED VALUES ---
    const successCount = todayQuery.data?.total_successful_entries_today ?? 0;
    const failedCount = todayQuery.data?.total_failed_attempts_today ?? 0;
    const totalScans = successCount + failedCount;

    const activeSubs = financeQuery.data?.active_subscriptions ?? 0;
    const totalUsers = financeQuery.data?.total_users ?? 0;
    // Clamped: a count read a moment apart from the other must never go negative
    const withoutSub = Math.max(0, totalUsers - activeSubs);

    // No placeholder slice here. The old version passed `successCount || 1` so the
    // ring was never empty, which made a day with zero scans read as one clean
    // entry. An empty day now says so.
    const accessData = [
        { name: "Passed", value: successCount, color: COLOR_PASS },
        { name: "Blocked", value: failedCount, color: COLOR_FAIL },
    ];

    const conversionData = [
        { name: "Subscribed", value: activeSubs, color: COLOR_ACTIVE },
        { name: "No subscription", value: withoutSub, color: COLOR_INACTIVE },
    ];

    /** Tooltip label with a share of the total, guarding the empty-gym divide. */
    const percentOf = (value: number, total: number): string =>
        total > 0 ? ` (${Math.round((value / total) * 100)}%)` : "";

    const selectUser = (user: AdminSearchResult) => {
        setSelectedUser(user);
        setIsDropdownOpen(false);
        setSearchTerm("");
        // Back to page one, or picking a second member would open their history
        // at whatever page the previous one was left on - usually an empty one.
        setDossierPage(0);
    };

    const tabClasses = (tab: "overview" | "audit") =>
        `px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === tab
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800"
        }`;

    const cardClasses =
        "bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200";

    const pagerButtonClasses =
        "px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition";

    return (
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Gym Executive Analytics
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Revenue, attendance metrics, door scanner health, and audit logs.
                </p>
            </div>

            {/* TABS */}
            <div className="flex gap-3">
                <button type="button" onClick={() => setActiveTab("overview")} className={tabClasses("overview")}>
                    📊 Dashboard
                </button>
                <button type="button" onClick={() => setActiveTab("audit")} className={tabClasses("audit")}>
                    🛡️ Security & Audit
                </button>
            </div>

            {/* ============ TAB A: OVERVIEW ============ */}
            {activeTab === "overview" && (
                <div className="flex flex-col gap-6">

                    {/* METRIC CARDS */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* MRR */}
                        <div className={`${cardClasses} flex items-center justify-between`}>
                            <div>
                                <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                                    Estimated MRR
                                </p>
                                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                                    {financeQuery.isPending ? "…" : formatCurrency(financeQuery.data?.mrr ?? 0)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                    Normalised to 30 days
                                </p>
                            </div>
                            <span className="text-3xl">💰</span>
                        </div>

                        {/* SUBSCRIPTIONS */}
                        <div className={`${cardClasses} flex items-center justify-between`}>
                            <div>
                                <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                                    Active Subscriptions
                                </p>
                                <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2">
                                    {activeSubs}
                                    <span className="text-lg text-gray-400 dark:text-slate-500 font-bold">
                                        {" "}/ {totalUsers}
                                    </span>
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                    Of all registered users
                                </p>
                            </div>
                            <span className="text-3xl">🎟️</span>
                        </div>

                        {/* ENTRIES TODAY */}
                        <div className={`${cardClasses} flex items-center justify-between`}>
                            <div>
                                <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                                    Entries Today
                                </p>
                                <p className="text-3xl font-black text-gray-800 dark:text-white mt-2">
                                    {successCount}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                    {failedCount} blocked attempt{failedCount === 1 ? "" : "s"}
                                </p>
                            </div>
                            <span className="text-3xl">🚪</span>
                        </div>
                    </div>

                    {/* DONUTS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* DONUT 1: ACCESS RATE */}
                        <div className={`${cardClasses} flex flex-col`}>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Today&apos;s Access Rate</h2>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                Successful vs blocked turnstile scans
                            </p>

                            {/* isPending, not isFetching: a background refresh of an
                                already-drawn chart should not throw the reader back
                                to a spinner. Checking it before the zero case is what
                                stops "No scans recorded today." flashing on mount,
                                when the count is legitimately 0 only because nothing
                                has arrived yet. */}
                            {todayQuery.isPending ? (
                                <div className="h-52 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500">
                                    Loading…
                                </div>
                            ) : totalScans === 0 ? (
                                <div className="h-52 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500 italic">
                                    No scans recorded today.
                                </div>
                            ) : (
                                <>
                                    <div className="h-52 w-full my-2 relative flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={accessData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={75}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {accessData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value: unknown, name: unknown) => [
                                                        `${Number(value)}${percentOf(Number(value), totalScans)}`,
                                                        String(name),
                                                    ]}
                                                    contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                                            <span className="text-2xl font-black text-gray-800 dark:text-white">{totalScans}</span>
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">
                                                Total Scans
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex justify-center gap-6 text-xs font-bold text-gray-600 dark:text-slate-300">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                                            <span>Passed ({successCount})</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                                            <span>Blocked ({failedCount})</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* DONUT 2: MEMBER CONVERSION */}
                        <div className={`${cardClasses} flex flex-col`}>
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Member Conversion</h2>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                How many registered users actually pay
                            </p>

                            {financeQuery.isPending ? (
                                <div className="h-52 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500">
                                    Loading…
                                </div>
                            ) : totalUsers === 0 ? (
                                <div className="h-52 flex items-center justify-center text-sm text-gray-400 dark:text-slate-500 italic">
                                    No registered users yet.
                                </div>
                            ) : (
                                <>
                                    <div className="h-52 w-full my-2 relative flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={conversionData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={55}
                                                    outerRadius={75}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {conversionData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value: unknown, name: unknown) => [
                                                        `${Number(value)}${percentOf(Number(value), totalUsers)}`,
                                                        String(name),
                                                    ]}
                                                    contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                                            <span className="text-2xl font-black text-gray-800 dark:text-white">
                                                {percentOf(activeSubs, totalUsers).replace(/[ ()]/g, "") || "0%"}
                                            </span>
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">
                                                Converted
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex justify-center gap-6 text-xs font-bold text-gray-600 dark:text-slate-300">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                                            <span>Subscribed ({activeSubs})</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
                                            <span>Free ({withoutSub})</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* WEEKLY ATTENDANCE */}
                    <div className={cardClasses}>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Weekly Attendance Trend</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            Real member entries for the last 7 days
                        </p>

                        <div className="h-64 w-full pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={weeklyQuery.data ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLOR_ACTIVE} stopOpacity={0.35} />
                                            <stop offset="95%" stopColor={COLOR_ACTIVE} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
                                    <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip
                                        formatter={(value: unknown) => [`${Number(value)} members`, "Attendance"]}
                                        contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="entries"
                                        stroke={COLOR_ACTIVE}
                                        strokeWidth={2.5}
                                        fill="url(#weeklyFill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* PEAK HOURS */}
                    <div className={cardClasses}>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Peak Hours</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            When the gym is busiest, entries per hour over the last 7 days
                        </p>

                        <div className="h-64 w-full pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={peakQuery.data ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
                                    <XAxis
                                        dataKey="hour"
                                        stroke="#94A3B8"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        interval={1} // 24 bars would otherwise overlap their labels
                                    />
                                    <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip
                                        formatter={(value: unknown) => [`${Number(value)} entries`, "Traffic"]}
                                        contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                    />
                                    <Bar dataKey="count" fill={COLOR_ACTIVE} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ TAB B: SECURITY & AUDIT ============ */}
            {activeTab === "audit" && (
                <div className="flex flex-col gap-6">

                    {/* SECTION 1: MANUAL OVERRIDES */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors duration-200">
                        <div className="p-6 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                                Security Audit: Desk Worker Overrides
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                                Log of all manual door overrides performed by desk staff.
                            </p>
                        </div>

                        <div className="p-0 overflow-x-auto">
                            {overridesQuery.isPending ? (
                                <div className="p-8 text-gray-400 text-center text-sm">Loading audit log…</div>
                            ) : overridesQuery.isError ? (
                                <div className="p-8 text-rose-600 dark:text-rose-400 text-center text-sm font-bold">
                                    Could not load the audit log.
                                </div>
                            ) : overrides.length === 0 ? (
                                <div className="p-8 text-gray-400 text-center italic text-sm">
                                    No manual overrides recorded.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                    <tr className="bg-gray-100/70 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-bold">Date &amp; Time</th>
                                        <th className="p-4 font-bold">Gym Location</th>
                                        <th className="p-4 font-bold">Worker (Authorized By)</th>
                                        <th className="p-4 font-bold">Member (Let In)</th>
                                    </tr>
                                    </thead>
                                    <tbody className="text-sm text-gray-700 dark:text-gray-300">
                                    {overrides.map((log) => (
                                        <tr
                                            key={log.id}
                                            className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition border-b border-gray-100 dark:border-slate-800 last:border-0"
                                        >
                                            <td className="p-4 whitespace-nowrap">
                                                <span className="font-bold text-gray-800 dark:text-white">
                                                    {new Date(log.timestamp).toLocaleDateString()}
                                                </span>
                                                <span className="text-gray-400 ml-2 text-xs">
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </span>
                                            </td>
                                            <td className="p-4 font-bold text-blue-600 dark:text-blue-400">
                                                {log.location?.name || "Main Gym"}
                                            </td>
                                            <td className="p-4">
                                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                                    {displayName(log.worker)}
                                                </span>
                                                <br />
                                                <span className="text-xs text-gray-400">{log.worker?.email}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                                    {displayName(log.user)}
                                                </span>
                                                <br />
                                                <span className="text-xs text-gray-400">{log.user?.email}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* PAGER: hidden when everything already fits on one page */}
                        {overridePageCount > 1 && (
                            <div className="flex items-center justify-between gap-4 p-4 border-t border-gray-100 dark:border-slate-800">
                                <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                                    Page {overridePage + 1} of {overridePageCount} · {overrideTotal} override
                                    {overrideTotal === 1 ? "" : "s"}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setOverridePage((p) => Math.max(0, p - 1))}
                                        disabled={overridePage === 0}
                                        className={pagerButtonClasses}
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOverridePage((p) => p + 1)}
                                        disabled={overridePage + 1 >= overridePageCount}
                                        className={pagerButtonClasses}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: MEMBER DOSSIER */}
                    <div className={cardClasses}>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Member Dossier</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            Look up any account - including deactivated ones and staff - and read its door history.
                        </p>

                        {/* SEARCH BOX */}
                        <div className="relative mt-4" ref={searchBoxRef}>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setIsDropdownOpen(true);
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                                placeholder="Search by name or email…"
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />

                            {isDropdownOpen && debouncedTerm.trim().length >= MIN_SEARCH_LENGTH && (
                                <div className="absolute z-20 mt-2 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                                    {/* isPending, not isFetching. keepPreviousData alone
                                        does not stop the flicker: isFetching stays true
                                        during every background refetch, so the results
                                        it just preserved would be hidden behind
                                        "Searching…" anyway. This shows that row only
                                        when there is genuinely nothing to display, and
                                        dims the stale list otherwise. */}
                                    {searchQuery.isPending ? (
                                        <div className="p-4 text-sm text-gray-500 dark:text-slate-400">Searching…</div>
                                    ) : (searchQuery.data ?? []).length === 0 ? (
                                        <div className="p-4 text-sm text-gray-500 dark:text-slate-400 italic">
                                            No users match that.
                                        </div>
                                    ) : (
                                        <div className={searchQuery.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                                        {(searchQuery.data ?? []).map((user) => (
                                            <button
                                                key={user.user_id}
                                                type="button"
                                                onClick={() => selectUser(user)}
                                                className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-800 last:border-0 transition"
                                            >
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-gray-800 dark:text-white text-sm">
                                                        {user.full_name}
                                                    </span>

                                                    {/* The reason this search is unfiltered: a banned account
                                                        has to be findable AND visibly marked. */}
                                                    {!user.is_active && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                                            Deactivated
                                                        </span>
                                                    )}

                                                    {user.roles
                                                        .filter((role) => role !== "member")
                                                        .map((role) => (
                                                            <span
                                                                key={role}
                                                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                                            >
                                                                {role}
                                                            </span>
                                                        ))}
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-slate-400">{user.email}</span>
                                            </button>
                                        ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* HISTORY */}
                        {selectedUser && (
                            <div className="mt-6">
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-800 dark:text-white">
                                            {selectedUser.full_name}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-slate-400">{selectedUser.email}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="text-xs font-bold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white underline"
                                    >
                                        Clear
                                    </button>
                                </div>

                                {dossierQuery.isPending ? (
                                    <div className="text-sm text-gray-400 py-4">Loading history…</div>
                                ) : dossierQuery.isError ? (
                                    <div className="text-sm text-rose-600 dark:text-rose-400 font-bold py-4">
                                        Could not load this member&apos;s history.
                                    </div>
                                ) : dossierLogs.length === 0 ? (
                                    <div className="text-sm text-gray-400 italic py-4">
                                        This account has never scanned at the door.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {dossierLogs.map((log) => (
                                            <div
                                                key={log.id}
                                                className={`flex items-start justify-between gap-4 p-3 rounded-xl border transition-colors ${
                                                    log.access_granted
                                                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                                                        : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900"
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                                log.access_granted
                                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
                                                                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400"
                                                            }`}
                                                        >
                                                            {log.access_granted ? "Granted" : "Denied"}
                                                        </span>
                                                        <span className="text-xs font-bold text-gray-600 dark:text-slate-300 uppercase">
                                                            {log.action_type}
                                                        </span>
                                                        {log.location?.name && (
                                                            <span className="text-xs text-gray-500 dark:text-slate-400">
                                                                @ {log.location.name}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Only denied rows carry a reason worth reading */}
                                                    {log.reason && (
                                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                                                            {log.reason}
                                                        </p>
                                                    )}

                                                    {log.worker && (
                                                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                            Override by {displayName(log.worker)}
                                                        </p>
                                                    )}
                                                </div>

                                                <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                        ))}

                                        {/* PAGER */}
                                        {dossierPageCount > 1 && (
                                            <div className="flex items-center justify-between gap-4 pt-3 mt-1 border-t border-gray-100 dark:border-slate-800">
                                                <span className="text-xs font-bold text-gray-500 dark:text-slate-400">
                                                    Page {dossierPage + 1} of {dossierPageCount} · {dossierTotal} scan
                                                    {dossierTotal === 1 ? "" : "s"}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDossierPage((p) => Math.max(0, p - 1))}
                                                        disabled={dossierPage === 0}
                                                        className={pagerButtonClasses}
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDossierPage((p) => p + 1)}
                                                        disabled={dossierPage + 1 >= dossierPageCount}
                                                        className={pagerButtonClasses}
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
