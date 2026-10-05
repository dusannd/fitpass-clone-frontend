import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/axios.ts";
import { errorDetail } from "../../utils/errors";
import Avatar from "../../components/Avatar";
import MyTrainerChip from "../../components/MyTrainerChip";
import { parseGoals } from "../../utils/profile";
import { MY_SUBSCRIPTION_KEY, fetchMySubscription, planIncludesTrainer } from "../../utils/subscription";
import type { CoachingLink } from "../../utils/coaching";
import type { UserProfile } from "../../components/Layout";

interface Trainer {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    profile: UserProfile | null;
}

export default function MemberCoaching() {
    const queryClient = useQueryClient();

    const [successMsg, setSuccessMsg] = useState("");

    // --- 1. SERVER STATE ---
    // Same keys Workouts and MemberAppointments read, so the three pages share one
    // cache entry instead of each holding its own copy of who your trainer is. This
    // page used to fetch both in a useEffect, so a request sent here left the other
    // two showing the old list for the rest of the 30s staleTime.
    const trainersQuery = useQuery({
        queryKey: ["workouts", "trainers"],
        queryFn: async () => (await api.get<Trainer[]>("/workouts/trainers")).data,
    });

    // The coaching links themselves, so the header chip can name the trainer instead of
    // us keeping only their ids and asking the API for the same thing twice.
    const linksQuery = useQuery({
        queryKey: ["coaching", "my-trainers"],
        queryFn: async () => (await api.get<CoachingLink[]>("/coaching/my-trainers")).data,
    });

    // Personal training is a plan perk, so the page needs to know which plan the
    // member holds. Shares one request with the pricing page through the cache.
    const subQuery = useQuery({
        queryKey: MY_SUBSCRIPTION_KEY,
        queryFn: fetchMySubscription,
        retry: false,
    });

    // Gated on isPending, NOT isFetching: with isFetching this would flip to "upgrade
    // your plan" during every background refetch, in front of a member who is paying
    // for exactly this feature. Until the first response lands we assume nothing.
    const entitlementKnown = !subQuery.isPending;
    const canCoach = planIncludesTrainer(subQuery.data);

    // --- 2. SENDING A REQUEST ---
    const requestMutation = useMutation({
        mutationFn: async ({ trainerId }: { trainerId: number; trainerName: string }) => {
            await api.post(`/coaching/request/${trainerId}`);
        },
        onMutate: () => setSuccessMsg(""),
        onSuccess: async (_data, { trainerName }) => {
            setSuccessMsg(`Coaching request sent successfully to ${trainerName}!`);

            // Returned, so the mutation stays pending until the fresh links are in.
            // Otherwise the button would flash back to "Request Coaching" for the
            // length of one refetch and invite a second click. ["coaching"] also
            // refreshes the header chip on Workouts and MemberAppointments.
            await queryClient.invalidateQueries({ queryKey: ["coaching"] });
        },
    });

    // Shown as the server said it. This used to treat any "already exists" answer as
    // pending - including REJECTED, so a declined member was shown a request that did
    // not exist.
    const error = requestMutation.isError
        ? errorDetail(requestMutation.error, "Failed to send request.")
        : "";
    const loadingId = requestMutation.isPending ? requestMutation.variables.trainerId : null;

    // Separate from `error`, which is a failed coaching request. Gating the trainer
    // list on that would blank it whenever a request failed to send.
    const loadFailed = trainersQuery.isError || linksQuery.isError;

    if (trainersQuery.isPending || linksQuery.isPending) {
        return <div className="p-6 text-gray-500 dark:text-gray-400 font-bold">Loading trainers...</div>;
    }

    const trainers = trainersQuery.data ?? [];
    const links = linksQuery.data ?? [];

    // Derived from the links themselves, so there is a single source of truth for who is
    // pending and who accepted.
    const pendingIds = links.filter(l => l.status === "PENDING").map(l => l.trainer_id);
    const acceptedIds = links.filter(l => l.status === "ACCEPTED").map(l => l.trainer_id);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                        Find a Personal Trainer
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                        Browse our certified trainers and request 1-on-1 coaching.
                    </p>
                </div>

                {/* No empty state here - this page IS the "go find one" call to action */}
                <MyTrainerChip links={links} />
            </div>

            {/* UPGRADE PROMPT */}
            {/* Shown rather than hiding the page: a member who can't see WHY the
                buttons stopped working assumes the site is broken. Their existing
                trainers stay listed below either way. */}
            {entitlementKnown && !canCoach && (
                <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800/50 p-6 rounded-2xl mb-6 transition-colors">
                    <h2 className="font-black text-lg text-purple-900 dark:text-purple-300 mb-1">
                        Personal training isn't part of your membership
                    </h2>
                    <p className="text-sm text-purple-800 dark:text-purple-400 mb-4 leading-relaxed">
                        {subQuery.data
                            ? `Your ${subQuery.data.plan.name} plan doesn't include a personal trainer. Upgrade to a plan that does and you can book 1-on-1 sessions.`
                            : "You don't have an active membership yet. Pick a plan that includes a personal trainer to start booking 1-on-1 sessions."}
                    </p>
                    <Link
                        to="/subscriptions"
                        className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-black py-2.5 px-5 rounded-xl transition-all shadow-sm hover:shadow-md"
                    >
                        View Plans
                    </Link>
                </div>
            )}

            {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl mb-6 font-bold border border-emerald-200 dark:border-emerald-800 transition-colors">
                    ✅ {successMsg}
                </div>
            )}
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-4 rounded-xl mb-6 font-bold border border-rose-200 dark:border-rose-800 transition-colors">
                    ❌ {error}
                </div>
            )}

            {loadFailed ? (
                <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-6 rounded-2xl border border-rose-200 dark:border-rose-800 font-bold transition-colors">
                    The trainer list could not be loaded. Refresh the page to try again.
                </div>
            ) : trainers.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 transition-colors">
                    No trainers are currently available at this gym.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {trainers.map((trainer) => {
                        const isPending = pendingIds.includes(trainer.id);
                        const isAccepted = acceptedIds.includes(trainer.id);
                        const isCurrentlyLoading = loadingId === trainer.id;

                        // A trainer who said no can be asked again - unless it was the
                        // third "no" in a row, then retry_after holds the date.
                        const rejectedLink = links.find(l => l.trainer_id === trainer.id && l.status === "REJECTED");
                        const retryAfter = rejectedLink?.retry_after ? new Date(rejectedLink.retry_after) : null;
                        const retryDate = retryAfter?.toLocaleDateString([], { day: "numeric", month: "short" });

                        // For trainers we show the same fitness_goals field as "Specialties"
                        const specialties = parseGoals(trainer.profile?.fitness_goals);

                        // Ako te je trener već prihvatio, karta postaje zelena!
                        return (
                            <div
                                key={trainer.id}
                                className={`relative bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center text-center ring-1 transition-all duration-200 ${
                                    isAccepted
                                        ? "ring-emerald-300 dark:ring-emerald-700 shadow-lg shadow-emerald-500/10"
                                        : "ring-gray-200 dark:ring-slate-800 shadow-md shadow-slate-900/5 hover:shadow-xl hover:shadow-slate-900/10 hover:-translate-y-1 hover:ring-blue-300 dark:hover:ring-blue-800"
                                }`}
                            >
                                {/* Corner badge when the trainer is already yours */}
                                {isAccepted && (
                                    <span className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
                                        Your Trainer
                                    </span>
                                )}

                                <div className={`rounded-full mb-4 ring-4 ${
                                    isAccepted ? "ring-emerald-200 dark:ring-emerald-800" : "ring-blue-100 dark:ring-blue-900/50"
                                }`}>
                                    <Avatar profile={trainer.profile} firstName={trainer.first_name} size="lg" />
                                </div>

                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {trainer.first_name} {trainer.last_name}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{trainer.email}</p>

                                {/* SPECIALTIES */}
                                {specialties.length > 0 && (
                                    <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                                        {specialties.map((item, i) => (
                                            <span
                                                key={`${item}-${i}`}
                                                className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                            >
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* SHORT BIO SNIPPET */}
                                {trainer.profile?.bio ? (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 line-clamp-3 leading-relaxed">
                                        {trainer.profile.bio}
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-400 dark:text-gray-600 italic mt-4">
                                        No bio yet.
                                    </p>
                                )}

                                {/* mt-auto pushes the line and the button to the bottom, so all cards are the same height */}
                                <div className="w-full h-px bg-gray-200 dark:bg-slate-800 mt-auto mb-5"></div>

                                {rejectedLink && (
                                    <p className="w-full -mt-2 mb-3 text-xs font-bold text-rose-600 dark:text-rose-400">
                                        {retryAfter
                                            ? `Declined ${rejectedLink.rejection_count} times in a row - you can ask again on ${retryDate}.`
                                            : "Declined your last request - you can ask again."}
                                    </p>
                                )}

                                {/* The button only avoids showing a request that is certain
                                    to come back 403 - the real gate is the backend's. An
                                    accepted trainer keeps their green card either way. */}
                                <button
                                    disabled={isPending || isAccepted || isCurrentlyLoading || !canCoach || retryAfter !== null}
                                    onClick={() => requestMutation.mutate({ trainerId: trainer.id, trainerName: trainer.first_name })}
                                    className={`w-full font-black py-3 px-4 rounded-xl transition-all shadow-sm ${
                                        isAccepted
                                            ? "bg-emerald-500 text-white cursor-default" // Zeleno jer je tvoj aktuelni trener
                                            : isPending || !canCoach || retryAfter

                                                ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed" // Sivo jer se čeka
                                                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md" // Plavo za slanje
                                    }`}
                                >
                                    {isCurrentlyLoading
                                        ? "Sending..."
                                        : isAccepted
                                            ? "Your Trainer 🟢"
                                            : isPending
                                                ? "Request Pending ⏳"
                                                : !canCoach
                                                    ? "Requires an upgrade 🔒"
                                                    : retryAfter
                                                        ? `Ask again on ${retryDate}`
                                                        : rejectedLink
                                                            ? "Ask again"
                                                            : "Request Coaching"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
