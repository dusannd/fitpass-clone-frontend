import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";

// --- INTERFACES ---
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
    allowed_days: string | null; // "0,1,2,3,4" (0=Monday, 6=Sunday)
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ManagePlans() {
    // --- TABS ---
    const [activeTab, setActiveTab] = useState<"locations" | "plans">("locations");

    // --- SHARED DATA ---
    const [locations, setLocations] = useState<GymLocation[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // --- LOCATION FORM ---
    const [locName, setLocName] = useState("");
    const [locAddress, setLocAddress] = useState("");
    const [locIs247, setLocIs247] = useState(true);
    const [isAddingLocation, setIsAddingLocation] = useState(false);

    // --- PLAN FORM ---
    const [planName, setPlanName] = useState("");
    const [planDescription, setPlanDescription] = useState("");
    const [price, setPrice] = useState<number>(3000);
    const [durationDays, setDurationDays] = useState<number>(30);
    const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

    // Optional rule
    const [ruleEnabled, setRuleEnabled] = useState(false);
    const [allowedTimeStart, setAllowedTimeStart] = useState("");
    const [allowedTimeEnd, setAllowedTimeEnd] = useState("");
    const [allowedDays, setAllowedDays] = useState<number[]>([]);

    const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
    const [togglingPlanId, setTogglingPlanId] = useState<number | null>(null);

    // --- FETCH DATA ---
    const fetchLocations = useCallback(async () => {
        const res = await api.get("/subscriptions/locations");
        setLocations(res.data);
    }, []);

    // Admins need to see inactive plans too (so they can re-activate them),
    // so this uses /plans/all instead of the public /plans endpoint.
    const fetchPlans = useCallback(async () => {
        const res = await api.get("/subscriptions/plans/all");
        setPlans(res.data);
    }, []);

    useEffect(() => {
        const loadEverything = async () => {
            try {
                await Promise.all([fetchLocations(), fetchPlans()]);
            } catch (err: unknown) {
                // Log + surface the real reason instead of a generic message,
                // so a 401/403 (not logged in as admin) doesn't look identical
                // to a genuine network/server error.
                console.error("Failed to load locations/plans:", err);
                if (axios.isAxiosError(err)) {
                    setError(err.response?.data?.detail || `Failed to load locations/plans (${err.response?.status ?? "network error"}).`);
                } else {
                    setError("Failed to load locations/plans.");
                }
            } finally {
                setLoading(false);
            }
        };
        void loadEverything();
    }, [fetchLocations, fetchPlans]);

    // --- LOCATION ACTIONS ---
    const handleAddLocation = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setIsAddingLocation(true);

        try {
            await api.post("/subscriptions/locations", {
                name: locName,
                address: locAddress || null,
                is_24_7: locIs247,
            });

            setSuccessMsg(`Location "${locName}" added!`);

            // Clear form
            setLocName("");
            setLocAddress("");
            setLocIs247(true);

            await fetchLocations();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to add location.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsAddingLocation(false);
        }
    };

    // --- PLAN ACTIONS ---
    const toggleSelectedLocation = (id: number) => {
        setSelectedLocationIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const toggleSelectedDay = (day: number) => {
        setAllowedDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
        );
    };

    const handleCreatePlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setIsSubmittingPlan(true);

        try {
            const payload: Record<string, unknown> = {
                name: planName,
                description: planDescription || null,
                price,
                duration_days: durationDays,
                location_ids: selectedLocationIds,
            };

            // Only attach a rule if the admin actually enabled it
            if (ruleEnabled) {
                payload.rule = {
                    allowed_time_start: allowedTimeStart || null,
                    allowed_time_end: allowedTimeEnd || null,
                    allowed_days: allowedDays.length > 0 ? allowedDays.join(",") : null,
                };
            }

            await api.post("/subscriptions/plans", payload);
            setSuccessMsg(`Plan "${planName}" successfully created!`);

            // Clear form inputs
            setPlanName("");
            setPlanDescription("");
            setPrice(3000);
            setDurationDays(30);
            setSelectedLocationIds([]);
            setRuleEnabled(false);
            setAllowedTimeStart("");
            setAllowedTimeEnd("");
            setAllowedDays([]);

            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsSubmittingPlan(false);
        }
    };

    const handleToggleActive = async (planId: number) => {
        setError("");
        setTogglingPlanId(planId);
        try {
            await api.put(`/subscriptions/plans/${planId}/toggle-active`);
            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to update plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setTogglingPlanId(null);
        }
    };

    if (loading) {
        return <div className="p-6 text-gray-500 font-bold">Loading...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-6 h-full">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Manage Plans & Locations
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Register gym locations, then build pricing plans on top of them.
                </p>
            </div>

            {/* MESSAGES */}
            {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl text-sm font-bold border border-emerald-200 dark:border-emerald-800 transition-colors">
                    ✅ {successMsg}
                </div>
            )}
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-4 rounded-xl text-sm font-bold border border-rose-200 dark:border-rose-800 transition-colors">
                    ❌ {error}
                </div>
            )}

            {/* TABS */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab("locations")}
                    className={`px-5 py-3 font-bold text-sm rounded-t-xl transition-colors ${
                        activeTab === "locations"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-slate-800"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                    }`}
                >
                    📍 Locations
                </button>
                <button
                    onClick={() => setActiveTab("plans")}
                    className={`px-5 py-3 font-bold text-sm rounded-t-xl transition-colors ${
                        activeTab === "plans"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-slate-800"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                    }`}
                >
                    💳 Plans
                </button>
            </div>

            {/* ================= LOCATIONS TAB ================= */}
            {activeTab === "locations" && (
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* ADD LOCATION FORM */}
                    <div className="w-full lg:w-1/3 sticky top-6">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                                Add Gym Location
                            </h2>

                            <form onSubmit={(e) => void handleAddLocation(e)} className="flex flex-col gap-5">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={locName}
                                        onChange={(e) => setLocName(e.target.value)}
                                        placeholder="e.g. Downtown Gym"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Address
                                    </label>
                                    <input
                                        type="text"
                                        value={locAddress}
                                        onChange={(e) => setLocAddress(e.target.value)}
                                        placeholder="123 Main St"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={locIs247}
                                        onChange={(e) => setLocIs247(e.target.checked)}
                                        className="h-4 w-4 rounded accent-blue-600"
                                    />
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                        Open 24/7
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={isAddingLocation}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 mt-2"
                                >
                                    {isAddingLocation ? "Adding..." : "Add Location"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* LOCATIONS TABLE */}
                    <div className="w-full lg:w-2/3">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                            All Locations
                        </h2>

                        {locations.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl text-center border border-gray-200 dark:border-slate-800 text-gray-500 transition-colors">
                                No locations registered yet.
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-slate-800/60 text-left">
                                        <tr>
                                            <th className="p-4 font-bold text-gray-500 dark:text-gray-400">Name</th>
                                            <th className="p-4 font-bold text-gray-500 dark:text-gray-400">Address</th>
                                            <th className="p-4 font-bold text-gray-500 dark:text-gray-400">Hours</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {locations.map((loc) => (
                                            <tr key={loc.id} className="border-t border-gray-100 dark:border-slate-800">
                                                <td className="p-4 font-bold text-gray-900 dark:text-white">{loc.name}</td>
                                                <td className="p-4 text-gray-500 dark:text-gray-400">{loc.address || "—"}</td>
                                                <td className="p-4">
                                                    {loc.is_24_7 ? (
                                                        <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-black uppercase">
                                                            24/7
                                                        </span>
                                                    ) : (
                                                        <span className="bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-full text-xs font-black uppercase">
                                                            Limited
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ================= PLANS TAB ================= */}
            {activeTab === "plans" && (
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* CREATE PLAN FORM */}
                    <div className="w-full lg:w-1/3 sticky top-6">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                                Create New Plan
                            </h2>

                            <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-5">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Plan Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={planName}
                                        onChange={(e) => setPlanName(e.target.value)}
                                        placeholder="e.g. Gold VIP"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Description
                                    </label>
                                    <input
                                        type="text"
                                        value={planDescription}
                                        onChange={(e) => setPlanDescription(e.target.value)}
                                        placeholder="Full 24/7 Access"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-1/2">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Price (RSD)
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            value={price}
                                            onChange={(e) => setPrice(parseInt(e.target.value, 10) || 0)}
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                            Duration (Days)
                                        </label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={durationDays}
                                            onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* LOCATION CHECKBOXES */}
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl transition-colors">
                                    <label className="block text-sm font-bold text-blue-900 dark:text-blue-300 mb-3">
                                        Allowed Gym Locations
                                    </label>

                                    {locations.length === 0 ? (
                                        <p className="text-xs text-blue-700 dark:text-blue-400 opacity-80">
                                            No locations yet — add one in the Locations tab first.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {locations.map((loc) => (
                                                <label
                                                    key={loc.id}
                                                    className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2 cursor-pointer select-none"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLocationIds.includes(loc.id)}
                                                        onChange={() => toggleSelectedLocation(loc.id)}
                                                        className="h-4 w-4 rounded accent-blue-600"
                                                    />
                                                    <span className="text-xs font-bold text-gray-800 dark:text-white truncate">
                                                        {loc.name}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* OPTIONAL RULE */}
                                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-2xl transition-colors">
                                    <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
                                        <input
                                            type="checkbox"
                                            checked={ruleEnabled}
                                            onChange={(e) => setRuleEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded accent-purple-600"
                                        />
                                        <span className="text-sm font-bold text-purple-900 dark:text-purple-300">
                                            Restrict access hours/days
                                        </span>
                                    </label>
                                    <p className="text-xs text-purple-700 dark:text-purple-400 opacity-80 mb-3">
                                        Leave off for unrestricted 24/7 access.
                                    </p>

                                    {ruleEnabled && (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex gap-3">
                                                <div className="w-1/2">
                                                    <label className="block text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">
                                                        From
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={allowedTimeStart}
                                                        onChange={(e) => setAllowedTimeStart(e.target.value)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white p-2 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="w-1/2">
                                                    <label className="block text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">
                                                        Until
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={allowedTimeEnd}
                                                        onChange={(e) => setAllowedTimeEnd(e.target.value)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white p-2 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-purple-800 dark:text-purple-300 mb-1.5">
                                                    Allowed Days
                                                </label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {DAY_LABELS.map((label, index) => (
                                                        <button
                                                            key={label}
                                                            type="button"
                                                            onClick={() => toggleSelectedDay(index)}
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                                allowedDays.includes(index)
                                                                    ? "bg-purple-600 text-white"
                                                                    : "bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400 border border-purple-200 dark:border-purple-800"
                                                            }`}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingPlan}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 mt-2"
                                >
                                    {isSubmittingPlan ? "Creating..." : "Create Plan"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* EXISTING PLANS LIST */}
                    <div className="w-full lg:w-2/3">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                            Existing Plans
                        </h2>

                        {plans.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl text-center border border-gray-200 dark:border-slate-800 text-gray-500 transition-colors">
                                No plans created yet.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {plans.map((plan) => (
                                    <div
                                        key={plan.id}
                                        className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200 flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-3">
                                                <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                                                    {plan.name}
                                                </h3>
                                                <span
                                                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                        plan.is_active
                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                                                            : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
                                                    }`}
                                                >
                                                    {plan.is_active ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                                {plan.description || "No description provided."}
                                            </p>

                                            {/* LOCATIONS + RULE SUMMARY */}
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {plan.locations.length === 0 ? (
                                                    <span className="text-xs text-gray-400 italic">No locations assigned</span>
                                                ) : (
                                                    plan.locations.map((loc) => (
                                                        <span
                                                            key={loc.id}
                                                            className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                                        >
                                                            📍 {loc.name}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                            {plan.rule && (
                                                <p className="text-xs text-purple-600 dark:text-purple-400 font-bold mb-4">
                                                    ⏱️ Restricted hours apply
                                                </p>
                                            )}
                                        </div>

                                        {/* PLAN METRICS */}
                                        <div className="flex justify-between items-center text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50 mb-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Price</span>
                                                <span className="text-blue-600 dark:text-blue-400 text-lg">{plan.price} RSD</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Duration</span>
                                                <span className="text-gray-900 dark:text-white text-lg">{plan.duration_days} <span className="text-sm font-medium">Days</span></span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => void handleToggleActive(plan.id)}
                                            disabled={togglingPlanId !== null}
                                            className={`w-full font-bold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 ${
                                                plan.is_active
                                                    ? "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                                                    : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                                            }`}
                                        >
                                            {togglingPlanId === plan.id
                                                ? "Updating..."
                                                : plan.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
