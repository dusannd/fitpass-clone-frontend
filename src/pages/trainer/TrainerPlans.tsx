import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import { WORKOUT_DRAFT_KEY as DRAFT_KEY } from "../../utils/storage";
import { WEIGHT_STEP_OPTIONS, DEFAULT_WEIGHT_STEP } from "../../utils/workout";
import ConfirmModal from "../../components/ConfirmModal";

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
// The key itself lives in utils/storage so logout can clear it.

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

// One pending confirmation. Both cases on this page put the work they want done into
// `run`, so a single dialog instance covers them.
interface PendingConfirm {
    title: string;
    message: string;
    confirmText: string;
    run: () => void;
}

// What "📋 Assign Plan" on the My Clients page hands over through the router.
interface AssignHandoff {
    assignToClientId?: number;
    assignToClientName?: string;
}

export default function TrainerPlans() {
    const location = useLocation();
    const navigate = useNavigate();

    const queryClient = useQueryClient();

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
    const [validationError, setValidationError] = useState("");

    // null means no dialog is on screen. Set it to open one.
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    const plansQuery = useQuery({
        queryKey: ["trainer", "plans"],
        queryFn: async () => (await api.get<WorkoutPlan[]>("/trainer/plans")).data,
    });

    // Deliberately its own query, not a Promise.all partner: the client list only feeds
    // the assignment dropdown and must not be able to take the form down with it - a
    // trainer with no clients still publishes. Same key as My Clients uses for the same
    // endpoint, so the two screens share one cached copy.
    const clientsQuery = useQuery({
        queryKey: ["trainer", "clients"],
        queryFn: async () => (await api.get<CoachingLink[]>("/coaching/clients")).data,
    });

    const plans = plansQuery.data ?? [];
    const clients: ClientInfo[] = (clientsQuery.data ?? []).map((link) => link.client);

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
     * The banner's "Discard draft" button. Throwing away a half built plan cannot be
     * undone - the effect above wipes localStorage the moment the form goes pristine -
     * so it asks first. A pristine draft has nothing to lose, so it just goes.
     */
    const requestDiscardDraft = () => {
        if (isPristine(draft)) {
            discardDraft();
            return;
        }

        setPendingConfirm({
            title: "Discard this draft?",
            message: "Everything you have typed into the builder is deleted. This cannot be undone.",
            confirmText: "Discard it",
            run: discardDraft,
        });
    };

    /**
     * Loads an existing plan back into the builder so it can be published again for a
     * specific client. Nothing is sent yet - the trainer picks the client and hits
     * Publish, which is the same POST as always, so no new endpoint is involved.
     */
    const duplicatePlan = (plan: WorkoutPlan) => {
        // Nothing to lose in an untouched builder, so skip the dialog entirely.
        if (isPristine(draft)) {
            applyDuplicate(plan);
            return;
        }

        setPendingConfirm({
            title: "Replace what you are building?",
            message: `The builder currently holds unsaved work. Copying "${plan.name}" into it overwrites that.`,
            confirmText: "Replace it",
            run: () => applyDuplicate(plan),
        });
    };

    // The copy itself, once there is nothing left to ask about.
    const applyDuplicate = (plan: WorkoutPlan) => {
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

        setValidationError("");
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

    // The publish itself.
    const createPlan = useMutation({
        mutationFn: async () => {
            await api.post("/trainer/plans", {
                name: draft.name,
                description: draft.description,
                client_id: draft.client_id,
                exercises: draft.exercises,
            });
            return draft.client_id;
        },
        onSuccess: async (clientId) => {
            // Only now is the work safe on the server, so this is the ONLY place the
            // draft gets thrown away. A failed publish keeps everything.
            localStorage.removeItem(DRAFT_KEY);
            setForm({ draft: emptyDraft(), restoredFromDraft: false, handoffClientName: "" });

            setMessage(
                clientId !== null
                    ? "Private plan assigned to your client! 🎉"
                    : "Workout plan published to the marketplace! 🎉"
            );

            await queryClient.invalidateQueries({ queryKey: ["trainer"] });
        },
    });

    // Validation stays outside the mutation - it never talks to the server, and routing
    // it through mutate() would only make the failure path harder to follow.
    const handleCreatePlan = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setValidationError("");
        setMessage("");

        if (draft.exercises.length === 0) {
            return setValidationError("You must add at least one exercise.");
        }
        if (draft.exercises.some((ex) => !ex.name || !ex.reps)) {
            return setValidationError("All exercises must have a name and reps filled out.");
        }

        createPlan.mutate();
    };

    // Shown above the publish button so the trainer can sanity-check the size of the
    // session without counting ten cards by hand.
    const totalSets = draft.exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);

    // One banner, three sources. A form validation message wins - the trainer typed
    // something wrong and that is the thing to fix first.
    const error = validationError
        ? validationError
        : plansQuery.error
          ? "Failed to load your workout plans."
          : createPlan.error
            ? errorDetail(createPlan.error, "Failed to create plan.")
            : "";

    if (plansQuery.isPending) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading plans...</div>;
    }

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
        <div className="flex flex-col gap-8 max-w-6xl mx-auto h-full">
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
                            onClick={requestDiscardDraft}
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

                <form onSubmit={handleCreatePlan} className="flex flex-col gap-6">
                    {/*
                      VISIBILITY comes first: it decides who the plan is even for, which
                      changes how the trainer writes everything below it.
                    */}
                    <div>
                        <label htmlFor="plan-visibility" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                            Visibility / Assignment
                        </label>
                        <select
                            id="plan-visibility"
                            value={draft.client_id ?? ""}
                            onChange={(e) => patchDraft({ client_id: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
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

                    {/* Name and description used to sit side by side at half width each,
                        which is why a one-line description was clipped after about forty
                        characters. They are stacked now, and the description is a textarea
                        because it is prose - the marketplace card renders all of it. */}
                    <div>
                        <label htmlFor="plan-name" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Plan Name</label>
                        <input
                            id="plan-name"
                            type="text"
                            value={draft.name}
                            onChange={(e) => patchDraft({ name: e.target.value })}
                            required
                            placeholder="e.g. Push Workout - Chest, Shoulders & Triceps"
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label htmlFor="plan-description" className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                        <textarea
                            id="plan-description"
                            rows={3}
                            value={draft.description}
                            onChange={(e) => patchDraft({ description: e.target.value })}
                            placeholder="Complete upper body push session focusing on chest, shoulders and triceps."
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all resize-y"
                        />
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
                                <div key={index} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">

                                  {/* --- CARD HEADER ---------------------------------------
                                      Two exercise cards used to be visually identical, so a
                                      trainer scrolling a ten-exercise plan had no way to tell
                                      where they were. The number is the whole fix. */}
                                  <div className="flex items-center justify-between gap-3 mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-black tabular-nums">
                                            {index + 1}
                                        </span>
                                        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                            Exercise {index + 1}
                                        </h4>
                                    </div>
                                    {/* A ghost button until you reach for it. The old solid rose
                                        block was visually heavier than the content it deletes. */}
                                    <button
                                        type="button"
                                        onClick={() => removeExercise(index)}
                                        className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                                        aria-label={`Remove exercise ${index + 1}`}
                                        title="Remove exercise"
                                    >
                                        ✕
                                    </button>
                                  </div>

                                  {/* --- NAME: ITS OWN FULL ROW ----------------------------
                                      This is the one field with unbounded content, and it used
                                      to be the most cramped: four fixed-width neighbours and a
                                      checkbox ate ~460px of the row before it got anything, so
                                      "Barbell Bench Press" was clipped mid-word.

                                      Every field in this card is repeated once per exercise, so
                                      the ids carry the row index - the same index the update
                                      handlers already key on. Two rows must never share an id. */}
                                  <div className="mb-4">
                                    <label htmlFor={`ex-${index}-name`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Exercise Name</label>
                                    <input
                                        id={`ex-${index}-name`}
                                        type="text"
                                        value={ex.name}
                                        onChange={(e) => updateExercise(index, "name", e.target.value)}
                                        required
                                        placeholder="e.g. Barbell Bench Press"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    />
                                  </div>

                                  {/* --- THE NUMBERS ---------------------------------------
                                      A grid, not fixed widths: these three share the row
                                      proportionally instead of squeezing whatever is next
                                      to them. */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label htmlFor={`ex-${index}-sets`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Sets</label>
                                        <input
                                            id={`ex-${index}-sets`}
                                            type="number"
                                            value={ex.sets}
                                            onChange={(e) => updateExercise(index, "sets", parseInt(e.target.value) || 1)}
                                            required
                                            min="1"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`ex-${index}-reps`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Reps</label>
                                        <input
                                            id={`ex-${index}-reps`}
                                            type="text"
                                            value={ex.reps}
                                            onChange={(e) => updateExercise(index, "reps", e.target.value)}
                                            required
                                            placeholder="8-10"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`ex-${index}-rest`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Rest (s)</label>
                                        <input
                                            id={`ex-${index}-rest`}
                                            type="number"
                                            value={ex.rest_time_seconds}
                                            onChange={(e) => updateExercise(index, "rest_time_seconds", parseInt(e.target.value) || 0)}
                                            required
                                            min="0"
                                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        />
                                    </div>

                                    {/* Still a real checkbox with a bound label - a styled
                                        button would read as pressed/unpressed to nobody using
                                        a screen reader. Only the look changed. */}
                                    <label
                                        htmlFor={`ex-${index}-weight`}
                                        className="col-span-2 sm:col-span-1 flex items-center gap-2.5 cursor-pointer select-none bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 px-4 py-3 rounded-xl transition-colors"
                                    >
                                        <input
                                            id={`ex-${index}-weight`}
                                            type="checkbox"
                                            checked={ex.requires_weight}
                                            onChange={(e) => updateExercise(index, "requires_weight", e.target.checked)}
                                            className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                                        />
                                        <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                                            Track weight
                                        </span>
                                    </label>
                                  </div>

                                  {/*
                                    LIVE WORKOUT SETUP: this is what makes the client's screen
                                    tap-only. The target pre-fills their first set and the step
                                    tells their "+" button how much this machine actually adds.
                                    Hidden for bodyweight exercises, where neither means anything.

                                    It sits in its own tinted panel so that toggling the checkbox
                                    reveals a block instead of reflowing the row above it.
                                  */}
                                  {ex.requires_weight && (
                                    <div className="mt-4 p-4 bg-blue-50/60 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/40 rounded-2xl transition-colors">
                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <div className="w-full sm:w-36">
                                                <label htmlFor={`ex-${index}-target`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Target (kg)</label>
                                                <input
                                                    id={`ex-${index}-target`}
                                                    type="number"
                                                    step="0.25"
                                                    min="0"
                                                    value={ex.recommended_weight_kg ?? ""}
                                                    onChange={(e) => updateExercise(index, "recommended_weight_kg", e.target.value === "" ? null : parseFloat(e.target.value))}
                                                    placeholder="Optional"
                                                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                />
                                            </div>

                                            <div className="flex-1">
                                                <label htmlFor={`ex-${index}-step`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Weight Step</label>
                                                <select
                                                    id={`ex-${index}-step`}
                                                    value={ex.weight_step_kg}
                                                    onChange={(e) => updateExercise(index, "weight_step_kg", parseFloat(e.target.value))}
                                                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                                                >
                                                    {WEIGHT_STEP_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                                    How much this machine actually adds per tap. For dumbbells this is per dumbbell, not the pair.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                  )}

                                  <div className="mt-4">
                                    <label htmlFor={`ex-${index}-instructions`} className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Instructions</label>
                                    <textarea
                                        id={`ex-${index}-instructions`}
                                        rows={2}
                                        value={ex.instructions}
                                        onChange={(e) => updateExercise(index, "instructions", e.target.value)}
                                        placeholder="e.g. 3 sec negatives, elbows tucked"
                                        className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-y"
                                    />
                                  </div>
                                </div>
                            ))}

                            {/* Removing the last exercise used to leave a blank panel, and the
                                only feedback was a validation banner at submit time. */}
                            {draft.exercises.length === 0 && (
                                <div className="text-center py-10 px-4 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-2xl">
                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No exercises yet</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">A plan needs at least one before you can publish it.</p>
                                    <button
                                        type="button"
                                        onClick={addExercise}
                                        className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-400 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors"
                                    >
                                        + Add your first exercise
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* The size of the thing about to be published, before publishing it.
                        Counting sets by hand across ten cards is not something anyone does. */}
                    {draft.exercises.length > 0 && (
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 text-center">
                            {draft.exercises.length} {draft.exercises.length === 1 ? "exercise" : "exercises"}
                            {" · "}
                            {totalSets} {totalSets === 1 ? "set" : "sets"} total
                        </p>
                    )}

                    {/* isPending was computed and never used, so a double click published
                        the plan twice. */}
                    <button
                        type="submit"
                        disabled={createPlan.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl transition-all shadow-md text-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {createPlan.isPending ? "Publishing..." : "Publish Workout Plan"}
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

            {/* --- CONFIRMATION DIALOG --- */}
            {/* Shared by "Discard draft" and "Duplicate for a client": whichever ran
                last left its copy and its callback in pendingConfirm. */}
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