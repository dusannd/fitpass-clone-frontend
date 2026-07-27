import React, { useEffect, useState } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

interface Role {
    id: number;
    name: string;
}

interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: Role[];
}

export default function HRPanel() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedEmail, setSelectedEmail] = useState("");
    const [selectedRole, setSelectedRole] = useState("trainer");

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // Čist useEffect bez pomoćnih funkcija (Linter ovo obožava)
    useEffect(() => {
        api.get("/users/")
            .then((res) => {
                setUsers(res.data);
                setLoading(false);
            })
            .catch(() => {
                setError("Failed to fetch users.");
                setLoading(false);
            });
    }, []);

    const handleHire = async (e: React.MouseEvent) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (!selectedEmail) return setError("Please select or type an email.");

        try {
            await api.post("/admin/hr/hire", {
                email: selectedEmail,
                role_name: selectedRole,
            });
            setMessage(`Successfully assigned '${selectedRole}' to ${selectedEmail}.`);

            // Ručno osvežavamo tabelu nakon akcije
            const res = await api.get("/users/");
            setUsers(res.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to hire staff.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    const handleFire = async (e: React.MouseEvent) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (!selectedEmail) return setError("Please select or type an email.");

        try {
            await api.post("/admin/hr/fire", {
                email: selectedEmail,
                role_name: selectedRole,
            });
            setMessage(`Successfully revoked '${selectedRole}' from ${selectedEmail}.`);

            // Ručno osvežavamo tabelu nakon akcije
            const res = await api.get("/users/");
            setUsers(res.data);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to fire staff.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    if (loading) return <div className="p-6">Loading HR Panel...</div>;

    return (
        <div className="flex flex-col gap-8">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Human Resources Panel</h1>
                <p className="text-gray-600 mb-6">Assign or revoke system privileges for users.</p>

                {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 font-bold">{message}</div>}
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-bold">{error}</div>}

                <form className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-1/2">
                        <label className="block text-sm font-bold text-gray-700 mb-1">User Email</label>
                        <input
                            type="email"
                            value={selectedEmail}
                            onChange={(e) => setSelectedEmail(e.target.value)}
                            placeholder="worker@gym.com"
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="w-full md:w-1/4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                        <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                            <option value="trainer">Trainer</option>
                            <option value="worker">Desk Worker</option>
                            <option value="admin">Administrator</option>
                        </select>
                    </div>

                    <div className="flex gap-2 w-full md:w-1/4">
                        <button
                            onClick={(e) => void handleHire(e)}
                            className="w-1/2 bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 transition"
                        >
                            Hire
                        </button>
                        <button
                            onClick={(e) => void handleFire(e)}
                            className="w-1/2 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700 transition"
                        >
                            Fire
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-700">Registered Users</h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
                            <th className="p-4 border-b">ID</th>
                            <th className="p-4 border-b">Name</th>
                            <th className="p-4 border-b">Email</th>
                            <th className="p-4 border-b">Active Roles</th>
                        </tr>
                        </thead>
                        <tbody>
                        {users.map((u) => (
                            <tr key={u.id} className="hover:bg-gray-50 transition border-b last:border-b-0">
                                <td className="p-4 text-gray-500">{u.id}</td>
                                <td className="p-4 font-bold text-gray-800">
                                    {u.first_name} {u.last_name}
                                </td>
                                <td className="p-4 text-blue-600 cursor-pointer hover:underline" onClick={() => setSelectedEmail(u.email)}>
                                    {u.email}
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-1">
                                        {u.roles.map((r) => (
                                            <span
                                                key={r.id}
                                                className={`text-xs font-bold px-2 py-1 rounded-full uppercase
                            ${r.name === 'admin' ? 'bg-purple-100 text-purple-800' : ''}
                            ${r.name === 'trainer' ? 'bg-orange-100 text-orange-800' : ''}
                            ${r.name === 'worker' ? 'bg-green-100 text-green-800' : ''}
                            ${r.name === 'member' ? 'bg-gray-200 text-gray-800' : ''}
                          `}
                                            >
                          {r.name}
                        </span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}