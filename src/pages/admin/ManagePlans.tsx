import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import {
    DAY_LABELS,
    PLAN_PERKS,
    PLAN_TIERS,
    activePerks,
    formatTime,
    getTierBadgeClass,
    parseAllowedDays,
    type GymLocation,
    type PerkKey,
    type Plan,
    type PlanTier,
} from "../../utils/subscription";

// Every perk off. Used for a fresh form and as the shape of the perk state, so a
// perk added to PLAN_PERKS can never be missing a key here.
const NO_PERKS: Record<PerkKey, boolean> = Object.fromEntries(
    PLAN_PERKS.map((perk) => [perk.key, false])
) as Record<PerkKey, boolean>;

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
    const [planTier, setPlanTier] = useState<PlanTier>("Standard");
    const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

    // One record rather than five useStates, so adding a perk to PLAN_PERKS needs
    // no change here at all.
    const [perks, setPerks] = useState<Record<PerkKey, boolean>>(NO_PERKS);

    // Optional rule
    const [ruleEnabled, setRuleEnabled] = useState(false);
    const [allowedTimeStart, setAllowedTimeStart] = useState("");
    const [allowedTimeEnd, setAllowedTimeEnd] = useState("");
    const [allowedDays, setAllowedDays] = useState<number[]>([]);

    // null = the form is creating a new plan; a number = it is editing that plan.
    // One form serving both keeps the two field lists from drifting apart.
    const [editingPlanId, setEditingPlanId] = useState<number | null>(null);

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
                    setError(errorDetail(err, `Failed to load locations/plans (${err.response?.status ?? "network error"}).`));
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
            setError(errorDetail(err, "Failed to add location."));
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

    // Puts the form back to "create a new plan" state. Needed in three places now:
    // after a successful submit, when starting an edit, and when cancelling one.
    const resetPlanForm = () => {
        setEditingPlanId(null);
        setPlanName("");
        setPlanDescription("");
        setPrice(3000);
        setDurationDays(30);
        setPlanTier("Standard");
        setPerks(NO_PERKS);
        setSelectedLocationIds([]);
        setRuleEnabled(false);
        setAllowedTimeStart("");
        setAllowedTimeEnd("");
        setAllowedDays([]);
    };

    // Loads an existing plan into the form and switches it to edit mode.
    const handleStartEdit = (plan: Plan) => {
        setError("");
        setSuccessMsg("");

        setEditingPlanId(plan.id);
        setPlanName(plan.name);
        setPlanDescription(plan.description || "");
        setPrice(plan.price);
        setDurationDays(plan.duration_days);
        setPlanTier(plan.tier);

        // Perks ARE editable, unlike locations and the rule below: they are plain
        // scalars, so PUT /plans/{id} takes them like it takes price or tier.
        setPerks(
            Object.fromEntries(
                PLAN_PERKS.map((perk) => [perk.key, plan[perk.key]])
            ) as Record<PerkKey, boolean>
        );

        // Locations and rules can't be changed here, but we still load them so the
        // (disabled) panels show what this plan actually covers. Editing a price
        // while blind to which gyms it applies to is worse than the risk of the
        // read-only fields looking editable - which the note below them handles.
        setSelectedLocationIds(plan.locations.map((loc) => loc.id));

        setRuleEnabled(plan.rule !== null);
        // The API stores "HH:MM:SS" but <input type="time"> only accepts "HH:MM",
        // so it would silently render blank without formatTime.
        setAllowedTimeStart(plan.rule?.allowed_time_start ? formatTime(plan.rule.allowed_time_start) : "");
        setAllowedTimeEnd(plan.rule?.allowed_time_end ? formatTime(plan.rule.allowed_time_end) : "");
        setAllowedDays(parseAllowedDays(plan.rule?.allowed_days));
    };

    const handleSubmitPlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setSuccessMsg("");
        setIsSubmittingPlan(true);

        try {
            if (editingPlanId !== null) {
                // PUT /plans/{id} accepts scalars only. Locations and rules are
                // create-time on the backend, which is why the form shows them
                // locked while editing rather than sending them - the perks are
                // scalars, so they go through here like price and tier do.
                await api.put(`/subscriptions/plans/${editingPlanId}`, {
                    name: planName,
                    description: planDescription || null,
                    price,
                    duration_days: durationDays,
                    tier: planTier,
                    ...perks,
                });
                setSuccessMsg(`Plan "${planName}" updated!`);
            } else {
                const payload: Record<string, unknown> = {
                    name: planName,
                    description: planDescription || null,
                    price,
                    duration_days: durationDays,
                    tier: planTier,
                    ...perks,
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
            }

            resetPlanForm();
            await fetchPlans();
        } catch (err: unknown) {
            setError(errorDetail(err, "Failed to save plan."));
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
            setError(errorDetail(err, "Failed to update plan."));
        } finally {
            setTogglingPlanId(null);
        }
    };

    if (loading) {
        return <div className="p-6 text-gray-500 font-bold">Loading...</div>;
    }

    // Locations and access rules are create-time only on the backend, so in edit mode
    // they are shown for context but not editable.
    const fieldsLocked = editingPlanId !== null;

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
                            <div className="flex items-start justify-between gap-3 mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {editingPlanId !== null ? "Edit Plan" : "Create New Plan"}
                                </h2>

                                {editingPlanId !== null && (
                                    <button
                                        type="button"
                                        onClick={resetPlanForm}
                                        className="shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors underline"
                                    >
                                        Cancel edit
                                    </button>
                                )}
                            </div>

                            <form onSubmit={(e) => void handleSubmitPlan(e)} className="flex flex-col gap-5">
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
                                        {/* parseFloat, not parseInt: the backend price is a float, and the
                                            edit form now loads an existing price back into this field, so
                                            truncating here would silently change the price. */}
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            value={price}
                                            onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
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

                                {/* PLAN TIER */}
                                {/* Drives how premium the card looks on the member pricing page */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                        Plan Tier
                                    </label>
                                    <select
                                        value={planTier}
                                        onChange={(e) => setPlanTier(e.target.value as PlanTier)}
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    >
                                        {PLAN_TIERS.map((tier) => (
                                            <option key={tier} value={tier}>
                                                {tier}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                        Controls how the card is styled for members. Pro is marked "Most Popular".
                                    </p>
                                </div>

                                {/* PLAN PERKS */}
                                {/* Unlike the tier above, these change what the membership
                                    actually IS. Editable while editing too - they are plain
                                    scalars, so PUT /plans/{id} takes them. */}
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl transition-colors">
                                    <label className="block text-sm font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                                        What's Included
                                    </label>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400 opacity-80 mb-3">
                                        Ticked perks show as green checkmarks on the member's pricing card.
                                    </p>

                                    <div className="flex flex-col gap-2">
                                        {PLAN_PERKS.map((perk) => (
                                            <label
                                                key={perk.key}
                                                className="flex items-start gap-2.5 cursor-pointer text-sm text-emerald-900 dark:text-emerald-200"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={perks[perk.key]}
                                                    onChange={(e) =>
                                                        setPerks((prev) => ({
                                                            ...prev,
                                                            [perk.key]: e.target.checked,
                                                        }))
                                                    }
                                                    className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
                                                />
                                                <span>
                                                    <span className="font-semibold">{perk.label}</span>
                                                    {/* Only the enforced perk carries a note, so the
                                                        admin knows which box actually locks a feature. */}
                                                    {perk.note && (
                                                        <span className="block text-xs opacity-70 mt-0.5">
                                                            {perk.note}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* LOCATIONS + RULES */}
                                {/* PUT /plans/{id} accepts only the scalar fields above, so while
                                    editing these are shown for context but locked. They stay
                                    visible on purpose: you shouldn't have to edit a price blind
                                    to which gyms the plan covers. */}

                                {/* LOCATION CHECKBOXES */}
                                <div className={`p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl transition-colors ${
                                    fieldsLocked ? "opacity-60" : ""
                                }`}>
                                    <label className="block text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">
                                        Allowed Gym Locations
                                    </label>

                                    {fieldsLocked && (
                                        <p className="text-xs text-blue-700 dark:text-blue-400 opacity-80 mb-3">
                                            🔒 Set when the plan was created — read only.
                                        </p>
                                    )}

                                    {locations.length === 0 ? (
                                        <p className="text-xs text-blue-700 dark:text-blue-400 opacity-80">
                                            No locations yet — add one in the Locations tab first.
                                        </p>
                                    ) : (
                                        <div className={`grid grid-cols-2 gap-2 ${fieldsLocked ? "mt-0" : "mt-2"}`}>
                                            {locations.map((loc) => (
                                                <label
                                                    key={loc.id}
                                                    className={`flex items-center gap-2 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2 select-none ${
                                                        fieldsLocked ? "cursor-not-allowed" : "cursor-pointer"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLocationIds.includes(loc.id)}
                                                        onChange={() => toggleSelectedLocation(loc.id)}
                                                        disabled={fieldsLocked}
                                                        className="h-4 w-4 rounded accent-blue-600 disabled:cursor-not-allowed"
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
                                <div className={`p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 rounded-2xl transition-colors ${
                                    fieldsLocked ? "opacity-60" : ""
                                }`}>
                                    <label className={`flex items-center gap-2 select-none mb-1 ${
                                        fieldsLocked ? "cursor-not-allowed" : "cursor-pointer"
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={ruleEnabled}
                                            onChange={(e) => setRuleEnabled(e.target.checked)}
                                            disabled={fieldsLocked}
                                            className="h-4 w-4 rounded accent-purple-600 disabled:cursor-not-allowed"
                                        />
                                        <span className="text-sm font-bold text-purple-900 dark:text-purple-300">
                                            Restrict access hours/days
                                        </span>
                                    </label>
                                    <p className="text-xs text-purple-700 dark:text-purple-400 opacity-80 mb-3">
                                        {fieldsLocked
                                            ? "🔒 Set when the plan was created — read only."
                                            : "Leave off for unrestricted 24/7 access."}
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
                                                        disabled={fieldsLocked}
                                                        className="w-full bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white p-2 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:cursor-not-allowed"
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
                                                        disabled={fieldsLocked}
                                                        className="w-full bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white p-2 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:cursor-not-allowed"
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
                                                            disabled={fieldsLocked}
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed ${
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
                                    {isSubmittingPlan
                                        ? "Saving..."
                                        : editingPlanId !== null ? "Save Changes" : "Create Plan"}
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
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                                                    {plan.name}
                                                </h3>
                                                <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
                                                    <span
                                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getTierBadgeClass(plan.tier)}`}
                                                    >
                                                        {plan.tier}
                                                    </span>
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

                                            {/* PERKS */}
                                            {/* Readable at a glance, so you don't have to open the
                                                editor to see what a plan actually includes. */}
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {activePerks(plan).length === 0 ? (
                                                    <span className="text-xs text-gray-400 italic">No perks included</span>
                                                ) : (
                                                    activePerks(plan).map((perk) => (
                                                        <span
                                                            key={perk.key}
                                                            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-bold"
                                                        >
                                                            ✓ {perk.label}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
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

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleStartEdit(plan)}
                                                className={`flex-1 font-bold py-2.5 rounded-xl text-sm transition-all ${
                                                    editingPlanId === plan.id
                                                        ? "bg-blue-600 text-white"
                                                        : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                                                }`}
                                            >
                                                {editingPlanId === plan.id ? "✏️ Editing" : "✏️ Edit"}
                                            </button>

                                            <button
                                                onClick={() => void handleToggleActive(plan.id)}
                                                disabled={togglingPlanId !== null}
                                                className={`flex-1 font-bold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 ${
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
