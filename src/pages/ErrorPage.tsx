import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

// 1. Every accent is written out in full so Tailwind's scanner can see the class
//    names. Building them with string concatenation would strip them from the CSS.
const ACCENTS = {
    blue: "text-blue-600 dark:text-blue-500",
    amber: "text-amber-600 dark:text-amber-500",
    rose: "text-rose-600 dark:text-rose-500",
} as const;

export interface ErrorPageProps {
    // The big HTTP status number, e.g. "404"
    code: string;
    title: string;
    message: string;
    accent?: keyof typeof ACCENTS;
    // Standalone = rendered outside of <Layout /> (no sidebar around it),
    // so this page has to paint the full screen background itself.
    standalone?: boolean;
    // Show the URL that failed. Useful for 404, noise for anything else.
    showPath?: boolean;
    // Extra links/buttons rendered under the two default actions.
    children?: React.ReactNode;
}

export default function ErrorPage({
    code,
    title,
    message,
    accent = "blue",
    standalone = false,
    showPath = false,
    children,
}: ErrorPageProps) {
    const navigate = useNavigate();
    const location = useLocation();

    // 2. The dark class is normally set by Layout, but a standalone error page can
    //    be the very first page a visitor lands on. Apply the saved theme ourselves
    //    so a dark mode user does not get a white flash on a broken link.
    useEffect(() => {
        if (!standalone) return;

        const savedTheme = localStorage.getItem("theme");
        const isDark = savedTheme
            ? savedTheme === "dark"
            : window.matchMedia("(prefers-color-scheme: dark)").matches;

        document.documentElement.classList.toggle("dark", isDark);
    }, [standalone]);

    // 3. The actual card. Identical in both variants, only the wrapper differs.
    const content = (
        <div className="w-full max-w-lg text-center">
            <p className={`text-7xl sm:text-8xl font-black tracking-tighter ${ACCENTS[accent]}`}>
                {code}
            </p>

            <h1 className="mt-4 text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                {title}
            </h1>

            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{message}</p>

            {showPath && (
                <p className="mt-4 inline-block max-w-full truncate rounded-full bg-gray-100 dark:bg-slate-800 px-4 py-1.5 text-xs font-mono text-gray-500 dark:text-gray-400">
                    {location.pathname}
                </p>
            )}

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                    to="/dashboard"
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                >
                    Go to Dashboard
                </Link>

                <button
                    onClick={() => navigate(-1)}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                    Go Back
                </button>
            </div>

            {children}
        </div>
    );

    // 4. Inside Layout we are already sitting in a padded content area with a
    //    background, so we only center ourselves vertically.
    if (!standalone) {
        return <div className="flex min-h-[60vh] items-center justify-center">{content}</div>;
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 px-4 transition-colors duration-200">
            <h1 className="mb-10 text-2xl font-black text-blue-600 dark:text-blue-500 tracking-tighter">
                FitPass<span className="text-gray-900 dark:text-white">Clone</span>
            </h1>
            {content}
        </div>
    );
}
