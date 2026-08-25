import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axios";
import { errorDetail } from "../utils/errors";

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token"); // Extracts "?token=..." from the URL

    // --- 1. THE VERIFICATION CALL ---
    // The token is passed through `params` rather than glued into the string, so a
    // token containing & or # cannot truncate the query on the way out.
    const { data, error, isPending } = useQuery({
        queryKey: ["verify-email", token],
        queryFn: async () => {
            const response = await api.get<{ message?: string }>("/users/verify-email", {
                params: { token },
            });
            return response.data;
        },
        // No token in the URL means there is nothing to ask the backend about.
        enabled: !!token,
        // An expired or already-used token is a permanent answer. Retrying it just
        // makes the user watch a spinner before the same failure arrives.
        retry: false,
    });

    // --- 2. WHICH OF THE THREE SCREENS TO SHOW ---
    // Order matters. A missing token has to be checked first: with `enabled: false`
    // the query never runs, so isPending would otherwise stay true forever and the
    // page would spin on a broken link instead of explaining what is wrong.
    const status = !token
        ? "error"
        : isPending
          ? "loading"
          : error
            ? "error"
            : "success";

    const message = !token
        ? "No verification token found in URL."
        : error
          ? errorDetail(error, "Verification failed. Link may be expired.")
          : (data?.message ?? "Email successfully verified!");

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
