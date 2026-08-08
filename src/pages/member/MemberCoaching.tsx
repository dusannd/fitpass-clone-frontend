import { useEffect, useState } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface Trainer {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
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

                        // Ako te je trener već prihvatio, karta postaje zelena!
                        return (
                            <div
                                key={trainer.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border p-6 flex flex-col items-center text-center transition-all duration-200 ${
                                    isAccepted
                                        ? "border-emerald-300 dark:border-emerald-700"
                                        : "border-gray-200 dark:border-slate-800 hover:shadow-lg hover:-translate-y-0.5"
                                }`}
                            >
                                <div className={`h-20 w-20 rounded-full flex items-center justify-center font-black text-3xl mb-4 uppercase ${
                                    isAccepted
                                        ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400"
                                        : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                                }`}>
                                    {trainer.first_name?.charAt(0) || "T"}
                                </div>

                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {trainer.first_name} {trainer.last_name}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{trainer.email}</p>

                                <button
                                    disabled={isPending || isAccepted || isCurrentlyLoading}
                                    onClick={() => void handleSendRequest(trainer.id, `${trainer.first_name}`)}
                                    className={`w-full mt-auto font-black py-3 px-4 rounded-xl transition-all shadow-sm ${
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
