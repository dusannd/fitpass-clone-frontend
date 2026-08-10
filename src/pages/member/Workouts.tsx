import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { api } from "../../api/axios";
import { ProgressCard } from "../../components/ProgressCard";
import LiveWorkoutModal from "../../components/LiveWorkoutModal";
import SessionDetailModal from "../../components/SessionDetailModal";
import Avatar from "../../components/Avatar";
import { parseGoals } from "../../utils/profile";
import type { UserProfile } from "../../components/Layout";
import { groupLogsByExercise, type WorkoutPlan, type WorkoutSession } from "../../utils/workout";

// --- INTERFACES ---
// Same shape as the trainer cards on the Find a Trainer page.
interface Trainer {
    id: number;
    first_name: string;
    last_name: string;
    profile: UserProfile | null;
}

// What the undo bar needs to put a plan back where it came from.
interface RemovedPlan {
    plan: WorkoutPlan;
    type: PlanCardType;
}

// The three flavours a plan card can take. They share one shell and differ only in the
// accent, the badge and the call to action.
type PlanCardType = "explore" | "my_plan" | "assigned";

// --- CARD VARIANT LOOKUPS ---
// Kept next to each other so the visual language stays cohesive: change a colour here and
// every card of that type follows, instead of hunting through branched JSX.
const CARD_SHELL: Record<PlanCardType, string> = {
    assigned: "border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/25 dark:to-slate-900",
    my_plan: "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900",
    explore: "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900",
};

// The left stripe is what tells the three types apart at a glance while scanning the grid.
const CARD_STRIPE: Record<PlanCardType, string> = {
    assigned: "bg-gradient-to-b from-emerald-500 to-blue-500",
    my_plan: "bg-blue-500",
    explore: "bg-gray-200 dark:bg-slate-700",
};

const CARD_BADGE: Record<PlanCardType, { label: string; className: string }> = {
    assigned: {
        label: "🎯 Trainer Assigned",
        className: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    },
    my_plan: {
        label: "Saved",
        className: "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700",
    },
    explore: {
        label: "Public 🔵",
        className: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    },
};

export default function Workouts() {
    // --- STATE ---
    const [activeTab, setActiveTab] = useState<"explore" | "my_plans" | "history">("my_plans");
    const [loading, setLoading] = useState(true);

    const [savedPlans, setSavedPlans] = useState<WorkoutPlan[]>([]);
    const [privatePlans, setPrivatePlans] = useState<WorkoutPlan[]>([]);
    const [history, setHistory] = useState<WorkoutSession[]>([]);

    // --- EXPLORE (LAZY) ---
    // We hold the trainer list, and each trainer's plans only once somebody asks for
    // them. A key present in trainerPlans means "already fetched", which is what stops
    // a second expand from hitting the network again.
    const [trainers, setTrainers] = useState<Trainer[]>([]);
    const [trainerPlans, setTrainerPlans] = useState<Record<number, WorkoutPlan[]>>({});
    const [expandedTrainers, setExpandedTrainers] = useState<number[]>([]);
    const [loadingTrainerId, setLoadingTrainerId] = useState<number | null>(null);
    const [trainerErrors, setTrainerErrors] = useState<Record<number, string>>({});

    // Modal state
    const [activeWorkout, setActiveWorkout] = useState<WorkoutPlan | null>(null);
    const [detailSession, setDetailSession] = useState<WorkoutSession | null>(null);

    // The last plan removed, so an accidental tap is one click away from being undone.
    const [removedPlan, setRemovedPlan] = useState<RemovedPlan | null>(null);

    // --- DATA FETCHING ---
    /**
     * Everything the page needs to render itself, and nothing more.
     *
     * The trainers' plans are deliberately NOT fetched here. This used to walk the
     * trainer list and fire one request per trainer, so opening the page - or any
     * refresh after following or removing a plan - hit the API once per trainer in the
     * gym. Those now load one at a time, only when a member opens that trainer's card.
     */
    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            // Four independent reads, so they travel together instead of in a queue.
            const [histRes, savedRes, privateRes, trainersRes] = await Promise.all([
                api.get<WorkoutSession[]>("/workouts/history"),
                api.get<WorkoutPlan[]>("/workouts/my-plans"),
                api.get<WorkoutPlan[]>("/workouts/my-private-plans"),
                api.get<Trainer[]>("/workouts/trainers"),
            ]);

            setHistory(histRes.data);
            setSavedPlans(savedRes.data);
            setPrivatePlans(privateRes.data);
            setTrainers(trainersRes.data);
        } catch (err) {
            console.error("Failed to load workout data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAllData();
    }, [fetchAllData]);

    // --- EXPLORE: ONE TRAINER AT A TIME ---
    const loadTrainerPlans = async (trainerId: number) => {
        setLoadingTrainerId(trainerId);
        setTrainerErrors((prev) => ({ ...prev, [trainerId]: "" }));

        try {
            const res = await api.get<WorkoutPlan[]>(`/workouts/trainers/${trainerId}/plans`);
            setTrainerPlans((prev) => ({ ...prev, [trainerId]: res.data }));
        } catch {
            setTrainerErrors((prev) => ({ ...prev, [trainerId]: "Couldn't load these plans. Try again." }));
        } finally {
            setLoadingTrainerId(null);
        }
    };

    const toggleTrainer = (trainerId: number) => {
        const isOpen = expandedTrainers.includes(trainerId);
        setExpandedTrainers((prev) => (isOpen ? prev.filter((id) => id !== trainerId) : [...prev, trainerId]));

        // Fetch on the FIRST open only. Collapsing and reopening reuses what we already
        // have, and a card mid-request is not asked twice.
        const alreadyFetched = trainerId in trainerPlans;
        if (!isOpen && !alreadyFetched && loadingTrainerId !== trainerId) {
            void loadTrainerPlans(trainerId);
        }
    };

    // --- ACTIONS ---
    const handleFollowPlan = async (planId: number) => {
        try {
            await api.post(`/workouts/${planId}/follow`);
            await fetchAllData();
            setActiveTab("my_plans");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                window.alert(err.response?.data?.detail || "Failed to follow plan.");
            }
        }
    };

    /**
     * Takes a plan out of the member's library.
     *
     * The two card types mean different things on the server: a saved plan is simply
     * unfollowed, while an assigned one is only hidden - it belongs to the trainer, who
     * keeps their copy no matter what the member does here.
     */
    const removePlan = async (plan: WorkoutPlan, type: PlanCardType) => {
        try {
            if (type === "assigned") await api.post(`/workouts/${plan.id}/dismiss`);
            else await api.delete(`/workouts/${plan.id}/follow`);

            setRemovedPlan({ plan, type });
            await fetchAllData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                window.alert(err.response?.data?.detail || "Failed to remove plan.");
            }
        }
    };

    // Exact inverse of removePlan, driven by the undo bar.
    const undoRemove = async () => {
        if (!removedPlan) return;
        const { plan, type } = removedPlan;

        try {
            if (type === "assigned") await api.delete(`/workouts/${plan.id}/dismiss`);
            else await api.post(`/workouts/${plan.id}/follow`);

            setRemovedPlan(null);
            await fetchAllData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                window.alert(err.response?.data?.detail || "Failed to restore plan.");
            }
        }
    };

    // The modal owns the logging itself, we only refresh and switch to the history tab.
    const handleWorkoutSaved = async () => {
        setActiveWorkout(null);
        await fetchAllData();
        setActiveTab("history");
    };

    // --- RENDER HELPERS ---
    // Every plan on the page goes through here, assigned ones included. They are ordinary
    // cards that happen to wear an emerald accent, not a separate widget.
    const renderPlanCard = (plan: WorkoutPlan, type: PlanCardType) => {
        const badge = CARD_BADGE[type];

        return (
            <div
                key={plan.id}
                className={`relative overflow-hidden border rounded-2xl p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col justify-between ${CARD_SHELL[type]}`}
            >
                {/* Accent stripe: the one element that makes the card type readable at a glance */}
                <div className={`absolute inset-y-0 left-0 w-1.5 ${CARD_STRIPE[type]}`}></div>

                <div className="pl-2">
                    <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{plan.name}</h3>
                        <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${badge.className}`}>
                            {badge.label}
                        </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.description}</p>

                    <div className="bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50 mb-6">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Exercises ({plan.exercises.length})</p>
                        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
                            {plan.exercises.slice(0, 3).map((ex) => (
                                <li key={ex.id} className="flex justify-between gap-3">
                                    <span className="truncate">{ex.name}</span>
                                    <span className="text-gray-500 shrink-0">{ex.sets}x{ex.reps}</span>
                                </li>
                            ))}
                            {plan.exercises.length > 3 && (
                                <li className="text-xs text-blue-500 font-bold pt-1">+{plan.exercises.length - 3} more...</li>
                            )}
                        </ul>
                    </div>
                </div>

                <div className="pl-2">
                    {type === "explore" ? (
                        <button
                            onClick={() => void handleFollowPlan(plan.id)}
                            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-900 dark:text-white font-bold py-2.5 rounded-xl transition-colors"
                        >
                            Save & Follow Plan
                        </button>
                    ) : (
                        // Only plans already in the library can be removed, so Explore keeps
                        // a single full width button.
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveWorkout(plan)}
                                className={`flex-1 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.99] touch-manipulation ${
                                    type === "assigned"
                                        ? "bg-emerald-600 hover:bg-emerald-700"
                                        : "bg-blue-600 hover:bg-blue-700"
                                }`}
                            >
                                Start Workout 🚀
                            </button>
                            <button
                                onClick={() => void removePlan(plan, type)}
                                title={type === "assigned" ? "Hide this plan" : "Remove from My Plans"}
                                aria-label={type === "assigned" ? `Hide ${plan.name}` : `Remove ${plan.name} from My Plans`}
                                className="shrink-0 w-11 bg-gray-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 font-bold rounded-xl transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- MY PLANS LIBRARY ---
    // Assigned plans lead: what a trainer built for you outranks anything you saved
    // yourself. The id filter is cheap insurance - the two endpoints should never return
    // the same plan, but if they ever did React would warn about duplicate keys and the
    // plan would be drawn twice.
    const myPlans = useMemo(() => {
        const assignedIds = new Set(privatePlans.map(p => p.id));
        return [
            ...privatePlans.map(plan => ({ plan, type: "assigned" as const })),
            ...savedPlans
                .filter(p => !assignedIds.has(p.id))
                .map(plan => ({ plan, type: "my_plan" as const })),
        ];
    }, [privatePlans, savedPlans]);

    // Sessions only store plan_id, but we already hold every plan the member can see, so
    // the detail modal can name the plan without an extra request. A plan that was since
    // deleted simply falls out and the modal shows the date alone.
    const planNames = useMemo(() => {
        const names = new Map<number, string>();
        // Explore plans only contribute once their trainer has been opened - a session
        // whose plan we cannot name simply falls back to its date.
        [...privatePlans, ...savedPlans, ...Object.values(trainerPlans).flat()]
            .forEach(p => names.set(p.id, p.name));
        return names;
    }, [privatePlans, savedPlans, trainerPlans]);

    if (loading) return <div className="p-6 text-gray-500 font-bold">Loading workouts...</div>;

    const savedPlanIds = savedPlans.map(p => p.id);

    return (
        <div className="max-w-6xl mx-auto flex flex-col h-full">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Workout Center
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Find plans, crush your sets, and track your progress.
                </p>
            </div>

            {/*
              UNDO BAR
              Removing a plan is one tap, so putting it back has to be one tap too. This is
              why there is no confirm dialog in the way of every removal.
            */}
            {removedPlan && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-slate-900 dark:bg-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-lg">
                    <p className="text-sm font-bold">
                        Removed <span className="text-blue-300">{removedPlan.plan.name}</span>
                        {removedPlan.type === "assigned" && " from your view"}.
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void undoRemove()}
                            className="bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-wide px-4 py-2 rounded-lg transition-colors"
                        >
                            Undo
                        </button>
                        <button
                            onClick={() => setRemovedPlan(null)}
                            aria-label="Dismiss"
                            className="text-white/50 hover:text-white px-2 font-bold transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* TABS NAVIGATION */}
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-900 rounded-2xl w-full sm:w-fit mb-8 border border-gray-200 dark:border-slate-800 transition-colors">
                <button
                    onClick={() => setActiveTab("my_plans")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "my_plans" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    📁 My Plans
                </button>
                <button
                    onClick={() => setActiveTab("explore")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "explore" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    🏋️ Explore
                </button>
                <button
                    onClick={() => setActiveTab("history")}
                    className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "history" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
                >
                    📈 History
                </button>
            </div>

            {/* TAB CONTENT: MY PLANS */}
            {activeTab === "my_plans" && (
                <div>
                    {/* The member's whole library in one grid: assigned plans first, then saved ones. */}
                    {myPlans.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-gray-200 dark:border-slate-800 text-center transition-colors">
                            <span className="text-4xl mb-4 block">🏃‍♂️</span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No plans yet</h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't saved any plans yet. Go to Explore or ask your trainer!</p>
                            <button onClick={() => setActiveTab("explore")} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Go to Explore</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {myPlans.map(({ plan, type }) => renderPlanCard(plan, type))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: EXPLORE */}
            {/*
              Browse by trainer, not by one big pile of plans. Each card asks the API for
              its own plans the first time it is opened, so landing on this tab costs a
              single request no matter how many trainers the gym employs.
            */}
            {activeTab === "explore" && (
                <div>
                    {trainers.length === 0 ? (
                        <div className="bg-gray-50 dark:bg-slate-900/50 p-8 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 text-center text-gray-500 transition-colors">
                            No trainers have published plans yet.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {trainers.map((trainer) => {
                                const isOpen = expandedTrainers.includes(trainer.id);
                                const isLoading = loadingTrainerId === trainer.id;
                                const error = trainerErrors[trainer.id];
                                const fetched = trainerPlans[trainer.id];
                                const specialties = parseGoals(trainer.profile?.fitness_goals);

                                // Plans the member already follows live in My Plans, so they
                                // drop out here instead of offering a second Save button.
                                const available = fetched?.filter(p => !savedPlanIds.includes(p.id));

                                return (
                                    <div
                                        key={trainer.id}
                                        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-colors"
                                    >
                                        {/* TRAINER HEADER (always visible, costs nothing) */}
                                        <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                            <Avatar profile={trainer.profile} firstName={trainer.first_name} size="md" />

                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                                    {trainer.first_name} {trainer.last_name}
                                                </h3>
                                                {trainer.profile?.bio ? (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                                                        {trainer.profile.bio}
                                                    </p>
                                                ) : (
                                                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">No bio yet.</p>
                                                )}

                                                {specialties.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {specialties.map((s, i) => (
                                                            <span
                                                                key={`${s}-${i}`}
                                                                className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                                            >
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => toggleTrainer(trainer.id)}
                                                aria-expanded={isOpen}
                                                disabled={isLoading}
                                                className="shrink-0 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-900 dark:text-white text-sm font-bold py-2.5 px-5 rounded-xl transition-colors disabled:opacity-60"
                                            >
                                                {isLoading ? "Loading…" : isOpen ? "Hide Plans ▴" : "View Plans ▾"}
                                            </button>
                                        </div>

                                        {/* PLANS (only ever rendered after an explicit click) */}
                                        {isOpen && (
                                            <div className="border-t border-gray-200 dark:border-slate-800 p-5 bg-gray-50/60 dark:bg-slate-800/30">
                                                {isLoading ? (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold">Loading plans…</p>
                                                ) : error ? (
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
                                                        <button
                                                            onClick={() => void loadTrainerPlans(trainer.id)}
                                                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            Retry
                                                        </button>
                                                    </div>
                                                ) : available && available.length > 0 ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        {available.map(p => renderPlanCard(p, "explore"))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {fetched && fetched.length > 0
                                                            ? "You already follow every plan from this trainer."
                                                            : "This trainer hasn't published any public plans yet."}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: HISTORY & PROGRESS */}
            {activeTab === "history" && (
                <div className="flex flex-col gap-8">
                    <ProgressCard sessions={history} />

                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Past Sessions</h2>
                        {history.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-500 text-center transition-colors">
                                You haven't logged any workouts yet.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {history.map(session => {
                                    const exercises = groupLogsByExercise(session.exercise_logs);

                                    return (
                                        // The whole card opens the full set by set record, since the
                                        // tiles below can only ever show a summary.
                                        <div
                                            key={session.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setDetailSession(session)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setDetailSession(session);
                                                }
                                            }}
                                            className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="font-bold text-gray-900 dark:text-white">
                                                    {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                                                        {exercises.length} {exercises.length === 1 ? "Exercise" : "Exercises"}
                                                    </span>
                                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                                        View details →
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {exercises.map(group => (
                                                    <div key={group.key} className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={group.name}>
                                                            {group.name}
                                                        </p>
                                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-black mt-0.5">
                                                            {group.sets.length} {group.sets.length === 1 ? "set" : "sets"}
                                                            {group.topWeight !== null ? ` · top ${group.topWeight} kg` : " · bodyweight"}
                                                        </p>

                                                        {/* The set by set breakdown, which is the whole point of per-set rows */}
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {group.sets.map(set => (
                                                                <span
                                                                    key={set.id}
                                                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400"
                                                                >
                                                                    {set.weight_kg !== null ? `${set.weight_kg}×${set.reps_completed}` : `${set.reps_completed} reps`}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {session.notes && (
                                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800 text-sm text-gray-500 dark:text-gray-400 italic">
                                                    "{session.notes}"
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- LIVE WORKOUT MODAL --- */}
            {/* key= remounts the modal per plan, so the set grid is always rebuilt fresh */}
            {activeWorkout && (
                <LiveWorkoutModal
                    key={activeWorkout.id}
                    plan={activeWorkout}
                    onClose={() => setActiveWorkout(null)}
                    onSaved={() => void handleWorkoutSaved()}
                />
            )}

            {/* --- PAST SESSION DETAIL (read only) --- */}
            {detailSession && (
                <SessionDetailModal
                    session={detailSession}
                    planName={detailSession.plan_id !== null ? planNames.get(detailSession.plan_id) ?? null : null}
                    onClose={() => setDetailSession(null)}
                />
            )}
        </div>
    );
}