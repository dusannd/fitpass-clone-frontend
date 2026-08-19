import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { api } from "../api/axios";

// Read environment variables
const FEATURE_RECAPTCHA = import.meta.env.VITE_FEATURE_RECAPTCHA === "true";
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

export default function Login() {
    const navigate = useNavigate();

    // Set by the axios 401 interceptor when it kicks a user out mid-session
    const [searchParams] = useSearchParams();
    const sessionExpired = searchParams.get("session") === "expired";

    // --- FORM STATE ---
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [extraInfo, setExtraInfo] = useState(""); // HONEYPOT FIELD

    // --- UI STATE ---
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [errorCode, setErrorCode] = useState<number | null>(null);
    const [cooldown, setCooldown] = useState(0); // For 429 Rate Limiting
    const [isResending, setIsResending] = useState(false);
    const [resendMessage, setResendMessage] = useState("");

    // --- VALIDATION STATE ---
    const [validationErrors, setValidationErrors] = useState({ email: "", password: "" });

    // reCAPTCHA Reference to manually trigger it
    const recaptchaRef = useRef<ReCAPTCHA>(null);



    // RATE LIMITING COOLDOWN TIMER: Counts down from X seconds when hit with 429
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    // --- CLIENT-SIDE VALIDATION ---
    const validateForm = () => {
        let isValid = true;
        const errors = { email: "", password: "" };

        // Basic Email Regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.email = "Please enter a valid email address.";
            isValid = false;
        }

        if (password.length < 6) {
            errors.password = "Password must be at least 6 characters long.";
            isValid = false;
        }

        setValidationErrors(errors);
        return isValid;
    };

    // --- HANDLE FORM SUBMIT ---
    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // 1. Reset states
        setError("");
        setErrorCode(null);
        setResendMessage("");

        // 2. Client-side validation check
        if (!validateForm()) return;

        // 3. Rate Limit check
        if (cooldown > 0) return;

        setIsLoading(true);

        try {
            let recaptchaToken = null;

            // 4. Trigger Invisible reCAPTCHA (if enabled)
            if (FEATURE_RECAPTCHA && recaptchaRef.current) {
                // executeAsync runs the invisible recaptcha and returns the token
                recaptchaToken = await recaptchaRef.current.executeAsync();
                recaptchaRef.current.reset(); // Reset it for future attempts
            }

            await api.post("/users/login", {
                email,
                password,
                extra_info: extraInfo,
                recaptcha_token: recaptchaToken
            });

            // 6. Success! Redirect (browser već ima cookie)
            navigate("/dashboard");

        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response) {
                const status = err.response.status;
                const detail = err.response.data?.detail || "Something went wrong.";

                setErrorCode(status);

                if (status === 401) {
                    setError("Invalid email or password.");
                } else if (status === 403) {
                    setError("Your email is not verified.");
                } else if (status === 429) {
                    // The backend sends the exact seconds left in the window as
                    // Retry-After. Don't read the body here: slowapi answers a 429
                    // with {"error": "Rate limit exceeded: 5 per 1 minute"}, so the
                    // first number in it is the request count, not a wait time.
                    const retryAfter = Number(err.response.headers["retry-after"]);
                    const sec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
                    setError(`Too many attempts. Please wait ${sec} seconds.`);
                    setCooldown(sec);
                } else {
                    setError(detail);
                }
            } else {
                setError("An unexpected error occurred. Is the server running?");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- HANDLE RESEND VERIFICATION (For 403 Errors) ---
    const handleResendVerification = async () => {
        setIsResending(true);
        setResendMessage("");
        try {
            await api.post("/users/resend-verification", { email });
            setResendMessage("A new verification link has been sent to your email!");
        } catch {
            setResendMessage("Failed to resend. Please try again later.");
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">FitPass Login</h2>
                    <p className="text-sm text-gray-500 mt-2">Welcome back! Please enter your details.</p>
                </div>

                {/* SESSION EXPIRED NOTICE (401) - hidden once a real error shows up */}
                {sessionExpired && !error && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-6 text-sm font-medium" role="status">
                        ⏱️ Your session expired. Please sign in again to continue.
                    </div>
                )}

                {/* GLOBAL ERROR MESSAGES */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium flex flex-col gap-2" role="alert">
                        <span>{error} {cooldown > 0 && <strong className="ml-1">({cooldown}s)</strong>}</span>

                        {/* Show Resend Button ONLY if error is 403 (Unverified Email) */}
                        {errorCode === 403 && (
                            <button
                                type="button"
                                onClick={handleResendVerification}
                                disabled={isResending}
                                className="bg-red-100 hover:bg-red-200 text-red-800 py-1.5 px-3 rounded-lg font-bold text-xs transition self-start disabled:opacity-50"
                            >
                                {isResending ? "Sending..." : "Resend Verification Link"}
                            </button>
                        )}
                    </div>
                )}

                {/* SUCCESS MESSAGE FOR RESEND */}
                {resendMessage && (
                    <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl mb-6 text-sm font-medium">
                        ✅ {resendMessage}
                    </div>
                )}

                <form onSubmit={(e) => void handleLogin(e)} className="flex flex-col gap-5">

                    {/* HONEYPOT FIELD: Visually hidden from real users, but screen readers/bots will see it. */}
                    <div className="opacity-0 absolute -left-[9999px]" aria-hidden="true">
                        <label htmlFor="extra_info">Leave this field empty if you are human</label>
                        <input
                            type="text"
                            id="extra_info"
                            name="extra_info"
                            tabIndex={-1} // Prevents users from Tabbing into it
                            value={extraInfo}
                            onChange={(e) => setExtraInfo(e.target.value)}
                        />
                    </div>

                    {/* EMAIL INPUT */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-1.5">
                            Email Address
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (validationErrors.email) setValidationErrors({ ...validationErrors, email: "" });
                            }}
                            disabled={isLoading || cooldown > 0}
                            aria-invalid={!!validationErrors.email}
                            aria-describedby={validationErrors.email ? "email-error" : undefined}
                            className={`w-full border ${validationErrors.email ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 transition-all`}
                            placeholder="member@example.com"
                        />
                        {/* Inline Error */}
                        {validationErrors.email && (
                            <p id="email-error" className="text-red-500 text-xs font-bold mt-1.5">
                                {validationErrors.email}
                            </p>
                        )}
                    </div>

                    {/* PASSWORD INPUT */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1.5">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (validationErrors.password) setValidationErrors({ ...validationErrors, password: "" });
                            }}
                            disabled={isLoading || cooldown > 0}
                            aria-invalid={!!validationErrors.password}
                            aria-describedby={validationErrors.password ? "password-error" : undefined}
                            className={`w-full border ${validationErrors.password ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 transition-all`}
                            placeholder="••••••••"
                        />
                        {/* Inline Error */}
                        {validationErrors.password && (
                            <p id="password-error" className="text-red-500 text-xs font-bold mt-1.5">
                                {validationErrors.password}
                            </p>
                        )}
                    </div>

                    {/* INVISIBLE RECAPTCHA */}
                    {FEATURE_RECAPTCHA && SITE_KEY && (
                        <ReCAPTCHA
                            ref={recaptchaRef}
                            size="invisible"
                            sitekey={SITE_KEY}
                        />
                    )}

                    {/* SUBMIT BUTTON */}
                    <button
                        type="submit"
                        disabled={isLoading || cooldown > 0}
                        className="w-full bg-blue-600 text-white font-black py-3.5 px-4 rounded-xl hover:bg-blue-700 hover:shadow-lg transition-all mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                {/* Loading Spinner SVG */}
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Signing in...
                            </>
                        ) : cooldown > 0 ? (
                            `Try again in ${cooldown}s`
                        ) : (
                            "Sign In"
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500 font-medium">
                    Don't have an account?{" "}
                    <Link to="/register" className="text-blue-600 font-bold hover:text-blue-800 transition">
                        Sign up for free
                    </Link>
                </div>
            </div>
        </div>
    );
}