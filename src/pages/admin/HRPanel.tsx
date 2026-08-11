import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../../api/axios";

// Definišemo strukturu korisnika
interface Role {
    id: number;
    name: string;
}

interface StaffMember {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
    roles: Role[];
}

// Hire and fire hit different endpoints but carry the same payload, so one
// mutation handles both and this says which way it is going.
interface HRAction {
    action: "hire" | "fire";
    email: string;
    roleName: string;
}

/**
 * Both name columns are nullable in the database, and `{first} {last}` on an
 * account that has neither renders as a lone space - a row that looks broken.
 * The email is always there, so it is the fallback.
 */
function displayName(user: StaffMember): string {
    return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email;
}

export default function HRPanel() {
    const queryClient = useQueryClient();

    const [email, setEmail] = useState("");
    const [roleName, setRoleName] = useState("trainer");

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // --- 1. STAFF LIST ---
    // Asks the backend for staff directly. This used to fetch GET /users/ and
    // filter in the browser, which quietly broke once the gym passed 50 users:
    // that endpoint pages at 50, so any staff member outside the first page was
    // simply absent from the list.
    const staffQuery = useQuery({
        queryKey: ["admin", "staff"],
        queryFn: () => api.get<StaffMember[]>("/admin/hr/staff").then((res) => res.data),
    });

    const staff = staffQuery.data ?? [];

    // --- 2. HIRE / FIRE ---
    // One mutation for both directions: the endpoints differ only in the verb, so
    // splitting them would duplicate the banner and error handling twice over.
    const hrMutation = useMutation({
        mutationFn: ({ action, email: targetEmail, roleName: targetRole }: HRAction) =>
            api
                .post<{ message: string }>(
                    action === "hire" ? "/admin/hr/hire" : "/admin/hr/fire",
                    { email: targetEmail, role_name: targetRole }
                )
                .then((res) => res.data),
        onSuccess: async (data, variables) => {
            setError("");
            setMessage(data.message);
            if (variables.action === "hire") setEmail(""); // Praznimo polje samo kad zaposlimo nekog

            await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
            // Hiring and firing change roles, and the sidebar is built from them -
            // so an admin who promotes themselves needs this shared key refreshed
            // too, otherwise their own nav stays stale until a reload.
            await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
        },
        onError: (err: unknown) => {
            setMessage("");
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to update this staff member.");
            } else {
                setError("An unexpected error occurred.");
            }
        },
    });

    // Only the button that was actually clicked says "Processing...", while both
    // stay disabled. mutation.variables survives after the call settles, so it has
    // to be read together with isPending.
    const pendingAction = hrMutation.isPending ? hrMutation.variables?.action : null;

    // Akcija za Hire / Fire
    const executeAction = (action: "hire" | "fire") => {
        if (!email.trim()) {
            setError("Please enter a valid email address.");
            return;
        }

        setMessage("");
        setError("");
        hrMutation.mutate({ action, email, roleName });
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    HR Staff Management
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Promote existing users to Trainers or Desk Staff, or revoke privileges.
                </p>
            </div>

            {/* MAIN PANEL (Forma) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-200 dark:border-slate-800 transition-colors duration-200">

                {message && (
                    <div className="bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400 p-4 rounded-xl mb-6 font-bold text-sm border border-green-200 dark:border-green-800 transition-colors">
                        ✅ {message}
                    </div>
                )}
                {error && (
                    <div className="bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 p-4 rounded-xl mb-6 font-bold text-sm border border-red-200 dark:border-red-800 transition-colors">
                        ❌ {error}
                    </div>
                )}

                <div className="flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 transition-colors">
                                User Email Address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div className="sm:w-1/3">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 transition-colors">
                                Role Privilege
                            </label>
                            <select
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer transition-all"
                            >
                                <option value="trainer">Personal Trainer</option>
                                <option value="worker">Desk Worker</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-2 border-t border-gray-100 dark:border-slate-800 transition-colors">
                        <button
                            type="button"
                            onClick={() => executeAction("hire")}
                            disabled={hrMutation.isPending}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm disabled:opacity-50 flex justify-center items-center"
                        >
                            {pendingAction === "hire" ? "Processing..." : "Assign Role (Hire)"}
                        </button>

                        <button
                            type="button"
                            onClick={() => executeAction("fire")}
                            disabled={hrMutation.isPending}
                            className="flex-1 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/60 font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50 flex justify-center items-center"
                        >
                            {pendingAction === "fire" ? "Processing..." : "Revoke Role (Fire)"}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- LISTA ZAPOSLENIH --- */}
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 transition-colors">
                    Current Staff Members
                </h2>

                {staffQuery.isPending ? (
                    <div className="text-gray-500 dark:text-gray-400 font-medium">Loading staff list...</div>
                ) : staffQuery.isError ? (
                    // The old code only logged this, so a failed request looked
                    // exactly like a gym with no staff in it.
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-red-200 dark:border-red-800 text-rose-600 dark:text-rose-400 text-center font-medium transition-colors">
                        Could not load the staff list.{" "}
                        <button
                            type="button"
                            onClick={() => void staffQuery.refetch()}
                            className="underline font-bold hover:text-rose-700 dark:hover:text-rose-300"
                        >
                            Try again
                        </button>
                    </div>
                ) : staff.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-500 text-center transition-colors">
                        No staff members found.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {staff.map((user) => (
                            <div key={user.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
                                <div className="flex items-center gap-3 mb-4">
                                    {/* AVATAR */}
                                    <div className="h-10 w-10 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center font-bold text-lg border border-gray-200 dark:border-slate-700">
                                        {displayName(user).charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">
                                            {displayName(user)}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>

                                {/* ROLES BADGES */}
                                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                                    {user.roles.map((r) => {
                                        // Preskačemo prikazivanje "member" role da bi bilo čistije
                                        if (r.name === "member") return null;

                                        // Biramo boju badge-a u zavisnosti od role
                                        let badgeColor = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800";
                                        if (r.name === "admin") badgeColor = "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800";
                                        if (r.name === "worker") badgeColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800";

                                        return (
                                            <span key={r.id} className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${badgeColor}`}>
                                                {r.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
