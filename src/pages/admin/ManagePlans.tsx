import React, { useState } from "react";
import axios from "axios";
import { api } from "../../api/axios.ts";

export default function ManagePlans() {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [duration, setDuration] = useState("30"); // Po defaultu 30 dana

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const handleCreatePlan = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setMessage("");

        try {
            // Šaljemo podatke na tvoj backend da upiše u bazu
            await api.post("/subscriptions/plans", {
                name: name,
                description: description,
                price: parseFloat(price), // Pretvaramo tekst u broj
                duration_days: parseInt(duration), // Pretvaramo tekst u broj
                location_ids: [] // Za sada ne ograničavamo po lokacijama
            });

            setMessage("Subscription plan successfully created! 🎉");
            // Resetujemo formu
            setName("");
            setDescription("");
            setPrice("");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to create plan. Check your permissions.");
            } else {
                setError("An unexpected error occurred.");
            }
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 max-w-2xl">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Manage Subscription Plans</h1>
            <p className="text-gray-600 mb-6">Create new pricing plans for your members.</p>

            {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-4 font-bold">{message}</div>}
            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 font-bold">{error}</div>}

            <form onSubmit={handleCreatePlan} className="flex flex-col gap-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Plan Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="e.g. Premium VIP 24/7"
                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Access to all gyms anytime."
                        className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 h-24"
                    />
                </div>

                <div className="flex gap-4">
                    <div className="w-1/2">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Price (RSD)</label>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            required
                            min="0"
                            placeholder="3500"
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Duration (Days)</label>
                        <input
                            type="number"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            required
                            min="1"
                            className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="mt-4 bg-gray-900 text-white font-bold py-2 px-4 rounded hover:bg-black transition"
                >
                    Create Plan
                </button>
            </form>
        </div>
    );
}