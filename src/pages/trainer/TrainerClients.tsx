import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface CoachingUser {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
}

interface CoachingRequest {
    id: number;
    trainer_id: number;
    client_id: number;
    status: string;
    created_at: string;
    client: CoachingUser;
}

export default function TrainerClients() {
    const [pendingRequests, setPendingRequests] = useState<CoachingRequest[]>([]);
    const [activeClients, setActiveClients] = useState<CoachingRequest[]>([]);

    // Inicijalno stanje je true
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Ovo koristimo SAMO za refresh podataka nakon klika na Accept/Reject
    const refreshData = useCallback(async () => {
        try {
            const [pendingRes, clientsRes] = await Promise.all([
                api.get("/coaching/requests"),
                api.get("/coaching/clients")
            ]);
            setPendingRequests(pendingRes.data);
            setActiveClients(clientsRes.data);
            setError("");
        } catch (err: unknown) {
            setError("Failed to load clients data.");
            console.error(err);
        }
    }, []);

    // Ovo se okida kada se stranica PRVI put učita
    useEffect(() => {
        let isMounted = true; // Sprečava memory leaks

        const fetchInitialData = async () => {
            try {
                const [pendingRes, clientsRes] = await Promise.all([
                    api.get("/coaching/requests"),
                    api.get("/coaching/clients")
                ]);

                if (isMounted) {
                    setPendingRequests(pendingRes.data);
                    setActiveClients(clientsRes.data);
                }
            } catch (err) {
                if (isMounted) {
                    setError("Failed to load clients data.");
                    console.error(err);
                }
            } finally {
                if (isMounted) {
                    setLoading(false); // Ovde ga gasimo samo jednom
                }
            }
        };

        void fetchInitialData();

        return () => {
            isMounted = false;
        };
    }, []); // Prazan array znaci okinuće se isključivo pri učitavanju komponente

    const handleRequestAction = async (requestId: number, actionStatus: "ACCEPTED" | "REJECTED") => {
        try {
            await api.put(`/coaching/requests/${requestId}`, { status: actionStatus });
            await refreshData();
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                alert(err.response?.data?.detail || "Failed to update request status.");
            } else {
                alert("An unexpected error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6">Loading clients...</div>;

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto">
            {error && <div className="bg-red-100 text-red-700 p-3 rounded font-bold">{error}</div>}

            {/* SECTION 1: PENDING REQUESTS */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Pending Requests</h2>
                <p className="text-gray-600 mb-6">Members who want you to be their personal trainer.</p>

                {pendingRequests.length === 0 ? (
                    <p className="text-gray-500 italic">No pending requests at the moment.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingRequests.map((req) => (
                            <div key={req.id} className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-lg text-blue-900">
                                        {req.client?.first_name} {req.client?.last_name}
                                    </h3>
                                    <p className="text-sm text-blue-700 mb-4">{req.client?.email}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => void handleRequestAction(req.id, "ACCEPTED")}
                                        className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 flex-1 transition"
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => void handleRequestAction(req.id, "REJECTED")}
                                        className="bg-red-100 text-red-700 px-4 py-2 rounded font-bold hover:bg-red-200 flex-1 transition"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* SECTION 2: ACTIVE CLIENTS */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">My Active Clients</h2>
                <p className="text-gray-600 mb-6">Members you are currently coaching.</p>

                {activeClients.length === 0 ? (
                    <p className="text-gray-500 italic">You don't have any active clients yet.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeClients.map((clientLink) => (
                            <div key={clientLink.id} className="bg-gray-50 border border-gray-200 p-4 rounded-lg flex items-center gap-4">
                                <div className="h-12 w-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                                    {clientLink.client?.first_name?.charAt(0) || "C"}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">
                                        {clientLink.client?.first_name} {clientLink.client?.last_name}
                                    </h3>
                                    <p className="text-xs text-gray-500">{clientLink.client?.email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}