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

    if (loading) return <div className="p-6">Loading trainers...</div>;

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Find a Personal Trainer</h1>
                <p className="text-gray-600 mt-2">
                    Browse our certified trainers and request 1-on-1 coaching.
                </p>
            </div>

            {successMsg && <div className="bg-green-100 text-green-700 p-4 rounded mb-6 font-bold">{successMsg}</div>}
            {error && <div className="bg-red-100 text-red-700 p-4 rounded mb-6 font-bold">{error}</div>}

            {trainers.length === 0 ? (
                <div className="bg-yellow-50 text-yellow-800 p-4 rounded border border-yellow-200">
                    No trainers are currently available at this gym.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {trainers.map((trainer) => {
                        const isPending = pendingIds.includes(trainer.id);
                        const isAccepted = acceptedIds.includes(trainer.id);
                        const isCurrentlyLoading = loadingId === trainer.id;

                        // Ako te je trener već prihvatio, dugme postaje zeleno!
                        return (
                            <div key={trainer.id} className={`bg-white rounded-lg shadow-md border p-6 flex flex-col items-center text-center transition ${isAccepted ? 'border-green-400 shadow-green-100' : 'border-gray-200 hover:shadow-lg'}`}>
                                <div className={`h-20 w-20 rounded-full flex items-center justify-center font-bold text-3xl mb-4 uppercase ${isAccepted ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600'}`}>
                                    {trainer.first_name?.charAt(0) || "T"}
                                </div>

                                <h2 className="text-xl font-bold text-gray-800">
                                    {trainer.first_name} {trainer.last_name}
                                </h2>
                                <p className="text-sm text-gray-500 mb-6">{trainer.email}</p>

                                <button
                                    disabled={isPending || isAccepted || isCurrentlyLoading}
                                    onClick={() => void handleSendRequest(trainer.id, `${trainer.first_name}`)}
                                    className={`w-full mt-auto font-bold py-2 px-4 rounded transition ${
                                        isAccepted
                                            ? "bg-green-500 text-white cursor-default" // Zeleno jer je tvoj aktuelni trener
                                            : isPending
                                                ? "bg-gray-300 text-gray-600 cursor-not-allowed" // Sivo jer se čeka
                                                : "bg-blue-600 text-white hover:bg-blue-700" // Plavo za slanje
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