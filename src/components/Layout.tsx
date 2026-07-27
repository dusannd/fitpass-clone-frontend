import { useEffect, useState } from "react";
import { useNavigate, Link, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/axios";

// We define our User type here so TypeScript helps us out
export interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: { id: number; name: string }[];
}

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation(); // To know which page is active

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // We check who the user is as soon as the layout loads
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await api.get("/users/me");
                setUser(response.data);
            } catch {
                localStorage.removeItem("token");
                navigate("/login");
            } finally {
                setLoading(false);
            }
        };

        void fetchProfile();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100">
                <h2 className="text-xl font-bold text-gray-600">Loading application...</h2>
            </div>
        );
    }

    // Helper function to check if user has a specific role
    const hasRole = (roleName: string) => {
        return user?.roles.some((r) => r.name === roleName);
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans text-gray-900">

            {/* SIDEBAR (Left Menu) */}
            <aside className="w-64 bg-gray-900 text-white flex flex-col shadow-lg">
                <div className="p-6 text-center border-b border-gray-800">
                    <h1 className="text-2xl font-black text-blue-500 tracking-wider">FITPASS</h1>
                    <p className="text-xs text-gray-400 mt-1 uppercase">Clone System</p>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    {/* EVERYONE SEES DASHBOARD */}
                    <Link
                        to="/dashboard"
                        className={`block px-4 py-2 rounded transition ${location.pathname === "/dashboard" ? "bg-blue-600" : "hover:bg-gray-800"}`}
                    >
                        🏠 Dashboard
                    </Link>

                    {/* MEMBER LINKS */}
                    {hasRole("member") && (
                        <>
                            <div className="pt-4 pb-1 text-xs text-gray-500 font-bold uppercase">Member Area</div>
                            <Link to="/subscriptions" className={`block px-4 py-2 rounded transition ${location.pathname === "/subscriptions" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>🎫 My Subscription</Link>
                            <Link to="/workouts" className={`block px-4 py-2 rounded transition ${location.pathname === "/workouts" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>🏋️ Workouts</Link>
                            {/* NOVO - Link za coaching */}
                            <Link to="/coaching" className={`block px-4 py-2 rounded transition ${location.pathname === "/coaching" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>💬 Coaching</Link>
                            <Link to="/appointments" className={`block px-4 py-2 rounded transition ${location.pathname === "/appointments" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>📅 Appointments</Link>
                        </>
                    )}

                    {/* TRAINER LINKS */}
                    {hasRole("trainer") && (
                        <>
                            <div className="pt-4 pb-1 text-xs text-gray-500 font-bold uppercase">Trainer Area</div>
                            {/* NOVO - Izmenjen link da vodi na /trainer/clients */}
                            <Link to="/trainer/clients" className={`block px-4 py-2 rounded transition ${location.pathname === "/trainer/clients" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>👥 My Clients</Link>

                            <Link to="/trainer/appointments" className={`block px-4 py-2 rounded transition ${location.pathname === "/trainer/appointments" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>📅 Appointments</Link>
                            <Link to="/trainer/plans" className={`block px-4 py-2 rounded transition ${location.pathname === "/trainer/plans" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>📝 Workout Plans</Link>
                        </>
                    )}

                    {/* WORKER LINKS */}
                    {hasRole("worker") && (
                        <>
                            <div className="pt-4 pb-1 text-xs text-gray-500 font-bold uppercase">Desk Area</div>
                            <Link to="/worker/dashboard" className={`block px-4 py-2 rounded transition ${location.pathname === "/worker/dashboard" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>🔍 Check Access</Link>
                        </>

                    )}

                    {/* ADMIN LINKS */}
                    {hasRole("admin") && (
                        <>
                            <div className="pt-4 pb-1 text-xs text-gray-500 font-bold uppercase">Admin Area</div>
                            <Link to="/dashboard" className="block px-4 py-2 rounded hover:bg-gray-800 transition">📈 Analytics</Link>
                            <Link to="/admin/hr" className={`block px-4 py-2 rounded transition ${location.pathname === "/admin/hr" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>👔 HR Panel</Link>
                            <Link to="/admin/plans" className={`block px-4 py-2 rounded transition ${location.pathname === "/admin/plans" ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}>💳 Manage Plans</Link>
                        </>
                    )}
                </nav>

                {/* LOGOUT BUTTON AT THE BOTTOM */}
                <div className="p-4 border-t border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="w-full bg-red-600 text-white font-bold py-2 px-4 rounded hover:bg-red-700 transition"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA (Right Side) */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* TOP HEADER */}
                <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800">
                        Welcome, {user?.first_name}
                    </h2>
                    <div className="flex gap-2">
                        {user?.roles.map((r) => (
                            <span key={r.id} className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase">
                                {r.name}
                            </span>
                        ))}
                    </div>
                </header>

                {/* DYNAMIC PAGE CONTENT GOES HERE */}
                <div className="flex-1 overflow-auto p-8">
                    {/* <Outlet /> is a magic React Router component that renders the current page inside this layout */}
                    <Outlet context={user} />
                </div>
            </main>

        </div>
    );
}