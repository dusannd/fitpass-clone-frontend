import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/axios";
import { clearUserScopedStorage } from "../utils/storage";
import Avatar from "./Avatar";
import RouteFallback from "./RouteFallback";


export interface Role {
    id: number;
    name: string;
}

export interface UserSubscription {
    id: number;
    plan_id: number;
    start_date: string;
    end_date: string;
    is_active: number;
}

// Must match UserProfileResponse from the backend 1:1
export interface UserProfile {
    id: number;
    user_id: number;
    bio: string | null;
    fitness_goals: string | null;
    profile_picture_url: string | null;
}

export interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    roles: Role[];
    subscriptions: UserSubscription[]; // <-- Dodali smo pretplate
    profile: UserProfile | null; // <-- Bio, goals and picture (null for older accounts)
}

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    // --- USER PROFILE (React Query) ---
    // queryKey ['userProfile'] is the shared cache key other pages (e.g. Dashboard,
    // after a successful Stripe checkout) invalidate to force a refetch of the
    // user's subscription status without a full page reload.
    const {
        data: user,
        isLoading: loading,
        isError: userFetchFailed,
    } = useQuery<User>({
        queryKey: ["userProfile"],
        queryFn: async () => {
            const res = await api.get<User>("/users/me");
            return res.data;
        },
        retry: false,
    });

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Za mobilni meni

    // --- USER MENU (avatar in the top right corner) ---
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Close the menu on a click outside or on Escape, like every other site does
    useEffect(() => {
        if (!isUserMenuOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsUserMenuOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isUserMenuOpen]);

    // --- DARK MODE LOGIKA ---
    const [isDark, setIsDark] = useState(() => {
        const savedTheme = localStorage.getItem("theme");
        return savedTheme ? savedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    });

    useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } else {
            root.classList.remove("dark");
            localStorage.setItem("theme", "light");
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(!isDark);
    // ------------------------

    // If the session cookie is missing/expired, /users/me fails — bounce to login.
    // (The axios 401 interceptor also handles this globally, but we cover the
    // non-401 error case here too, e.g. network failure.)
    useEffect(() => {
        if (userFetchFailed) {
            console.error("Failed to fetch user, redirecting to login.");
            navigate("/login");
        }
    }, [userFetchFailed, navigate]);

    const handleLogout = async () => {
        try {
            await api.post("/users/logout");
        } catch (err) {
            console.error("Logout request failed, clearing local session anyway.", err);
        } finally {
            // Logging out is a client-side navigate, NOT a reload, so nothing throws
            // the cache away on its own: every query would sit in the QueryCache for
            // the default 5 minute gcTime, and with staleTime 30s (main.tsx) the next
            // person to sign in on this machine would see the previous user's data
            // rendered from cache before any refetch. clear() is the whole cache, not
            // just ["userProfile"] - a worker's member list is just as sensitive.
            queryClient.clear();

            // localStorage survives everything, so the QR token and the plan draft
            // have to be removed by hand. "theme" is left alone on purpose.
            clearUserScopedStorage();

            navigate("/login");
        }
    };


    // Close the mobile menu on navigation. Adjusted directly during render
    // (React's documented pattern for "reset state when a prop changes")
    // instead of inside an effect, so the reset takes effect before paint
    // rather than causing an extra render pass.
    const [prevPathname, setPrevPathname] = useState(location.pathname);
    if (location.pathname !== prevPathname) {
        setPrevPathname(location.pathname);
        setIsMobileMenuOpen(false);
        setIsUserMenuOpen(false);
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 transition-colors duration-200">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user) return null;


    const roles = user.roles.map(r => r.name);
    const isMember = roles.includes("member");
    const isAdmin = roles.includes("admin");
    const isTrainer = roles.includes("trainer");
    const isWorker = roles.includes("worker");


    const now = new Date();
    const hasActiveSubscription = user.subscriptions?.some(
        sub => sub.is_active === 1 && new Date(sub.end_date) > now
    );

    const navLinkClass = (path: string) =>
        `block px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            location.pathname === path
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white"
        }`;

    return (
        <div className="min-h-screen flex bg-gray-50 dark:bg-slate-950 transition-colors duration-200">

            {/* OVERLAY ZA MOBILNI (Zatamnjuje pozadinu kad je meni otvoren) */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>
            )}

            {/* SIDEBAR */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col transition-transform duration-300 md:static md:translate-x-0 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>

                {/* Logo i Status Članarine */}
                <div className="p-6 border-b border-gray-100 dark:border-slate-800/50">
                    <h1 className="text-2xl font-black text-blue-600 dark:text-blue-500 tracking-tighter mb-4">
                        FitPass<span className="text-gray-900 dark:text-white">Clone</span>
                    </h1>

                    <Link to="/profile" className="flex items-center gap-3 group">
                        <Avatar profile={user.profile} firstName={user.first_name} size="sm" />
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {user.first_name} {user.last_name}
                            </span>
                            {/* BEDŽ ZA STATUS ČLANARINE */}
                            {isMember ? (
                                hasActiveSubscription ? (
                                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full mt-0.5 w-fit">
                                        🟢 Active Pass
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 px-2 py-0.5 rounded-full mt-0.5 w-fit">
                                        🔴 No Access
                                    </span>
                                )
                            ) : (
                                <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full mt-0.5 w-fit">
                                    Staff Account
                                </span>
                            )}
                        </div>
                    </Link>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
                    <div>
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Main</p>
                        <Link to="/dashboard" className={navLinkClass("/dashboard")}>Dashboard</Link>
                    </div>

                    {isMember && (
                        <div>
                            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Member</p>
                            <Link to="/subscriptions" className={navLinkClass("/subscriptions")}>Subscriptions</Link>
                            <Link to="/workouts" className={navLinkClass("/workouts")}>Workouts</Link>
                            <Link to="/coaching" className={navLinkClass("/coaching")}>Find Trainer</Link>
                            <Link to="/appointments" className={navLinkClass("/appointments")}>My Appointments</Link>
                        </div>
                    )}

                    {isTrainer && (
                        <div>
                            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Trainer Panel</p>
                            <Link to="/trainer/clients" className={navLinkClass("/trainer/clients")}>My Clients</Link>
                            <Link to="/trainer/plans" className={navLinkClass("/trainer/plans")}>Workout Plans</Link>
                            <Link to="/trainer/appointments" className={navLinkClass("/trainer/appointments")}>Schedule</Link>
                        </div>
                    )}

                    {isWorker && (
                        <div>
                            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Staff</p>
                            <Link to="/worker/dashboard" className={navLinkClass("/worker/dashboard")}>Desk Panel</Link>
                            <Link
                                to="/worker/scanner"
                                className="block px-4 py-3 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-800 transition-all"
                            >
                                Turnstile Scanner
                            </Link>
                        </div>
                    )}

                    {isAdmin && (
                        <div>
                            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Admin</p>
                            <Link to="/admin/analytics" className={navLinkClass("/admin/analytics")}>Analytics</Link>
                            <Link to="/admin/plans" className={navLinkClass("/admin/plans")}>Manage Plans</Link>
                            <Link to="/admin/hr" className={navLinkClass("/admin/hr")}>HR Panel</Link>
                        </div>
                    )}
                </nav>

                <div className="p-4 border-t border-gray-200 dark:border-slate-800">
                    <button
                        onClick={() => void handleLogout()}
                        className="w-full text-left px-4 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
                    >
                        Log Out
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* TOP HEADER */}
                <header className="h-16 shrink-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 transition-colors duration-200">

                    {/* HAMBURGER DUGME (Prikazuje se samo na mobilnom) */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    <div className="md:hidden font-black text-xl text-blue-600 dark:text-blue-500 ml-2">
                        FP<span className="text-gray-900 dark:text-white">C</span>
                    </div>

                    <div className="flex-1"></div>

                    {/* DARK MODE TOGGLE DUGME */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-yellow-400 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors mr-3"
                        aria-label="Toggle Dark Mode"
                    >
                        {isDark ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        )}
                    </button>

                    {/* AVATAR + DROPDOWN MENU (top right, like on social media) */}
                    <div className="relative" ref={userMenuRef}>
                        <button
                            onClick={() => setIsUserMenuOpen(prev => !prev)}
                            aria-haspopup="menu"
                            aria-expanded={isUserMenuOpen}
                            aria-label="Open profile menu"
                            className={`rounded-full transition-all hover:ring-4 hover:ring-blue-500/20 ${
                                isUserMenuOpen ? "ring-4 ring-blue-500/30" : ""
                            }`}
                        >
                            <Avatar profile={user.profile} firstName={user.first_name} size="sm" />
                        </button>

                        {isUserMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-800 overflow-hidden z-50 origin-top-right animate-menu-pop"
                            >
                                {/* Who is logged in */}
                                <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
                                    <Avatar profile={user.profile} firstName={user.first_name} size="sm" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                            {user.first_name} {user.last_name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                                    </div>
                                </div>

                                <div className="p-2">
                                    <Link
                                        to="/profile"
                                        role="menuitem"
                                        onClick={() => setIsUserMenuOpen(false)}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        My Profile
                                    </Link>

                                    <button
                                        role="menuitem"
                                        onClick={() => void handleLogout()}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Log Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                {/* PAGE CONTENT */}
                <div className="flex-1 p-4 sm:p-6 overflow-auto">
                    {/*
                      Prosleđujemo celu user strukturu (uključujući pretplate) deci rutama.

                      The Suspense boundary sits here rather than around the whole app so
                      a lazily-loaded page swaps out only the content area - the sidebar
                      and header stay put instead of the screen going blank mid-navigation.
                    */}
                    <Suspense fallback={<RouteFallback />}>
                        <Outlet context={user} />
                    </Suspense>
                </div>
            </main>
        </div>
    );
}