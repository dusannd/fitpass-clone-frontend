import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api/axios";

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token"); // Extracts "?token=..." from the URL

    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            setMessage("No verification token found in URL.");
            return;
        }

        // Call the backend to verify the token
        const verifyAccount = async () => {
            try {
                const response = await api.get(`/users/verify-email?token=${token}`);
                setStatus("success");
                setMessage(response.data.message || "Email successfully verified!");
            } catch (err: any) {
                setStatus("error");
                setMessage(err.response?.data?.detail || "Verification failed. Link may be expired.");
            }
        };

        verifyAccount();
    }, [token]);

    return (
        <div className="flex h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md text-center">

                {status === "loading" && (
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Verifying...</h2>
                        <p className="text-gray-600">Please wait while we verify your email.</p>
                    </div>
                )}

                {status === "success" && (
                    <div>
                        <h2 className="text-2xl font-bold text-green-600 mb-4">Success! 🎉</h2>
                        <p className="text-gray-600 mb-6">{message}</p>
                        <Link
                            to="/login"
                            className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded hover:bg-blue-700 transition"
                        >
                            Go to Login
                        </Link>
                    </div>
                )}

                {status === "error" && (
                    <div>
                        <h2 className="text-2xl font-bold text-red-600 mb-4">Verification Failed ❌</h2>
                        <p className="text-gray-600 mb-6">{message}</p>
                        <Link
                            to="/register"
                            className="inline-block bg-gray-600 text-white font-bold py-2 px-6 rounded hover:bg-gray-700 transition"
                        >
                            Back to Registration
                        </Link>
                    </div>
                )}

            </div>
        </div>
    );
}