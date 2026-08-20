import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/axios";
import { EMAIL_REGEX } from "../utils/auth";

// Read environment variables
const FEATURE_RECAPTCHA = import.meta.env.VITE_FEATURE_RECAPTCHA === "true";
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

export default function ForgotPassword() {
    // --- FORM STATE ---
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");

    // --- UI STATE ---
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // reCAPTCHA Reference
    const recaptchaRef = useRef<ReCAPTCHA>(null);

    // RATE LIMITING COOLDOWN TIMER: Counts down from X seconds when hit with 429
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    // --- REQUEST THE RESET LINK ---
    const requestReset = useMutation({
        mutationFn: async () => {
            let recaptchaToken: string | null = null;

            if (FEATURE_RECAPTCHA && recaptchaRef.current) {
                recaptchaToken = await recaptchaRef.current.executeAsync();
                recaptchaRef.current.reset();
            }

            await api.post("/users/forgot-password", {
                email,
                recaptcha_token: recaptchaToken,
            });
        },
        onSuccess: () => {
            setSent(true);
        },
        onError: (err: unknown) => {
            if (axios.isAxiosError(err) && err.response) {
                if (err.response.status === 429) {
                    // Same reasoning as Login: this endpoint is rate limited by
                    // slowapi, whose 429 body has no `detail` and no wait time in it.
                    // Retry-After carries the real number.
                    const retryAfter = Number(err.response.headers["retry-after"]);
                    const sec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 900;
                    setError(`Too many requests. Please wait ${sec} seconds.`);
                    setCooldown(sec);
                } else {
                    setError(err.response.data?.detail || "Something went wrong. Please try again.");
                }
            } else {
                setError("An unexpected error occurred. Is the server running?");
            }
        },
    });

    // --- HANDLE FORM SUBMIT ---
    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setEmailError("");

        if (cooldown > 0) return;

        // Same guard as Register: the widget only renders when the flag AND the key
        // are both set, so a missing key would send a tokenless request and the
        // backend would answer 400 as if the user were a bot.
        if (FEATURE_RECAPTCHA && !SITE_KEY) {
            console.error(
                "reCAPTCHA is enabled (VITE_FEATURE_RECAPTCHA=true) but VITE_RECAPTCHA_SITE_KEY is empty. "
                + "The reset request cannot succeed until the build environment provides the key."
            );
            setError("Configuration Error: reCAPTCHA is enabled but SITE_KEY is missing. Please check your build environment variables.");
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            setEmailError("Please enter a valid email address.");
            return;
        }

        if (FEATURE_RECAPTCHA && !recaptchaRef.current) {
            setError("Security check failed to load. Disable your ad blocker or check your connection, then refresh the page.");
            return;
        }

        requestReset.mutate();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">

                {/* --- SENT CONFIRMATION --- */}
                {sent ? (
                    <div className="text-center">
                        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                            <span className="text-3xl">📬</span>
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Check your inbox</h2>

                        {/* The backend's own wording, on purpose. It never confirms whether
                            the address is registered, and saying so here would hand an
                            attacker the account enumeration the API works to prevent. */}
                        <p className="text-gray-600 mb-6 text-sm">
                            If that email is registered, a password reset link has been sent.
                        </p>
                        <p className="text-xs text-gray-400 mb-6">
                            The link expires in 24 hours. Remember to check your spam folder.
                        </p>

                        <Link
                            to="/login"
                            className="block w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition shadow-sm"
                        >
                            Back to Login
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Forgot Password?</h2>
                            <p className="text-sm text-gray-500 mt-2">
                                Enter your email and we will send you a reset link.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium" role="alert">
                                {error} {cooldown > 0 && <strong className="ml-1">({cooldown}s)</strong>}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-1.5">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (emailError) setEmailError("");
                                    }}
                                    disabled={requestReset.isPending || cooldown > 0}
                                    aria-invalid={!!emailError}
                                    className={`w-full border ${emailError ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                                    placeholder="you@example.com"
                                />
                                {emailError && <p className="text-red-500 text-xs font-bold mt-1">{emailError}</p>}
                            </div>

                            {/* INVISIBLE RECAPTCHA */}
                            {FEATURE_RECAPTCHA && SITE_KEY && (
                                <ReCAPTCHA
                                    ref={recaptchaRef}
                                    size="invisible"
                                    sitekey={SITE_KEY}
                                />
                            )}

                            <button
                                type="submit"
                                disabled={requestReset.isPending || cooldown > 0}
                                className="w-full bg-blue-600 text-white font-black py-3.5 px-4 rounded-xl hover:bg-blue-700 transition shadow-sm mt-2 disabled:opacity-50 flex justify-center items-center"
                            >
                                {requestReset.isPending
                                    ? "Sending..."
                                    : cooldown > 0
                                        ? `Try again in ${cooldown}s`
                                        : "Send Reset Link"}
                            </button>
                        </form>

                        <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500 font-medium">
                            Remembered it?{" "}
                            <Link to="/login" className="text-blue-600 font-bold hover:text-blue-800 transition">
                                Sign In here
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
