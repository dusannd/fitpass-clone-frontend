import { useEffect, useState } from "react";
import { api } from "../../api/axios.ts";

// --- TypeScript Interfaces based on Backend Schemas ---
interface AnalyticsData {
    total_successful_entries_today: number;
    total_failed_attempts_today: number;
    total_registered_users: number;
}

interface BasicUser {
    email: string;
    first_name: string | null;
    last_name: string | null;
}

interface BasicLocation {
    name: string;
}

interface EntryLog {
    id: number;
    timestamp: string;
    access_granted: boolean;
    reason: string | null;
    location: BasicLocation | null;
    worker: BasicUser | null;
    user: BasicUser | null;
}

export default function AdminAnalytics() {
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [overrides, setOverrides] = useState<EntryLog[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Fetch data safely on component mount
    useEffect(() => {
        let isMounted = true;

        const fetchDashboardData = async () => {
            try {
                // Fetch both overall stats and the manual overrides audit log
                const [statsRes, overridesRes] = await Promise.all([
                    api.get("/admin/analytics/today"),
                    api.get("/admin/audit/manual-overrides")
                ]);

                if (isMounted) {
                    setAnalytics(statsRes.data as AnalyticsData);
                    setOverrides(overridesRes.data as EntryLog[]);
                }
            } catch {
                if (isMounted) {
                    setError("Failed to load analytics data.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void fetchDashboardData();

        return () => {
            isMounted = false;
        };
    }, []);

    if (loading) return <div className="p-6 text-gray-600 font-bold">Loading dashboard data...</div>;
    if (error) return <div className="p-6 text-red-600 font-bold">{error}</div>;

    return (
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Gym Analytics</h1>
                <p className="text-gray-600 mt-2">Monitor daily traffic and audit manual desk operations.</p>
            </div>

            {/* TOP CARDS: STATISTICS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Users */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-600 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Total Members</p>
                    <p className="text-4xl font-black text-gray-800">{analytics?.total_registered_users || 0}</p>
                </div>

                {/* Successful Entries Today */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Entries Today</p>
                    <p className="text-4xl font-black text-gray-800">{analytics?.total_successful_entries_today || 0}</p>
                </div>

                {/* Failed Attempts Today */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Failed Scans Today</p>
                    <p className="text-4xl font-black text-red-600">{analytics?.total_failed_attempts_today || 0}</p>
                </div>
            </div>

            {/* BOTTOM SECTION: AUDIT LOG (MANUAL OVERRIDES) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">Security Audit: Manual Door Overrides</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Log of all instances where a desk worker manually opened the gym door.
                    </p>
                </div>

                <div className="p-0 overflow-x-auto">
                    {overrides.length === 0 ? (
                        <div className="p-6 text-gray-500 text-center italic">
                            No manual overrides recorded.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider">
                                <th className="p-4 border-b border-gray-200 font-bold">Date & Time</th>
                                <th className="p-4 border-b border-gray-200 font-bold">Gym Location</th>
                                <th className="p-4 border-b border-gray-200 font-bold">Worker (Authorized By)</th>
                                <th className="p-4 border-b border-gray-200 font-bold">Member (Let In)</th>
                            </tr>
                            </thead>
                            <tbody className="text-sm text-gray-700">
                            {overrides.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50 transition border-b border-gray-100 last:border-0">
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="font-bold text-gray-800">{new Date(log.timestamp).toLocaleDateString()}</span>
                                        <span className="text-gray-500 ml-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </td>
                                    <td className="p-4 font-bold text-blue-700">
                                        {log.location?.name || "Unknown Location"}
                                    </td>
                                    <td className="p-4">
                                        {log.worker?.first_name} {log.worker?.last_name}
                                        <br/>
                                        <span className="text-xs text-gray-400">{log.worker?.email}</span>
                                    </td>
                                    <td className="p-4">
                                        {log.user?.first_name} {log.user?.last_name}
                                        <br/>
                                        <span className="text-xs text-gray-400">{log.user?.email}</span>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

        </div>
    );
}