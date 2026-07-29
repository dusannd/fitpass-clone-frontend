import { useEffect, useState } from "react";
import { api } from "../../api/axios";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
} from "recharts";

interface AnalyticsData {
    total_successful_entries_today: number;
    total_failed_attempts_today: number;
    total_registered_users: number;
}

interface DayAttendance {
    day: string;
    entries: number;
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
    const [weeklyData, setWeeklyData] = useState<DayAttendance[]>([]);
    const [overrides, setOverrides] = useState<EntryLog[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let isMounted = true;

        const fetchDashboardData = async () => {
            try {
                const [statsRes, weeklyRes, overridesRes] = await Promise.all([
                    api.get("/admin/analytics/today"),
                    api.get("/admin/analytics/weekly"),
                    api.get("/admin/audit/manual-overrides"),
                ]);

                if (isMounted) {
                    setAnalytics(statsRes.data as AnalyticsData);
                    setWeeklyData(weeklyRes.data as DayAttendance[]);
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

    if (loading) {
        return <div className="p-6 text-gray-600 dark:text-gray-300 font-bold">Loading admin dashboard...</div>;
    }

    if (error) {
        return <div className="p-6 text-red-600 dark:text-red-400 font-bold">{error}</div>;
    }

    const successCount = analytics?.total_successful_entries_today || 0;
    const failedCount = analytics?.total_failed_attempts_today || 0;
    const totalScans = successCount + failedCount;

    const donutData = [
        { name: "Successful Entries", value: successCount > 0 ? successCount : 1, color: "#22C55E" },
        { name: "Failed Attempts", value: failedCount, color: "#EF4444" },
    ];

    return (
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
            {/* HEADER */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white transition-colors duration-200">
                    Gym Executive Analytics
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                    Real-time attendance metrics, door scanner health, and audit logs.
                </p>
            </div>

            {/* TOP ROW: 3 CIRCULAR STAT RINGS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* STAT CIRCLE 1: TOTAL MEMBERS */}
                <div className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 flex items-center justify-between transition-colors duration-200">
                    <div>
                        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total Members</p>
                        <p className="text-4xl font-black text-blue-600 dark:text-blue-400 mt-2">{analytics?.total_registered_users || 0}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Active gym community</p>
                    </div>
                    <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="40" cy="40" r="32" className="stroke-gray-200 dark:stroke-slate-800" strokeWidth="8" fill="transparent" />
                            <circle cx="40" cy="40" r="32" stroke="#3B82F6" strokeWidth="8" strokeDasharray="200" strokeDashoffset="40" fill="transparent" strokeLinecap="round" />
                        </svg>
                        <span className="absolute text-blue-500 dark:text-blue-400 text-xs font-bold">👥</span>
                    </div>
                </div>

                {/* STAT CIRCLE 2: ENTRIES TODAY */}
                <div className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 flex items-center justify-between transition-colors duration-200">
                    <div>
                        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Entries Today</p>
                        <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{successCount}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Successful turnstile scans</p>
                    </div>
                    <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="40" cy="40" r="32" className="stroke-gray-200 dark:stroke-slate-800" strokeWidth="8" fill="transparent" />
                            <circle cx="40" cy="40" r="32" stroke="#10B981" strokeWidth="8" strokeDasharray="200" strokeDashoffset="30" fill="transparent" strokeLinecap="round" />
                        </svg>
                        <span className="absolute text-emerald-500 dark:text-emerald-400 text-xs font-bold">🟢</span>
                    </div>
                </div>

                {/* STAT CIRCLE 3: FAILED SCANS */}
                <div className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 flex items-center justify-between transition-colors duration-200">
                    <div>
                        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Failed Scans Today</p>
                        <p className="text-4xl font-black text-rose-600 dark:text-rose-500 mt-2">{failedCount}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Blocked / Expired access</p>
                    </div>
                    <div className="relative w-20 h-20 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="40" cy="40" r="32" className="stroke-gray-200 dark:stroke-slate-800" strokeWidth="8" fill="transparent" />
                            <circle cx="40" cy="40" r="32" stroke="#EF4444" strokeWidth="8" strokeDasharray="200" strokeDashoffset="140" fill="transparent" strokeLinecap="round" />
                        </svg>
                        <span className="absolute text-rose-500 dark:text-rose-400 text-xs font-bold">⚠️</span>
                    </div>
                </div>
            </div>

            {/* MIDDLE ROW: CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* DONUT CHART */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col justify-between transition-colors duration-200">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Turnstile Scan Health</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Success vs Failure Ratio Today</p>
                    </div>

                    <div className="h-52 w-full my-2 relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={donutData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={75}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {donutData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: unknown) => [String(value ?? 0), "Scans"]}
                                    contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-gray-800 dark:text-white">{totalScans}</span>
                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-slate-500">Total Scans</span>
                        </div>
                    </div>

                    <div className="flex justify-center gap-6 text-xs font-bold text-gray-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                            <span>Passed ({successCount})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                            <span>Blocked ({failedCount})</span>
                        </div>
                    </div>
                </div>

                {/* BAR CHART */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col justify-between transition-colors duration-200">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">Weekly Attendance Trend</h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Real member entries for the last 7 days</p>
                    </div>

                    <div className="h-56 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    formatter={(value: unknown) => [`${value ?? 0} members`, "Attendance"]}
                                    contentStyle={{ borderRadius: "0.5rem", fontSize: "12px", fontWeight: "bold" }}
                                />
                                <Bar dataKey="entries" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* AUDIT LOG TABLE */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors duration-200">
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/40">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">Security Audit: Desk Worker Overrides</h2>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        Log of all manual door overrides performed by desk staff.
                    </p>
                </div>

                <div className="p-0 overflow-x-auto">
                    {overrides.length === 0 ? (
                        <div className="p-8 text-gray-400 text-center italic text-sm">
                            No manual overrides recorded.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-gray-100/70 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                <th className="p-4 font-bold">Date & Time</th>
                                <th className="p-4 font-bold">Gym Location</th>
                                <th className="p-4 font-bold">Worker (Authorized By)</th>
                                <th className="p-4 font-bold">Member (Let In)</th>
                            </tr>
                            </thead>
                            <tbody className="text-sm text-gray-700 dark:text-gray-300">
                            {overrides.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition border-b border-gray-100 dark:border-slate-800 last:border-0">
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="font-bold text-gray-800 dark:text-white">{new Date(log.timestamp).toLocaleDateString()}</span>
                                        <span className="text-gray-400 ml-2 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </td>
                                    <td className="p-4 font-bold text-blue-600 dark:text-blue-400">
                                        {log.location?.name || "Main Gym"}
                                    </td>
                                    <td className="p-4">
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{log.worker?.first_name} {log.worker?.last_name}</span>
                                        <br />
                                        <span className="text-xs text-gray-400">{log.worker?.email}</span>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{log.user?.first_name} {log.user?.last_name}</span>
                                        <br />
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