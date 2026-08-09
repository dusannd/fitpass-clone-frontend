import { useEffect, useState } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";
import Avatar from "../../components/Avatar";
import { parseGoals } from "../../utils/profile";
import type { UserProfile } from "../../components/Layout";

interface Trainer {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    profile: UserProfile | null;
}

interface MyTrainerLink {
    trainer_id: number;
    status: string;
}

export default function MemberCoaching() {
    const [trainers, setTrainers] = useState<Trainer[]>([]);

    // Čuva ID-jeve trenera kojima je ZAHTEV POSLAT
    const [pendingIds, setPendingIds] = useState<number[]>([]);
    // Čuva ID-jeve trenera koji su PRIHVATILI zahtev
    const [acceptedIds, setAcceptedIds] = useState<number[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [loadingId, setLoadingId] = useState<number | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Odjednom vučemo sve trenere i status naših zahteva
                const [trainersRes, myLinksRes] = await Promise.all([
                    api.get("/workouts/trainers"),
                    api.get("/coaching/my-trainers") // <-- ONA NOVA BACKEND RUTA!
                ]);

                setTrainers(trainersRes.data);

                // Sortiramo ID-jeve na osnovu toga da li je zahtev na čekanju ili prihvaćen
                const links: MyTrainerLink[] = myLinksRes.data;

                const pending = links.filter(l => l.status === "PENDING").map(l => l.trainer_id);
                const accepted = links.filter(l => l.status === "ACCEPTED").map(l => l.trainer_id);

                setPendingIds(pending);
                setAcceptedIds(accepted);

            } catch (err) {
                setError("Failed to load trainers.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        void fetchInitialData();
    }, []);

    const handleSendRequest = async (trainerId: number, trainerName: string) => {
        setError("");
        setSuccessMsg("");
        setLoadingId(trainerId);

        try {
            await api.post(`/coaching/request/${trainerId}`);
            setSuccessMsg(`Coaching request sent successfully to ${trainerName}!`);

            // Ubaci ID u PENDING niz čim prođe
            setPendingIds((prev) => [...prev, trainerId]);

        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const errorMsg = err.response?.data?.detail || "Failed to send request.";
                if (errorMsg.includes("already exists")) {
                    setPendingIds((prev) => [...prev, trainerId]);
                    setError(`You already have a pending or active request with ${trainerName}.`);
                } else {
                    setError(errorMsg);
                }
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setLoadingId(null);
        }
    };

    if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400 font-bold">Loading trainers...</div>;

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Find a Personal Trainer
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2 transition-colors duration-200">
                    Browse our certified trainers and request 1-on-1 coaching.
                </p>
            </div>

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

                                <button
                                    disabled={isPending || isAccepted || isCurrentlyLoading}
                                    onClick={() => void handleSendRequest(trainer.id, `${trainer.first_name}`)}
                                    className={`w-full font-black py-3 px-4 rounded-xl transition-all shadow-sm ${
                                        isAccepted
                                            ? "bg-emerald-500 text-white cursor-default" // Zeleno jer je tvoj aktuelni trener
                                            : isPending
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
