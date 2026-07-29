import { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/axios";
import type { User } from "../components/Layout";

export default function Dashboard() {
    const user = useOutletContext<User>();

    const isMember = user.roles.some(r => r.name === "member");
    const isWorker = user.roles.some(r => r.name === "worker");
    const isTrainer = user.roles.some(r => r.name === "trainer");

    const [qrToken, setQrToken] = useState<string>("");
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [error, setError] = useState("");

    // Safe useEffect that encapsulates the fetching logic and timer
    useEffect(() => {
        if (!isMember) return;

        let isMounted = true;

        const fetchQr = async () => {
            try {
                const res = await api.get("/access/qr-token");
                if (isMounted) {
                    setQrToken(res.data.qr_token);
                    setTimeLeft(res.data.expires_in_seconds || 60);
                    setError("");
                }
            } catch {
                if (isMounted) {
                    setError("Failed to generate access token. Do you have an active subscription?");
                }
            }
        };

        // Initial fetch on component mount
        void fetchQr();

        // Set up the interval for countdown
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    void fetchQr();
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            isMounted = false;
            clearInterval(timer);
        };
    }, [isMember]);

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* WELCOME BANNER */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors duration-200">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2 transition-colors">
                    Welcome back, {user.first_name}! 👋
                </h1>
                <p className="text-gray-600 dark:text-slate-400 transition-colors">
                    Your privileges: <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">{user.roles.map(r => r.name).join(", ")}</span>
                </p>
            </div>

            {/* MEMBER SECTION - DYNAMIC QR CODE */}
            {isMember && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-8 justify-center text-center md:text-left transition-colors duration-200">
                    <div className="flex-1">
                        <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-2 transition-colors">Gym Access</h2>
                        <p className="text-gray-600 dark:text-slate-400 mb-6 transition-colors">
                            Scan this QR code at the turnstile to enter the gym.
                            The code automatically refreshes for security.
                        </p>
                        {error ? (
                            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl font-bold border border-red-200 dark:border-red-800 transition-colors">
                                {error}
                            </div>
                        ) : (
                            <div className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-4 py-2 rounded-full font-bold text-sm border border-blue-100 dark:border-blue-800 transition-colors">
                                Code expires in: <span className="text-red-600 dark:text-red-400 text-lg">{timeLeft}s</span>
                            </div>
                        )}
                    </div>

                    {/* QR CODE RENDERER */}
                    {!error && qrToken && (
                        <div className="bg-white dark:bg-slate-100 p-4 rounded-2xl shadow-md border-4 border-gray-100 dark:border-slate-700 transition-colors">
                            <QRCodeSVG value={qrToken} size={200} />
                        </div>
                    )}
                </div>
            )}

            {/* QUICK LINKS FOR STAFF */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isWorker && (
                    <Link to="/worker/dashboard" className="bg-gradient-to-br from-gray-800 to-gray-900 dark:from-slate-800 dark:to-slate-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-slate-800">
                        <h3 className="font-bold text-lg mb-1">Desk Worker Panel</h3>
                        <p className="text-gray-300 text-sm">Verify user statuses and manually open doors.</p>
                    </Link>
                )}
                {isTrainer && (
                    <Link to="/trainer/clients" className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-700 dark:to-blue-950 text-white rounded-2xl p-6 shadow-sm hover:shadow-md transition border border-transparent dark:border-blue-900">
                        <h3 className="font-bold text-lg mb-1">My Clients</h3>
                        <p className="text-blue-100 text-sm">Manage pending coaching requests and active clients.</p>
                    </Link>
                )}
            </div>
        </div>
    );
}