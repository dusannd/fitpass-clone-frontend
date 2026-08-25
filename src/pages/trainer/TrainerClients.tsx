import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/axios";
import { errorDetail } from "../../utils/errors";
import Avatar from "../../components/Avatar";
import { ProgressCard } from "../../components/ProgressCard";
import { parseGoals } from "../../utils/profile";
import type { UserProfile } from "../../components/Layout";
import type { WorkoutSession } from "../../utils/workout";

interface ClientInfo {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    profile: UserProfile | null;
}

interface CoachingLink {
    id: number;
    client_id: number;
    status: string;
    created_at: string;
    client: ClientInfo;
}

export default function TrainerClients() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [successMsg, setSuccessMsg] = useState("");

    // --- PROGRESS MODAL ---
    // Which client we are inspecting. Their history hangs off this in its own query,
    // so opening the modal never refetches the client list behind it.
    const [progressClient, setProgressClient] = useState<ClientInfo | null>(null);

    // --- 1. THE TWO LISTS ---
    // Two queries rather than one Promise.all: pending requests and active clients
    // are separate endpoints, and pairing them meant the slower one held up the
    // other and a single failure blanked both.
    const requestsQuery = useQuery({
        queryKey: ["trainer", "requests"],
        queryFn: async () => {
            const res = await api.get<CoachingLink[]>("/coaching/requests");
            return res.data;
        },
    });

    const clientsQuery = useQuery({
        queryKey: ["trainer", "clients"],
        queryFn: async () => {
            const res = await api.get<CoachingLink[]>("/coaching/clients");
            return res.data;
        },
    });

    const requests = requestsQuery.data ?? [];
    const activeClients = clientsQuery.data ?? [];

    // --- 2. ONE CLIENT'S WORKOUT HISTORY ---
    // Keyed by client id, so reopening a client the trainer already looked at shows
    // the chart straight away instead of a second spinner.
    // skipToken rather than `enabled`, because it also narrows the type: inside the
    // queryFn the id is a number, with no non-null assertion to go stale later.
    const progressClientId = progressClient?.id;
    const progressQuery = useQuery({
        queryKey: ["trainer", "client-progress", progressClientId],
        queryFn:
            progressClientId === undefined
                ? skipToken
                : async () => {
                      const res = await api.get<WorkoutSession[]>(
                          `/coaching/clients/${progressClientId}/progress`,
                      );
                      return res.data;
                  },
    });

    const progressSessions = progressQuery.data ?? [];
    const progressLoading = !!progressClient && progressQuery.isPending;
    const progressError = progressQuery.error
        ? errorDetail(progressQuery.error, "Failed to load this client's progress.")
        : "";

    const openProgress = (client: ClientInfo) => setProgressClient(client);
    const closeProgress = useCallback(() => setProgressClient(null), []);

    // Escape closes the modal, same behaviour as the profile menu in Layout.
    useEffect(() => {
        if (!progressClient) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeProgress();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [progressClient, closeProgress]);

    // --- 3. ACCEPT / REJECT A REQUEST ---
    const respond = useMutation({
        mutationFn: async ({ linkId, status }: { linkId: number; status: "ACCEPTED" | "REJECTED" }) => {
            await api.put(`/coaching/requests/${linkId}`, { status });
            return status;
        },
        onMutate: () => setSuccessMsg(""),
        onSuccess: async (status) => {
            setSuccessMsg(`Request successfully ${status.toLowerCase()}!`);
            // Accepting moves a row from one list to the other, so both have to go.
            await queryClient.invalidateQueries({ queryKey: ["trainer"] });
        },
    });

    // One banner for every failure on the page. A load error wins over an action
    // error - if the lists never arrived, the action error is the lesser problem.
    const error = requestsQuery.error || clientsQuery.error
        ? "Failed to load coaching data."
        : respond.error
          ? errorDetail(respond.error, "Action failed.")
          : "";

    if (requestsQuery.isPending || clientsQuery.isPending) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading clients...</div>;
    }

    return (
        <div className="max-w-5xl mx-auto flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Client Management
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Review incoming coaching requests and view your active personal training clients.
                </p>
            </div>

            {error && <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold text-sm border border-red-200 dark:border-red-800">{error}</div>}
            {successMsg && <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 p-4 rounded-xl font-bold text-sm border border-green-200 dark:border-green-800">{successMsg}</div>}

            {/* PENDING REQUESTS CARD */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">Pending Requests</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Members who want you to be their personal trainer.</p>

                {requests.length === 0 ? (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic py-4">No pending requests at the moment.</div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {requests.map((req) => {
                            const goals = parseGoals(req.client?.profile?.fitness_goals);
                            const bio = req.client?.profile?.bio;
                            const hasContext = Boolean(bio || goals.length > 0);

                            return (
                                <div key={req.id} className="bg-gray-50 dark:bg-slate-800/60 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
                                    {/* WHO IS SENDING THE REQUEST */}
                                    <div className="flex items-center gap-3">
                                        <Avatar profile={req.client?.profile} firstName={req.client?.first_name} size="md" />
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base truncate">
                                                {req.client?.first_name} {req.client?.last_name}
                                            </h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{req.client?.email}</p>
                                        </div>
                                    </div>

                                    {/* CONTEXT FOR THE DECISION - goals and bio before you hit Accept */}
                                    <div className="mt-4 pl-0 sm:pl-[4.25rem]">
                                        {hasContext ? (
                                            <>
                                                {goals.length > 0 && (
                                                    <div className="mb-3">
                                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                                                            Their Goals
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {goals.map((goal, i) => (
                                                                <span
                                                                    key={`${goal}-${i}`}
                                                                    className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                                                >
                                                                    {goal}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {bio && (
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                                                            About Them
                                                        </p>
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
                                                            {bio}
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                This member hasn't filled in their profile yet.
                                            </p>
                                        )}
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-slate-700">
                                        <button
                                            onClick={() => respond.mutate({ linkId: req.id, status: "ACCEPTED" })}
                                            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-6 rounded-lg transition shadow-sm"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => respond.mutate({ linkId: req.id, status: "REJECTED" })}
                                            className="flex-1 sm:flex-none bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/60 text-xs font-bold py-2.5 px-6 rounded-lg transition"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ACTIVE CLIENTS CARD */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">My Active Clients</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Members you are currently coaching.</p>

                {activeClients.length === 0 ? (
                    <div className="text-sm text-gray-400 dark:text-gray-500 italic py-4">You don't have any active clients yet.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeClients.map((link) => {
                            const goals = parseGoals(link.client?.profile?.fitness_goals);

                            return (
                                <div key={link.id} className="bg-gray-50 dark:bg-slate-800/60 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <Avatar profile={link.client?.profile} firstName={link.client?.first_name} size="md" />
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-base truncate">
                                                {link.client?.first_name} {link.client?.last_name}
                                            </h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{link.client?.email}</p>
                                        </div>
                                    </div>

                                    {/* Reminder of what the client is working on */}
                                    {goals.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {goals.map((goal, i) => (
                                                <span
                                                    key={`${goal}-${i}`}
                                                    className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                                >
                                                    {goal}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                                        {/* See how they are actually lifting, without having to ask them */}
                                        <button
                                            onClick={() => openProgress(link.client)}
                                            className="flex-1 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 text-xs font-bold py-2.5 rounded-lg transition-colors"
                                        >
                                            📈 View Progress
                                        </button>

                                        {/*
                                          The plan builder already accepts a client, but a trainer
                                          thinking "build something for Marko" starts here, not on
                                          the plans page. Hand the client over so the form opens
                                          ready to write a private plan.
                                        */}
                                        <button
                                            onClick={() => navigate("/trainer/plans", {
                                                state: {
                                                    assignToClientId: link.client.id,
                                                    assignToClientName: `${link.client.first_name} ${link.client.last_name}`,
                                                },
                                            })}
                                            className="flex-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 text-xs font-bold py-2.5 rounded-lg transition-colors"
                                        >
                                            📋 Assign Plan
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* --- CLIENT PROGRESS MODAL (frosted glass) --- */}
            {progressClient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={closeProgress}
                    ></div>

                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Progress for ${progressClient.first_name} ${progressClient.last_name}`}
                        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl animate-menu-pop"
                    >
                        {/* WHO ARE WE LOOKING AT */}
                        <div className="p-6 border-b border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar profile={progressClient.profile} firstName={progressClient.first_name} size="md" />
                                <div className="min-w-0">
                                    <h2 className="text-xl font-black text-gray-900 dark:text-white truncate">
                                        {progressClient.first_name} {progressClient.last_name}
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Strength progress</p>
                                </div>
                            </div>
                            <button
                                onClick={closeProgress}
                                aria-label="Close progress"
                                className="h-10 w-10 shrink-0 bg-gray-200/80 dark:bg-slate-800/80 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-400 rounded-full flex items-center justify-center transition-colors font-bold text-gray-600 dark:text-gray-400"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {progressLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                                </div>
                            ) : progressError ? (
                                <div className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold text-sm border border-red-200 dark:border-red-800">
                                    {progressError}
                                </div>
                            ) : progressSessions.length === 0 ? (
                                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    <span className="text-4xl mb-3 block">📭</span>
                                    <p className="font-bold">This client hasn't logged any workouts yet.</p>
                                </div>
                            ) : (
                                <ProgressCard sessions={progressSessions} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}