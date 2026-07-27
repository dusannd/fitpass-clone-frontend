import { useOutletContext } from "react-router-dom";
import type { User } from "../components/Layout";

export default function Dashboard() {
    // We magically get the 'user' object from our Layout component!
    const user = useOutletContext<User>();

    return (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
                Dashboard Overview
            </h1>
            <p className="text-gray-600">
                Hi <strong>{user.first_name}</strong>! This is your central hub.
                Use the menu on the left to navigate through the system.
            </p>

            <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-100">
                <h3 className="text-lg font-bold text-blue-800 mb-2">System Status</h3>
                <p className="text-blue-600">
                    Backend connection: <span className="font-bold text-green-600">ACTIVE</span>
                </p>
                <p className="text-blue-600 mt-1">
                    Your privileges: <span className="font-bold">{user.roles.map(r => r.name).join(", ")}</span>
                </p>
            </div>
        </div>
    );
}