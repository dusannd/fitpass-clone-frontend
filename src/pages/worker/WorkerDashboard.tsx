import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import ConfirmModal from "../../components/ConfirmModal";
import { useLocations } from "../../hooks/useLocations";

// --- INTERFACES ---
// Why the backend answers a refusal in a reason code rather than only in prose:
// the desk needs to tell "never paid" apart from "paid, but not valid at THIS
// gym right now", and those two want different colours and different buttons.
type DenialReason = "none" | "location" | "day" | "time" | null;

interface StatusResponse {
    user_id: number;
    full_name: string;
    email: string;
    // The single "is the green light on" flag. False for a member whose pass is
    // real but does not cover this location or this hour - so a caller that reads
    // nothing else still errs on the safe side.
    has_active_subscription: boolean;
    // Whether a pass exists AT ALL, regardless of whether it opens this door.
    subscription_active: boolean;
    denial_reason: DenialReason;
    plan_name?: string;
    days_left?: number;
    expires_on?: string;
    message: string;
}

// One pending confirmation. Both destructive desk actions share a single piece of
// state - and therefore a single dialog - so the page never has two half-open
// modals to reason about. `run` is the work to do once the worker says yes.
interface PendingConfirm {
    title: string;
    message: string;
    confirmText: string;
    run: () => void;
}

interface InsideUser {
    user_id: number;
    full_name: string;
    email: string;
    entered_at: string;
}

// What the autocomplete dropdown needs, and nothing heavier
interface SearchResult {
    user_id: number;
    full_name: string;
    email: string;
}

interface EntryLogEntry {
    id: number;
    user_id: number;
    full_name: string;
    action_type: string;
    access_granted: boolean;
    reason: string | null;
    timestamp: string;
}

// Both paginated endpoints answer with the same envelope, so the page can share
// one type and one set of Prev/Next controls.
interface Paginated<T> {
    total: number;
    items: T[];
}

// The attendance page carries the moment it arrived, stamped on in the query
// function. It has to travel WITH the data rather than be read off the query,
// because insideQuery.dataUpdatedAt describes the key being fetched - which is 0
// for as long as placeholderData keeps the previous page on screen. Reading it
// there made every row flash "0m inside" on each Prev/Next.
type InsidePage = Paginated<InsideUser> & { fetchedAt: number };

// --- CONSTANTS ---
const INSIDE_PAGE_SIZE = 8;
const LOG_PAGE_SIZE = 10;
const MIN_SEARCH_LENGTH = 2; // Mirrors the backend's Query(min_length=2)

/**
 * Delays a value until the user stops typing.
 *
 * Without this, every keystroke would be a request to /worker/search. It is not
 * exported on purpose: a module that exports a component should only export
 * components, otherwise Vite's fast refresh gives up on the whole file.
 */
function useDebouncedValue(value: string, delay = 300): string {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

/** Turns "42 minutes" into "42m" and "95 minutes" into "1h 35m". */
function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Picks the colours and the headline for the status card.
 *
 * Three states rather than two. The panel used to be a green/red binary, which
 * painted a fully paid-up member standing at the wrong gym exactly the same as
 * somebody who has never paid a dinar - and the manual override button sits
 * directly underneath. Amber says "the pass is real, it just doesn't open THIS
 * door right now", which is the case where an override is a judgement call
 * rather than a mistake.
 */
function statusTheme(status: StatusResponse) {
    if (status.has_active_subscription) {
        return {
            card: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200",
            badge: "bg-emerald-200 text-emerald-800",
            label: "ACTIVE SUBSCRIPTION 🟢",
        };
    }

    if (status.subscription_active) {
        return {
            card: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200",
            badge: "bg-amber-200 text-amber-900",
            label: status.denial_reason === "location" ? "PASS NOT VALID HERE 🟠" : "PASS NOT VALID NOW 🟠",
        };
    }

    return {
        card: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200",
        badge: "bg-rose-200 text-rose-800",
        label: "NO ACTIVE SUBSCRIPTION 🔴",
    };
}

export default function WorkerDashboard() {
    const queryClient = useQueryClient();

    // --- SEARCH STATE ---
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedTerm = useDebouncedValue(searchTerm);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    // The member the worker picked. Held as an id rather than parsed back out of
    // the text box, so the override button can never fire at the wrong person.
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    // --- CHECK / OVERRIDE STATE ---
    // Only the banner text and the location live in useState now - the status card
    // itself comes straight off the mutation below.
    // Which gym this desk is. It used to be a hardcoded 3 in a number box labelled
    // "Location ID:" - the worker had to know, from nowhere, which building was which
    // integer. Getting it wrong checks members into another branch, silently, because
    // any existing id is accepted.
    const locationsQuery = useLocations();
    const locations = locationsQuery.data ?? [];

    // null until the worker picks; derived fallback rather than a setState from an
    // effect once the list lands.
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
    const locationId = selectedLocationId ?? locations[0]?.id ?? 0;
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // --- PAGINATION STATE ---
    const [insidePage, setInsidePage] = useState(0);
    const [logPage, setLogPage] = useState(0);

    // --- CONFIRMATION STATE ---
    // null means no dialog is on screen. Set it to open one.
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    // --- 1. SEARCH QUERY ---
    // Only runs once the debounced term is long enough for the backend to accept,
    // and the result is kept warm for half a minute so backspacing is free.
    const searchQuery = useQuery({
        queryKey: ["worker", "search", debouncedTerm],
        queryFn: () =>
            api
                .get<SearchResult[]>(`/worker/search?query=${encodeURIComponent(debouncedTerm.trim())}`)
                .then((res) => res.data),
        enabled: debouncedTerm.trim().length >= MIN_SEARCH_LENGTH,
        staleTime: 30_000,
    });

    const results = searchQuery.data ?? [];

    // True only when the results on screen belong to what is currently typed.
    // Without this, hitting Enter mid-debounce would pick the top hit of the
    // PREVIOUS term - which at a turnstile means opening the door for the wrong
    // person.
    const areResultsCurrent = debouncedTerm === searchTerm && !searchQuery.isFetching;

    // Close the dropdown on a click outside or on Escape, the same way the avatar
    // menu in Layout.tsx does it.
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

    // --- 2. LIVE ATTENDANCE QUERY ---
    // No refetchInterval on purpose. This used to poll every 10 seconds, which
    // ran a GROUP BY over the whole entry_logs table all day long for a screen
    // nobody was necessarily looking at. It now refreshes on demand, and by
    // itself only after the worker's own actions.
    const insideQuery = useQuery({
        queryKey: ["worker", "inside", insidePage],
        queryFn: (): Promise<InsidePage> =>
            api
                .get<Paginated<InsideUser>>(
                    `/worker/currently-inside?skip=${insidePage * INSIDE_PAGE_SIZE}&limit=${INSIDE_PAGE_SIZE}`
                )
                // Stamped here rather than during render: a clock read while
                // rendering makes the component impure.
                .then((res) => ({ ...res.data, fetchedAt: Date.now() })),
        placeholderData: keepPreviousData, // Keeps the old page on screen while the next one loads
    });

    const insideTotal = insideQuery.data?.total ?? 0;
    const insideUsers = insideQuery.data?.items ?? [];
    const insidePageCount = Math.max(1, Math.ceil(insideTotal / INSIDE_PAGE_SIZE));

    // --- 3. ACTIVITY LOG QUERY ---
    const logsQuery = useQuery({
        queryKey: ["worker", "logs", logPage],
        queryFn: () =>
            api
                .get<Paginated<EntryLogEntry>>(
                    `/worker/logs?skip=${logPage * LOG_PAGE_SIZE}&limit=${LOG_PAGE_SIZE}`
                )
                .then((res) => res.data),
        placeholderData: keepPreviousData,
    });

    const logTotal = logsQuery.data?.total ?? 0;
    const logs = logsQuery.data?.items ?? [];
    const logPageCount = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE));

    /**
     * Both lists jump back to page one after a worker action, because the row
     * they just created belongs at the top and they would otherwise be staring
     * at a stale page 4.
     */
    const refreshAfterAction = async () => {
        setInsidePage(0);
        setLogPage(0);
        await queryClient.invalidateQueries({ queryKey: ["worker"] });
    };

    // --- 4. STATUS CHECK ---
    // A mutation rather than a query even though it is a GET: a door check has to
    // hit the server every single time it is asked for. Behind a query key, a
    // worker re-checking the same member would be answered from the cache, and a
    // subscription that expired in the meantime would still read as active.
    // The location travels in the mutation variables rather than being read off
    // the locationId closure inside mutationFn. The answer depends on WHICH gym
    // was asked about, so the request has to carry the value that was on screen
    // when the worker pressed Check - not whatever it has drifted to since.
    const statusMutation = useMutation({
        mutationFn: ({ userId, atLocation }: { userId: number; atLocation: number }) =>
            api
                .get<StatusResponse>(`/worker/user/${userId}/status?location_id=${atLocation}`)
                .then((res) => res.data),
        onSuccess: () => setError(""),
        onError: (err: unknown) => {
            setError(errorDetail(err, "User not found."));
        },
    });

    const statusData = statusMutation.data ?? null;

    const checkStatus = (targetId: number) => {
        setError("");
        setSuccessMsg("");
        statusMutation.reset(); // Clears the previous member's card before the new one lands
        setSelectedUserId(targetId);
        setIsDropdownOpen(false);
        statusMutation.mutate({ userId: targetId, atLocation: locationId });
    };

    const handleSelectResult = (result: SearchResult) => {
        setSearchTerm(result.full_name);
        checkStatus(result.user_id);
    };

    // Enter picks the top hit, so a worker who typed an exact name never has to
    // move their hand to the mouse.
    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (areResultsCurrent && results.length > 0) handleSelectResult(results[0]);
    };

    // --- 5. MUTATIONS ---
    const overrideMutation = useMutation({
        mutationFn: (targetId: number) =>
            api
                .post<{ message?: string }>(`/worker/manual-entry/${targetId}?location_id=${locationId}`)
                .then((res) => res.data),
        onSuccess: async (data) => {
            setError("");
            setSuccessMsg(data.message || "Door opened successfully!");
            await refreshAfterAction();
        },
        onError: (err: unknown) => {
            setSuccessMsg("");
            setError(errorDetail(err, "Failed to open door."));
        },
    });

    // The name travels with the mutation so the confirmation message names the
    // right person even though the list is about to be invalidated underneath it.
    const checkoutMutation = useMutation({
        mutationFn: ({ userId }: { userId: number; name: string }) =>
            api.post(`/worker/force-checkout/${userId}`),
        onSuccess: async (_data, variables) => {
            setError("");
            setSuccessMsg(`${variables.name} was checked out.`);
            await refreshAfterAction();
        },
        onError: () => {
            setSuccessMsg("");
            setError("Failed to force checkout.");
        },
    });

    const handleForceCheckout = (userId: number, name: string) => {
        setPendingConfirm({
            title: "Force checkout?",
            message: `${name} will be marked as outside the building. Use this when someone left without scanning out.`,
            confirmText: "Check them out",
            run: () => checkoutMutation.mutate({ userId, name }),
        });
    };

    // Revoking a pass is a billing action, not a physical one - it deliberately
    // does NOT check the member out of the building. force-checkout above is what
    // does that, and the two are separate on purpose.
    const cancelSubMutation = useMutation({
        mutationFn: ({ userId }: { userId: number; atLocation: number }) =>
            api
                .post<{ message?: string }>(`/worker/user/${userId}/cancel-subscription`)
                .then((res) => res.data),
        onSuccess: async (data, variables) => {
            setError("");
            setSuccessMsg(data.message || "The member's pass has been revoked.");
            await refreshAfterAction();
            // The status card comes off a MUTATION, not a query, so invalidating
            // the ["worker"] prefix does not touch it. Without this re-check the
            // card would go on showing a live pass that no longer exists.
            statusMutation.mutate({ userId: variables.userId, atLocation: variables.atLocation });
        },
        onError: (err: unknown) => {
            setSuccessMsg("");
            setError(errorDetail(err, "Failed to revoke the pass."));
        },
    });

    const handleCancelSubscription = (userId: number) => {
        setPendingConfirm({
            title: "Revoke this pass?",
            message:
                "The membership is cancelled immediately and the member can no longer open a door. This does not check them out of the building.",
            confirmText: "Revoke pass",
            run: () => cancelSubMutation.mutate({ userId, atLocation: locationId }),
        });
    };

    // Durations are measured against the moment the data actually arrived rather
    // than against a live clock. Now that nothing polls, "as of the last refresh"
    // is also the honest reading. The 0 fallback never reaches the screen: with no
    // data there are no rows to map over, so nothing ever divides by it.
    const insideFetchedAt = insideQuery.data?.fetchedAt ?? 0;

    // Shared button styling for the four Prev/Next controls
    const pagerButton =
        "px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-slate-700 disabled:hover:text-gray-700 dark:disabled:hover:text-gray-300";

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* --- LEFT PANEL: MEMBER LOOKUP & OVERRIDE --- */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-gray-800 dark:text-white">Desk Worker Panel</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">Verify subscriptions and perform overrides.</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800">
                        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-4">
                            <div className="flex justify-between items-center mb-1">
                                <label htmlFor="member-search" className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                    Find a member
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500">Gym:</span>
                                    {locationsQuery.isPending ? (
                                        <span className="text-xs font-bold text-gray-400">loading...</span>
                                    ) : locationsQuery.isError || locations.length === 0 ? (
                                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                            {locationsQuery.isError ? "could not load gyms" : "none registered"}
                                        </span>
                                    ) : (
                                        <select
                                            aria-label="Gym location"
                                            value={locationId}
                                            onChange={(e) => setSelectedLocationId(Number(e.target.value))}
                                            className="bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white rounded text-xs p-1 font-bold cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            {locations.map((loc) => (
                                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {/* The dropdown is positioned against this wrapper, and the
                                wrapper is also what "click outside" is measured from. */}
                            <div ref={searchBoxRef} className="relative">
                                <div className="flex gap-4">
                                    <input
                                        id="member-search"
                                        type="text"
                                        autoComplete="off"
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setIsDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsDropdownOpen(true)}
                                        placeholder="Name or email, e.g. Ana or ana@mail.com"
                                        className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold"
                                    />
                                    <button
                                        type="submit"
                                        disabled={statusMutation.isPending || !areResultsCurrent || results.length === 0}
                                        className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {statusMutation.isPending ? "Checking..." : "Check"}
                                    </button>
                                </div>

                                {isDropdownOpen && debouncedTerm.trim().length >= MIN_SEARCH_LENGTH && (
                                    <div className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl">
                                        {/* isPending covers the very first lookup, isFetching every
                                            later one - together they stop "No members match" from
                                            flashing while the request is still in the air. */}
                                        {searchQuery.isPending || !areResultsCurrent ? (
                                            <p className="p-4 text-sm font-bold text-gray-500">Searching...</p>
                                        ) : searchQuery.isError ? (
                                            <p className="p-4 text-sm font-bold text-rose-600 dark:text-rose-400">Search failed. Try again.</p>
                                        ) : results.length === 0 ? (
                                            <p className="p-4 text-sm font-bold text-gray-500">No members match "{debouncedTerm.trim()}".</p>
                                        ) : (
                                            results.map((result) => (
                                                <button
                                                    key={result.user_id}
                                                    type="button"
                                                    onClick={() => handleSelectResult(result)}
                                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-800 transition border-b border-gray-100 dark:border-slate-800 last:border-b-0"
                                                >
                                                    <span className="block font-bold text-sm text-gray-900 dark:text-white">{result.full_name}</span>
                                                    <span className="block text-xs text-gray-500">{result.email} · ID {result.user_id}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </form>

                        {error && <div className="bg-red-100 dark:bg-rose-950/40 text-red-700 dark:text-rose-300 p-4 rounded-xl mt-6 font-bold text-sm border border-red-200 dark:border-rose-900/60">{error}</div>}
                        {successMsg && <div className="bg-green-100 dark:bg-emerald-950/40 text-green-700 dark:text-emerald-300 p-4 rounded-xl mt-6 font-bold text-sm border border-green-200 dark:border-emerald-900/60">{successMsg}</div>}

                        {statusData && (() => {
                            const theme = statusTheme(statusData);

                            return (
                                <div className="mt-8 border-t border-gray-100 dark:border-slate-800 pt-6 flex flex-col gap-6">
                                    <div className={`p-6 rounded-2xl border flex flex-col items-start gap-4 ${theme.card}`}>
                                        <div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block mb-2 ${theme.badge}`}>
                                                {theme.label}
                                            </span>
                                            <h2 className="text-2xl font-black">{statusData.full_name}</h2>
                                            <p className="text-sm opacity-80">{statusData.email}</p>
                                        </div>

                                        {/* The verdict in words. On amber this is the only place the
                                            worker learns WHICH rule blocked the pass, so it is not
                                            optional decoration. */}
                                        <p className="text-sm font-bold">{statusData.message}</p>

                                        {/* Plan and expiry now come back on a refusal too, not just on
                                            a green light - a worker explaining why the door stayed
                                            shut needs them more than one waving somebody through. */}
                                        {statusData.subscription_active && (
                                            <p className="text-xs font-semibold opacity-80">
                                                {statusData.plan_name}
                                                {statusData.days_left !== undefined && ` · ${statusData.days_left} days left`}
                                                {statusData.expires_on && ` · expires ${new Date(statusData.expires_on).toLocaleDateString()}`}
                                            </p>
                                        )}

                                        <div className="w-full flex flex-col sm:flex-row gap-3">
                                            <button
                                                onClick={() => selectedUserId !== null && overrideMutation.mutate(selectedUserId)}
                                                disabled={overrideMutation.isPending || selectedUserId === null}
                                                className="flex-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold px-6 py-3 rounded-xl hover:bg-black dark:hover:bg-white transition shadow-md disabled:opacity-60"
                                            >
                                                {overrideMutation.isPending ? "Opening..." : "🔓 Manual Door Override"}
                                            </button>

                                            {/* Gated on subscription_active, NOT on has_active_subscription:
                                                the amber case is a pass that genuinely exists and can
                                                genuinely be revoked, and that is exactly where the
                                                stricter flag would have hidden the button. */}
                                            {statusData.subscription_active && (
                                                <button
                                                    onClick={() => selectedUserId !== null && handleCancelSubscription(selectedUserId)}
                                                    disabled={cancelSubMutation.isPending || selectedUserId === null}
                                                    className="flex-1 bg-rose-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-rose-700 transition shadow-md disabled:opacity-60"
                                                >
                                                    {cancelSubMutation.isPending ? "Revoking..." : "🚫 Revoke Pass"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* --- RIGHT PANEL: CURRENTLY INSIDE LIST --- */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col h-[500px]">
                    <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Live Attendance</h2>
                            <p className="text-xs text-gray-500">Members currently inside the gym.</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => void insideQuery.refetch()}
                                disabled={insideQuery.isFetching}
                                title="Refresh the attendance list"
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition disabled:opacity-50"
                            >
                                {insideQuery.isFetching ? "⏳" : "🔄"} Refresh
                            </button>
                            <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 font-black px-3 py-1 rounded-full text-sm">
                                {insideTotal} Active
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {insideQuery.isPending ? (
                            <p className="text-gray-500 text-center mt-10 font-bold">Loading live data...</p>
                        ) : insideQuery.isError ? (
                            <p className="text-rose-600 dark:text-rose-400 text-center mt-10 font-bold">Could not load attendance.</p>
                        ) : insideUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <span className="text-4xl mb-2">👻</span>
                                <p>The gym is completely empty.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {insideUsers.map((user) => {
                                    // Time spent inside, measured from the last refresh
                                    const diff = insideFetchedAt - new Date(user.entered_at).getTime();
                                    const mins = Math.max(0, Math.floor(diff / 60000));

                                    return (
                                        <div key={user.user_id} className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex justify-between items-center gap-3 group transition hover:border-blue-300">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{user.full_name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-500">ID: {user.user_id}</span>
                                                    <span className="h-1 w-1 bg-gray-300 rounded-full"></span>
                                                    <span className={`text-xs font-bold ${mins > 120 ? "text-red-500" : "text-emerald-500"}`}>
                                                        {formatDuration(mins)} inside
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleForceCheckout(user.user_id, user.full_name)}
                                                disabled={checkoutMutation.isPending}
                                                className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-900/70 text-rose-700 dark:text-rose-300 text-xs font-bold py-2 px-3 rounded-lg disabled:opacity-40"
                                            >
                                                Force Exit
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pager stays mounted so the panel height never jumps */}
                    <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
                        <button
                            onClick={() => setInsidePage((p) => Math.max(0, p - 1))}
                            disabled={insidePage === 0 || insideQuery.isFetching}
                            className={pagerButton}
                        >
                            ← Prev
                        </button>
                        <span className="text-xs font-bold text-gray-500">
                            Page {insidePage + 1} of {insidePageCount}
                        </span>
                        <button
                            onClick={() => setInsidePage((p) => p + 1)}
                            disabled={insidePage + 1 >= insidePageCount || insideQuery.isFetching}
                            className={pagerButton}
                        >
                            Next →
                        </button>
                    </div>
                </div>

            </div>

            {/* --- BOTTOM PANEL: ACTIVITY LOG --- */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Activity Log</h2>
                        <p className="text-xs text-gray-500">Every entry, exit and denied scan, newest first.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => void logsQuery.refetch()}
                            disabled={logsQuery.isFetching}
                            title="Refresh the activity log"
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition disabled:opacity-50"
                        >
                            {logsQuery.isFetching ? "⏳" : "🔄"} Refresh
                        </button>
                        <span className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-black px-3 py-1 rounded-full text-sm">
                            {logTotal} Total
                        </span>
                    </div>
                </div>

                <div className="p-4">
                    {logsQuery.isPending ? (
                        <p className="text-gray-500 text-center py-10 font-bold">Loading activity...</p>
                    ) : logsQuery.isError ? (
                        <p className="text-rose-600 dark:text-rose-400 text-center py-10 font-bold">Could not load the activity log.</p>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <span className="text-4xl mb-2">🗒️</span>
                            <p>Nothing has been scanned yet.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* ENTRY and EXIT read as directions, so they get arrows rather than colour alone */}
                                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                            log.action_type === "EXIT"
                                                ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                                        }`}>
                                            {log.action_type === "EXIT" ? "↩ Exit" : "↪ Entry"}
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{log.full_name}</h3>
                                            <p className="text-xs text-gray-500 truncate">
                                                ID: {log.user_id}
                                                {log.reason ? ` · ${log.reason}` : ""}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                            log.access_granted
                                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                                : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
                                        }`}>
                                            {log.access_granted ? "Granted" : "Denied"}
                                        </span>
                                        <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
                    <button
                        onClick={() => setLogPage((p) => Math.max(0, p - 1))}
                        disabled={logPage === 0 || logsQuery.isFetching}
                        className={pagerButton}
                    >
                        ← Prev
                    </button>
                    <span className="text-xs font-bold text-gray-500">
                        Page {logPage + 1} of {logPageCount}
                    </span>
                    <button
                        onClick={() => setLogPage((p) => p + 1)}
                        disabled={logPage + 1 >= logPageCount || logsQuery.isFetching}
                        className={pagerButton}
                    >
                        Next →
                    </button>
                </div>
            </div>

            {/* --- CONFIRMATION DIALOG --- */}
            {/* One instance serves both destructive actions: whichever handler ran
                last put its own copy and its own callback into pendingConfirm. */}
            <ConfirmModal
                isOpen={pendingConfirm !== null}
                title={pendingConfirm?.title ?? ""}
                message={pendingConfirm?.message ?? ""}
                confirmText={pendingConfirm?.confirmText}
                variant="danger"
                onConfirm={() => {
                    pendingConfirm?.run();
                    setPendingConfirm(null);
                }}
                onCancel={() => setPendingConfirm(null)}
            />
        </div>
    );
}
