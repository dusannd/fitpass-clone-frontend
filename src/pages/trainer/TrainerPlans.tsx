import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { api } from "../../api/axios";
import { WEIGHT_STEP_OPTIONS, DEFAULT_WEIGHT_STEP } from "../../utils/workout";

// --- INTERFACES ---
// The create form works with an exercise that has no id yet, so it keeps its own shape.
interface ExerciseDraft {
    name: string;
    sets: number;
    reps: string;
    rest_time_seconds: number;
    requires_weight: boolean;
    // What the client's live workout screen needs from the trainer
    recommended_weight_kg: number | null;
    weight_step_kg: number;
    instructions: string;
}

interface WorkoutPlan {
    id: number;
    name: string;
    description: string;
    client_id: number | null; // null = public marketplace plan
    exercises: (ExerciseDraft & { id?: number })[];
}

// Active clients, for the assignment dropdown. Same shape as in TrainerClients.tsx.
interface ClientInfo {
    id: number;
    first_name: string;
    last_name: string;
}

interface CoachingLink {
    id: number;
    client_id: number;
    client: ClientInfo;
}

// Everything in the builder that we do not want the trainer to lose.
interface PlanDraft {
    name: string;
    description: string;
    client_id: number | null;
    exercises: ExerciseDraft[];
}

// A fresh row in the exercise builder.
const emptyExercise = (): ExerciseDraft => ({
    name: "",
    sets: 3,
    reps: "10",
    rest_time_seconds: 60,
    requires_weight: true,
    recommended_weight_kg: null,
    weight_step_kg: DEFAULT_WEIGHT_STEP,
    instructions: "",
});

const emptyDraft = (): PlanDraft => ({
    name: "",
    description: "",
    client_id: null,
    exercises: [emptyExercise()],
});

// --- DRAFT PERSISTENCE ---
// Building a 10 exercise plan takes real effort. One misclick on the sidebar used to
// throw all of it away, so we mirror the form into localStorage on every keystroke.
const DRAFT_KEY = "workout_plan_draft";

/**
 * Reads the saved draft, or null if there is none. Anything unreadable is dropped
 * instead of thrown, the same way Dashboard.tsx handles its stored QR state - a bad
 * entry must never be able to break the page on mount.
 */
const loadDraft = (): PlanDraft | null => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return null;

    try {
        const parsed = JSON.parse(saved) as Partial<PlanDraft>;
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.exercises)) {
            localStorage.removeItem(DRAFT_KEY);
            return null;
        }

        return {
            name: typeof parsed.name === "string" ? parsed.name : "",
            description: typeof parsed.description === "string" ? parsed.description : "",
            client_id: typeof parsed.client_id === "number" ? parsed.client_id : null,
            // Merge over a fresh exercise so a draft saved before a field existed can
            // never put undefined into a controlled input.
            exercises: parsed.exercises.length > 0
                ? parsed.exercises.map((ex) => ({ ...emptyExercise(), ...ex }))
                : [emptyExercise()],
        };
    } catch {
        localStorage.removeItem(DRAFT_KEY);
        return null;
    }
};

/**
 * An untouched form. We refuse to store this, otherwise simply opening the page would
 * leave a draft behind and greet the trainer with a "restored" banner next time.
 */
const isPristine = (draft: PlanDraft): boolean => {
    if (draft.name.trim() || draft.description.trim() || draft.client_id !== null) return false;
    if (draft.exercises.length !== 1) return false;

    const [only] = draft.exercises;
    return !only.name.trim() && !only.instructions.trim() && only.recommended_weight_kg === null;
};

// What "📋 Assign Plan" on the My Clients page hands over through the router.
interface AssignHandoff {
    assignToClientId?: number;
    assignToClientName?: string;
}

export default function TrainerPlans() {
    const location = useLocation();
    const navigate = useNavigate();

    const [plans, setPlans] = useState<WorkoutPlan[]>([]);
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [loading, setLoading] = useState(true);

    // The whole builder lives in one object so persisting it is a single effect
    // instead of one listener per field. restoredFromDraft rides along in the same
    // state so we only read localStorage once, on mount.
    const [form, setForm] = useState(() => {
        const saved = loadDraft();
        const base = saved ?? emptyDraft();

        // Arriving from "Assign Plan" on My Clients: the trainer has just said who this
        // plan is for, so that beats whatever client the stored draft happened to hold.
        // Applying it here, in the same single read, avoids a second render and any
        // setState-in-effect.
        const handoff = (location.state ?? null) as AssignHandoff | null;
        const draft = handoff?.assignToClientId
            ? { ...base, client_id: handoff.assignToClientId }
            : base;

        return {
            draft,
            restoredFromDraft: saved !== null,
            // Only needed until the client list arrives, so the banner can name them
            // on the very first paint.
            handoffClientName: handoff?.assignToClientName ?? "",
        };
    });
    const draft = form.draft;

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const fetchPlans = async () => {
        try {
            // The client list only feeds the assignment dropdown, so it must not be able
            // to take the form down with it - a trainer with no clients still publishes.
            const [plansRes, clientsRes] = await Promise.all([
                api.get<WorkoutPlan[]>("/trainer/plans"),
                api.get<CoachingLink[]>("/coaching/clients").catch(() => null),
            ]);

            setPlans(plansRes.data);
            if (clientsRes) setClients(clientsRes.data.map((link) => link.client));
        } catch {
            setError("Failed to load your workout plans.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchPlans();
    }, []);

    // The hand-off was consumed by the state initializer above. Drop it from the history
    // entry so refreshing the page does not re-apply a client the trainer has since
    // changed their mind about.
    useEffect(() => {
        if (!location.state) return;
        navigate(location.pathname, { replace: true, state: null });
    }, [location.state, location.pathname, navigate]);

    // --- DRAFT AUTO-SAVE ---
    // Runs on every edit. Same shape as the theme effect in Layout.tsx: React state is
    // the source of truth, localStorage just follows it.
    useEffect(() => {
        if (isPristine(draft)) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, [draft]);

    const patchDraft = (patch: Partial<PlanDraft>) => {
        setForm((prev) => ({ ...prev, draft: { ...prev.draft, ...patch } }));
    };

    const discardDraft = () => {
        setForm({ draft: emptyDraft(), restoredFromDraft: false, handoffClientName: "" });
    };

    /**
     * Loads an existing plan back into the builder so it can be published again for a
     * specific client. Nothing is sent yet - the trainer picks the client and hits
     * Publish, which is the same POST as always, so no new endpoint is involved.
     */
    const duplicatePlan = (plan: WorkoutPlan) => {
        if (!isPristine(draft) && !window.confirm("Replace what you are currently building with a copy of this plan?")) {
            return;
        }

        setForm({
            draft: {
                name: `${plan.name} (copy)`,
                description: plan.description ?? "",
                // Keep the original target: copying a private plan keeps that client,
                // copying a public one leaves the select on Public until they choose.
                client_id: plan.client_id,
                // Rebuild each exercise field by field: the API version carries an id we
                // must not copy, and nullable columns would land in controlled inputs.
                exercises: plan.exercises.map((ex) => ({
                    ...emptyExercise(),
                    name: ex.name,
                    sets: ex.sets,
                    reps: ex.reps,
                    rest_time_seconds: ex.rest_time_seconds ?? 60,
                    requires_weight: ex.requires_weight,
                    recommended_weight_kg: ex.recommended_weight_kg ?? null,
                    weight_step_kg: ex.weight_step_kg ?? DEFAULT_WEIGHT_STEP,
                    instructions: ex.instructions ?? "",
                })),
            },
            restoredFromDraft: false,
            handoffClientName: "",
        });

        setError("");
        setMessage("Copied into the builder. Pick who it is for, then publish it.");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const addExercise = () => {
        patchDraft({ exercises: [...draft.exercises, emptyExercise()] });
    };

    const removeExercise = (index: number) => {
        patchDraft({ exercises: draft.exercises.filter((_, i) => i !== index) });
    };

    // value can be null because "Target kg" is optional - clearing the input means
    // "no target", not zero.
    const updateExercise = (index: number, field: keyof ExerciseDraft, value: string | number | boolean | null) => {
        patchDraft({
            exercises: draft.exercises.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)),
        });
    };

    const handleCreatePlan = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (draft.exercises.length === 0) {
            return setError("You must add at least one exercise.");
        }
        if (draft.exercises.some((ex) => !ex.name || !ex.reps)) {
            return setError("All exercises must have a name and reps filled out.");
        }

        try {
            await api.post("/trainer/plans", {
                name: draft.name,
                description: draft.description,
                client_id: draft.client_id,
                exercises: draft.exercises,
            });

            // Only now is the work safe on the server, so this is the ONLY place the
            // draft gets thrown away. A failed publish below keeps everything.
            localStorage.removeItem(DRAFT_KEY);
            setForm({ draft: emptyDraft(), restoredFromDraft: false, handoffClientName: "" });

            setMessage(
                draft.client_id !== null
                    ? "Private plan assigned to your client! 🎉"
                    : "Workout plan published to the marketplace! 🎉"
            );

            await fetchPlans();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading plans...</div>;

    // id -> name, so a private plan can say WHO it is for instead of just "private".
    // A client who is no longer linked simply drops out and the badge falls back.
    const clientNames = new Map(clients.map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

    // The name for the banner: the live client list first, then whatever My Clients
    // handed over, so there is never a blank while the request is in flight.
    const targetClientName =
        draft.client_id !== null
            ? clientNames.get(draft.client_id) ?? (form.handoffClientName || "your client")
            : "";

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto h-full">
            {/* CREATE PLAN CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Create Workout Plan</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Build a new routine for your clients or the public.</p>

                {/* We picked up where they left off - say so, and offer a way out. */}
                {form.restoredFromDraft && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                            📝 Unsaved draft restored — pick up where you left off.
                        </p>
                        <button
                            type="button"
                            onClick={discardDraft}
                            className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900/80 px-3 py-2 rounded-lg transition-colors"
                        >
                            Discard draft
                        </button>
                    </div>
                )}

                {/*
                  Who this plan is being written for, stated loudly. The select below is
                  still the control, but a trainer who came from My Clients should never
                  have to go looking for confirmation that it worked.
                */}
                {draft.client_id !== null && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-4 rounded-xl mb-6 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                            🔒 Building a private plan for {targetClientName} — only they will see it.
                        </p>
                        <button
                            type="button"
                            onClick={() => patchDraft({ client_id: null })}
                            className="text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-900/80 px-3 py-2 rounded-lg transition-colors"
                        >
                            Make it public instead
                        </button>
                    </div>
                )}

                {message && <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6 font-bold text-sm border border-green-200 dark:border-green-800">{message}</div>}
                {error && <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-4 rounded-xl mb-6 font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}

                <form onSubmit={(e) => void handleCreatePlan(e)} className="flex flex-col gap-6">
                    {/*
                      VISIBILITY comes first: it decides who the plan is even for, which
                      changes how the trainer writes everything below it.
                    */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                            Visibility / Assignment
                        </label>
                        <select
                            value={draft.client_id ?? ""}
                            onChange={(e) => patchDraft({ client_id: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="">🌍 Public (Marketplace)</option>
                            {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    🔒 Private: {client.first_name} {client.last_name}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                            {draft.client_id === null
                                ? "Every member can find this plan in their Explore tab."
                                : "Only this client will see it, at the top of their Workout Center."}
                            {clients.length === 0 && " Accept a coaching request to unlock private plans."}
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Plan Name</label>
                            <input
                                type="text"
                                value={draft.name}
                                onChange={(e) => patchDraft({ name: e.target.value })}
                                required
                                placeholder="e.g. Upper Body Strength"
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                            />
                        </div>
                        <div className="w-full md:w-1/2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                            <input
                                type="text"
                                value={draft.description}
                                onChange={(e) => patchDraft({ description: e.target.value })}
                                placeholder="Focus on chest and back."
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* EXERCISES SECTION */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200">Exercises</h3>
                            <button
                                type="button"
                                onClick={addExercise}
                                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors"
                            >
                                + Add Exercise
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            {draft.exercises.map((ex, index) => (
                                <div key={index} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm relative transition-colors">
                                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">

                                    <div className="flex-1 w-full lg:min-w-[140px]">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Exercise Name</label>
                                        <input
                                            type="text"
                                            value={ex.name}
                                            onChange={(e) => updateExercise(index, "name", e.target.value)}
                                            required
                                            placeholder="e.g. Bench Press"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-20">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Sets</label>
                                        <input
                                            type="number"
                                            value={ex.sets}
                                            onChange={(e) => updateExercise(index, "sets", parseInt(e.target.value) || 1)}
                                            required
                                            min="1"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-24">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Reps</label>
                                        <input
                                            type="text"
                                            value={ex.reps}
                                            onChange={(e) => updateExercise(index, "reps", e.target.value)}
                                            required
                                            placeholder="8-10"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="w-full lg:w-24">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Rest (s)</label>
                                        <input
                                            type="number"
                                            value={ex.rest_time_seconds}
                                            onChange={(e) => updateExercise(index, "rest_time_seconds", parseInt(e.target.value) || 0)}
                                            required
                                            min="0"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>

                                    {/* WEIGHT TOGGLE CHECKBOX */}
                                    <div className="w-full lg:w-36 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800/50 transition-colors">
                                        <label className="text-xs font-bold text-blue-800 dark:text-blue-300 cursor-pointer select-none">
                                            Track Weight?
                                        </label>
                                        <input
                                            type="checkbox"
                                            checked={ex.requires_weight}
                                            onChange={(e) => updateExercise(index, "requires_weight", e.target.checked)}
                                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                        />
                                    </div>

                                    {/* REMOVE BUTTON */}
                                    <button
                                        type="button"
                                        onClick={() => removeExercise(index)}
                                        className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 p-3 rounded-xl transition-colors h-[46px] w-full lg:w-[46px] flex items-center justify-center font-bold"
                                        title="Remove Exercise"
                                    >
                                        ✕
                                    </button>
                                  </div>

                                  {/*
                                    LIVE WORKOUT SETUP: this is what makes the client's screen
                                    tap-only. The target pre-fills their first set and the step
                                    tells their "+" button how much this machine actually adds.
                                    Hidden for bodyweight exercises, where neither means anything.
                                  */}
                                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4">
                                    {ex.requires_weight && (
                                        <>
                                            <div className="w-full sm:w-32">
                                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Target (kg)</label>
                                                <input
                                                    type="number"
                                                    step="0.25"
                                                    min="0"
                                                    value={ex.recommended_weight_kg ?? ""}
                                                    onChange={(e) => updateExercise(index, "recommended_weight_kg", e.target.value === "" ? null : parseFloat(e.target.value))}
                                                    placeholder="Optional"
                                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                />
                                            </div>

                                            <div className="w-full sm:w-56">
                                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Weight Step</label>
                                                <select
                                                    value={ex.weight_step_kg}
                                                    onChange={(e) => updateExercise(index, "weight_step_kg", parseFloat(e.target.value))}
                                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                                                >
                                                    {WEIGHT_STEP_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    )}

                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Instructions</label>
                                        <input
                                            type="text"
                                            value={ex.instructions}
                                            onChange={(e) => updateExercise(index, "instructions", e.target.value)}
                                            placeholder="e.g. 3 sec negatives, elbows tucked"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                  </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-md text-lg mt-2">
                        Publish Workout Plan
                    </button>
                </form>
            </div>

            {/* MY PUBLISHED PLANS */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">My Published Plans</h2>
                {plans.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-900 p-8 rounded-2xl text-center border border-gray-200 dark:border-slate-800">
                        You haven't created any plans yet. Start building routines for your clients!
                    </p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {plans.map((plan) => (
                            <div key={plan.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200 flex flex-col justify-between">
                                <div className="mb-6">
                                    <div className="flex justify-between items-start gap-3 mb-1">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>

                                        {/* Who can actually see this plan */}
                                        {plan.client_id === null ? (
                                            <span className="shrink-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase px-2 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                                                🌍 Public
                                            </span>
                                        ) : (
                                            <span className="shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                                                🔒 {clientNames.get(plan.client_id) ?? "Private"}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 border border-gray-100 dark:border-slate-700/50">
                                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                                        Exercises ({plan.exercises.length})
                                    </p>
                                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                                        {plan.exercises.map((ex, i) => (
                                            <li key={i} className="border-b border-gray-200/50 dark:border-slate-700/50 last:border-0 pb-2 last:pb-0">
                                                <div className="flex justify-between items-center gap-2">
                                                    <span className="flex items-center gap-2 font-medium">
                                                        {ex.name}
                                                        {!ex.requires_weight && (
                                                            <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">
                                                                Bodyweight
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="text-gray-500 dark:text-gray-400 font-bold whitespace-nowrap">
                                                        {ex.sets} × {ex.reps}
                                                        {ex.requires_weight && ex.recommended_weight_kg !== null && (
                                                            <> @ {ex.recommended_weight_kg}kg</>
                                                        )}
                                                    </span>
                                                </div>

                                                {/* Confirmation of what the client will actually see on their phone */}
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    {ex.requires_weight && (
                                                        <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">
                                                            Step {ex.weight_step_kg}kg
                                                        </span>
                                                    )}
                                                    {ex.instructions && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                                                            💡 {ex.instructions}
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Turn any existing plan into a private one without retyping it */}
                                <button
                                    type="button"
                                    onClick={() => duplicatePlan(plan)}
                                    className="w-full mt-4 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 text-xs font-bold py-2.5 rounded-lg transition-colors"
                                >
                                    📋 Duplicate for a client
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}