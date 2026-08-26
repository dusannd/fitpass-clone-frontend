import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
    const [trainers, setTrainers] = useState<Trainer[]>([]);

    // The coaching links themselves, so the header chip can name the trainer instead of
    // us keeping only their ids and asking the API for the same thing twice.
    const [links, setLinks] = useState<CoachingLink[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [loadingId, setLoadingId] = useState<number | null>(null);

    // Personal training is a plan perk, so the page needs to know which plan the
    // member holds. useQuery rather than the useEffect below because that pattern is
    // only still here in the pages that haven't been migrated yet - new fetches use
    // the query cache, which is also how this shares one request with the pricing page.
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

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Odjednom vučemo sve trenere i status naših zahteva
                const [trainersRes, myLinksRes] = await Promise.all([
                    api.get<Trainer[]>("/workouts/trainers"),
                    api.get<CoachingLink[]>("/coaching/my-trainers") // <-- ONA NOVA BACKEND RUTA!
                ]);

                setTrainers(trainersRes.data);
                setLinks(myLinksRes.data);

            } catch (err) {
                setError("Failed to load trainers.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        void fetchInitialData();
    }, []);

    /**
     * Marks a trainer as pending locally, so the card and the header chip both update the
     * moment the request goes through instead of after a refetch. The link gets a negative
     * id because it is a placeholder: the real row arrives on the next page load.
     */
    const addPendingLink = (trainerId: number) => {
        setLinks((prev) => {
            if (prev.some((l) => l.trainer_id === trainerId)) return prev;

            const trainer = trainers.find((t) => t.id === trainerId);

            return [...prev, {
                id: -trainerId,
                trainer_id: trainerId,
                // Not known on this page and nothing reads it, so it stays at 0 until the
                // server's own copy of this link replaces the placeholder.
                client_id: 0,
                status: "PENDING",
                created_at: new Date().toISOString(),
                trainer: trainer
                    ? {
                        id: trainer.id,
                        first_name: trainer.first_name,
                        last_name: trainer.last_name,
                        email: trainer.email,
                        profile: trainer.profile,
                    }
                    : null,
                client: null,
            }];
        });
    };

    const handleSendRequest = async (trainerId: number, trainerName: string) => {
        setError("");
        setSuccessMsg("");
        setLoadingId(trainerId);

        try {
            await api.post(`/coaching/request/${trainerId}`);
            setSuccessMsg(`Coaching request sent successfully to ${trainerName}!`);

            // Ubaci ID u PENDING niz čim prođe
            addPendingLink(trainerId);

        } catch (err: unknown) {
            const errorMsg = errorDetail(err, "Failed to send request.");
            if (errorMsg.includes("already exists")) {
                addPendingLink(trainerId);
                setError(`You already have a pending or active request with ${trainerName}.`);
            } else {
                setError(errorMsg);
            }
        } finally {
            setLoadingId(null);
        }
    };

    if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400 font-bold">Loading trainers...</div>;

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

            {trainers.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 transition-colors">
                    No trainers are currently available at this gym.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {trainers.map((trainer) => {
                        const isPending = pendingIds.includes(trainer.id);
                        const isAccepted = acceptedIds.includes(trainer.id);
                        const isCurrentlyLoading = loadingId === trainer.id;

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

                                {/* The button only avoids showing a request that is certain
                                    to come back 403 - the real gate is the backend's. An
                                    accepted trainer keeps their green card either way. */}
                                <button
                                    disabled={isPending || isAccepted || isCurrentlyLoading || !canCoach}
                                    onClick={() => void handleSendRequest(trainer.id, `${trainer.first_name}`)}
                                    className={`w-full font-black py-3 px-4 rounded-xl transition-all shadow-sm ${
                                        isAccepted
                                            ? "bg-emerald-500 text-white cursor-default" // Zeleno jer je tvoj aktuelni trener
                                            : isPending || !canCoach
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
                                                : canCoach
                                                    ? "Request Coaching"
                                                    : "Requires an upgrade 🔒"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
