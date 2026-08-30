import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/axios";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { MIN_PASSWORD_LENGTH } from "../utils/auth";
import { errorDetail } from "../utils/errors";

export default function ResetPassword() {
    const navigate = useNavigate();

    // The token arrives in the link we mailed out: /reset-password?token=...
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    // --- FORM STATE ---
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [validationErrors, setValidationErrors] = useState({ password: "", confirmPassword: "" });

    // --- UI STATE ---
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    // --- CLIENT-SIDE VALIDATION ---
    const validateForm = () => {
        let isValid = true;
        const errors = { password: "", confirmPassword: "" };

        if (password.length < MIN_PASSWORD_LENGTH) {
            errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
            isValid = false;
        }

        // Checked independently of the length rule, so a password that is both short
        // and mistyped reports both problems on the same submit.
        if (password !== confirmPassword) {
            errors.confirmPassword = "Passwords do not match.";
            isValid = false;
        }

        setValidationErrors(errors);
        return isValid;
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        // Editing the password can also resolve a mismatch, so clear both errors.
        if (validationErrors.password || validationErrors.confirmPassword) {
            setValidationErrors({ password: "", confirmPassword: "" });
        }
    };

    // --- SUBMIT THE NEW PASSWORD ---
    const resetPassword = useMutation({
        mutationFn: async () => {
            await api.post("/users/reset-password", {
                token,
                new_password: password,
            });
        },
        onSuccess: () => {
            setDone(true);
        },
        onError: (err: unknown) => {
            if (axios.isAxiosError(err) && err.response) {
                // The API already says exactly the right thing here - "Reset link
                // expired" and "Invalid reset link" - so pass its wording through.
                setError(errorDetail(err, "Could not reset your password. Please try again."));
            } else {
                setError("An unexpected error occurred. Is the server running?");
            }
        },
    });

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");

        if (!validateForm()) return;

        resetPassword.mutate();
    };

    // --- NO TOKEN: THE LINK WAS TRUNCATED OR TYPED BY HAND ---
    // Rendered instead of the form, because a form that cannot possibly succeed is
    // worse than an explanation of why.
    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
                <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center">
                    <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                        <span className="text-3xl">🔗</span>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Reset link is incomplete</h2>
                    <p className="text-gray-600 mb-6 text-sm">
                        This page needs the token from your reset email. Mail clients sometimes
                        cut long links in half - try copying the whole address, or request a new one.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="block w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition shadow-sm"
                    >
                        Request a New Link
                    </Link>
                </div>
            </div>
        );
    }

    // --- SUCCESS SCREEN ---
    if (done) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
                <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 text-center">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <span className="text-3xl">🔐</span>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Password updated</h2>
                    <p className="text-gray-600 mb-6 text-sm">
                        You can now sign in with your new password.
                    </p>
                    <button
                        onClick={() => navigate("/login")}
                        className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition shadow-sm"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    // --- RESET FORM ---
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Set a New Password</h2>
                    <p className="text-sm text-gray-500 mt-2">Choose something you have not used before.</p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium flex flex-col gap-2" role="alert">
                        <span>{error}</span>
                        <Link
                            to="/forgot-password"
                            className="bg-red-100 hover:bg-red-200 text-red-800 py-1.5 px-3 rounded-lg font-bold text-xs transition self-start"
                        >
                            Request a New Link
                        </Link>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                    {/* NEW PASSWORD WITH STRENGTH METER */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1.5">New Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={handlePasswordChange}
                            disabled={resetPassword.isPending}
                            aria-invalid={!!validationErrors.password}
                            className={`w-full border ${validationErrors.password ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
                        />
                        {validationErrors.password && <p className="text-red-500 text-xs font-bold mt-1">{validationErrors.password}</p>}

                        {/* STRENGTH METER UI */}
                        <PasswordStrengthMeter password={password} />
                    </div>

                    {/* CONFIRM PASSWORD */}
                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-bold text-gray-700 mb-1.5">Confirm New Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                if (validationErrors.confirmPassword) setValidationErrors({ ...validationErrors, confirmPassword: "" });
                            }}
                            disabled={resetPassword.isPending}
                            aria-invalid={!!validationErrors.confirmPassword}
                            className={`w-full border ${validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            placeholder="Repeat your new password"
                        />
                        {validationErrors.confirmPassword && <p className="text-red-500 text-xs font-bold mt-1">{validationErrors.confirmPassword}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={resetPassword.isPending}
                        className="w-full bg-blue-600 text-white font-black py-3.5 px-4 rounded-xl hover:bg-blue-700 transition shadow-sm mt-2 disabled:opacity-50 flex justify-center items-center"
                    >
                        {resetPassword.isPending ? "Updating..." : "Update Password"}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500 font-medium">
                    Changed your mind?{" "}
                    <Link to="/login" className="text-blue-600 font-bold hover:text-blue-800 transition">
                        Sign In here
                    </Link>
                </div>
            </div>
        </div>
    );
}
