import { useState, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { api } from "../api/axios";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";

// Read environment variables
const FEATURE_RECAPTCHA = import.meta.env.VITE_FEATURE_RECAPTCHA === "true";
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

export default function Register() {
    const navigate = useNavigate();

    // --- FORM STATE ---
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [extraInfo, setExtraInfo] = useState(""); // HONEYPOT FIELD

    // --- OPTIONAL PROFILE FIELDS ---
    const [bio, setBio] = useState("");
    const [fitnessGoals, setFitnessGoals] = useState("");

    // --- UI STATE ---
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // --- RESEND VERIFICATION STATE ---
    const [isResending, setIsResending] = useState(false);
    const [resendMessage, setResendMessage] = useState("");

    // --- VALIDATION & STRENGTH STATE ---
    const [validationErrors, setValidationErrors] = useState({ email: "", password: "", confirmPassword: "", name: "" });

    // reCAPTCHA Reference
    const recaptchaRef = useRef<ReCAPTCHA>(null);



    // --- PASSWORD INPUT ---
    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        // Editing the password can also resolve a mismatch, so clear both errors -
        // otherwise "Passwords do not match" lingers on a pair that now matches.
        if (validationErrors.password || validationErrors.confirmPassword) {
            setValidationErrors({ ...validationErrors, password: "", confirmPassword: "" });
        }
    };

    // --- CLIENT-SIDE VALIDATION ---
    const validateForm = () => {
        let isValid = true;
        const errors = { email: "", password: "", confirmPassword: "", name: "" };

        if (!firstName.trim() || !lastName.trim()) {
            errors.name = "First and last name are required.";
            isValid = false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.email = "Please enter a valid email address.";
            isValid = false;
        }

        if (password.length < 6) {
            errors.password = "Password must be at least 6 characters long.";
            isValid = false;
        }

        // Compared exactly as typed. Trimming here would accept a password the user
        // cannot retype, because the password field is not trimmed on submit either.
        // Checked independently of the length rule, so a password that is both short
        // and mistyped reports both problems on the same submit.
        if (password !== confirmPassword) {
            errors.confirmPassword = "Passwords do not match.";
            isValid = false;
        }

        setValidationErrors(errors);
        return isValid;
    };

    // --- HANDLE FORM SUBMIT ---
    const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");

        // --- 1. GUARD: RECAPTCHA IS TURNED ON BUT NOT CONFIGURED ---
        // The widget further down only renders when the flag AND the key are both
        // set, so an empty key leaves recaptchaRef.current null, the POST goes out
        // with no token, and the backend answers 400 "Token is missing" - which the
        // form shows verbatim and which reads to the user as an accusation. Stop
        // here instead, before the request, where we can name the real cause.
        if (FEATURE_RECAPTCHA && !SITE_KEY) {
            console.error(
                "reCAPTCHA is enabled (VITE_FEATURE_RECAPTCHA=true) but VITE_RECAPTCHA_SITE_KEY is empty. "
                + "Registration cannot succeed until the build environment provides the key."
            );
            setError("Configuration Error: reCAPTCHA is enabled but SITE_KEY is missing. Please check your build environment variables.");
            return;
        }

        if (!validateForm()) return;

        setIsLoading(true);

        try {
            // --- 2. GUARD: CONFIGURED, BUT THE WIDGET NEVER LOADED ---
            // The same silent failure from the other direction: an ad blocker or a
            // dead connection can stop Google's script, so the ref stays null even
            // though the key is fine. This one is the user's to fix, not the
            // developer's, so the message names their fix instead of an env var.
            if (FEATURE_RECAPTCHA && !recaptchaRef.current) {
                setError("Security check failed to load. Disable your ad blocker or check your connection, then refresh the page.");
                return;
            }

            let recaptchaToken = null;

            if (FEATURE_RECAPTCHA && recaptchaRef.current) {
                recaptchaToken = await recaptchaRef.current.executeAsync();
                recaptchaRef.current.reset();
            }

            // The profile is optional - if they filled in nothing, we don't send it at all
            const trimmedBio = bio.trim();
            const trimmedGoals = fitnessGoals.trim();
            const profile = (trimmedBio || trimmedGoals)
                ? { bio: trimmedBio || null, fitness_goals: trimmedGoals || null }
                : null;

            // Send to our bulletproof backend!
            await api.post("/users/", {
                email,
                password,
                first_name: firstName,
                last_name: lastName,
                extra_info: extraInfo, // Honeypot
                recaptcha_token: recaptchaToken, // reCAPTCHA
                profile // Bio + goals (can be null)
            });

            setSuccess(true);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Registration failed. Please try again.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- HANDLE RESEND VERIFICATION ---
    const handleResend = async () => {
        setIsResending(true);
        setResendMessage("");
        try {
            await api.post("/users/resend-verification", { email });
            setResendMessage("Verification email resent! Check your inbox.");
        } catch {
            setResendMessage("Failed to resend. Please try again later.");
        } finally {
            setIsResending(false);
        }
    };

    // --- RENDER SUCCESS SCREEN ---
    if (success) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-100 p-4">
                <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl text-center border border-gray-100">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <span className="text-3xl">🎉</span>
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Registration Successful!</h2>
                    <p className="text-gray-600 mb-6 text-sm">
                        We have sent a verification link to <br/>
                        <strong className="text-gray-900 text-base">{email}</strong>
                    </p>

                    {resendMessage && (
                        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm font-bold mb-6">
                            {resendMessage}
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => void handleResend()}
                            disabled={isResending}
                            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-3 px-6 rounded-xl transition disabled:opacity-50"
                        >
                            {isResending ? "Sending..." : "Resend Verification Email"}
                        </button>
                        <button
                            onClick={() => navigate("/login")}
                            className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition shadow-sm"
                        >
                            Go to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER REGISTRATION FORM ---
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Create Account</h2>
                    <p className="text-sm text-gray-500 mt-2">Join FitPass today and start your journey.</p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm font-medium" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={(e) => void handleRegister(e)} className="flex flex-col gap-4">

                    {/* HONEYPOT FIELD */}
                    <div className="opacity-0 absolute -left-[9999px]" aria-hidden="true">
                        <label htmlFor="extra_info">Leave this field empty if you are human</label>
                        <input
                            type="text"
                            id="extra_info"
                            name="extra_info"
                            tabIndex={-1}
                            value={extraInfo}
                            onChange={(e) => setExtraInfo(e.target.value)}
                        />
                    </div>

                    {/* NAMES */}
                    <div className="flex gap-4">
                        <div className="w-1/2">
                            <label htmlFor="firstName" className="block text-sm font-bold text-gray-700 mb-1.5">First Name</label>
                            <input
                                id="firstName"
                                type="text"
                                value={firstName}
                                onChange={(e) => {
                                    setFirstName(e.target.value);
                                    if (validationErrors.name) setValidationErrors({ ...validationErrors, name: "" });
                                }}
                                disabled={isLoading}
                                aria-invalid={!!validationErrors.name}
                                className={`w-full border ${validationErrors.name ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            />
                        </div>
                        <div className="w-1/2">
                            <label htmlFor="lastName" className="block text-sm font-bold text-gray-700 mb-1.5">Last Name</label>
                            <input
                                id="lastName"
                                type="text"
                                value={lastName}
                                onChange={(e) => {
                                    setLastName(e.target.value);
                                    if (validationErrors.name) setValidationErrors({ ...validationErrors, name: "" });
                                }}
                                disabled={isLoading}
                                aria-invalid={!!validationErrors.name}
                                className={`w-full border ${validationErrors.name ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            />
                        </div>
                    </div>
                    {validationErrors.name && <p className="text-red-500 text-xs font-bold mt-[-8px]">{validationErrors.name}</p>}

                    {/* EMAIL */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-1.5">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (validationErrors.email) setValidationErrors({ ...validationErrors, email: "" });
                            }}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.email}
                            className={`w-full border ${validationErrors.email ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                        />
                        {validationErrors.email && <p className="text-red-500 text-xs font-bold mt-1">{validationErrors.email}</p>}
                    </div>

                    {/* PASSWORD WITH STRENGTH METER */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={handlePasswordChange}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.password}
                            className={`w-full border ${validationErrors.password ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            placeholder="Min 6 characters"
                        />
                        {validationErrors.password && <p className="text-red-500 text-xs font-bold mt-1">{validationErrors.password}</p>}

                        {/* STRENGTH METER UI */}
                        <PasswordStrengthMeter password={password} />
                    </div>

                    {/* CONFIRM PASSWORD */}
                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-bold text-gray-700 mb-1.5">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                if (validationErrors.confirmPassword) setValidationErrors({ ...validationErrors, confirmPassword: "" });
                            }}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.confirmPassword}
                            className={`w-full border ${validationErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'} bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
                            placeholder="Repeat your password"
                        />
                        {validationErrors.confirmPassword && <p className="text-red-500 text-xs font-bold mt-1">{validationErrors.confirmPassword}</p>}
                    </div>

                    {/* OPTIONAL PROFILE (bio + goals) */}
                    <div className="border-t border-gray-100 pt-5 mt-1">
                        <div className="flex items-baseline justify-between mb-1">
                            <h3 className="text-sm font-bold text-gray-700">Tell us about yourself</h3>
                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                Optional
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">
                            Helps trainers understand your goals. You can always add this later.
                        </p>

                        <div className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="fitnessGoals" className="block text-sm font-bold text-gray-700 mb-1.5">
                                    Fitness Goals
                                </label>
                                <input
                                    id="fitnessGoals"
                                    type="text"
                                    value={fitnessGoals}
                                    maxLength={255}
                                    onChange={(e) => setFitnessGoals(e.target.value)}
                                    disabled={isLoading}
                                    placeholder="Lose weight, Build muscle"
                                    className="w-full border border-gray-300 bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">Separate with commas</p>
                            </div>

                            <div>
                                <label htmlFor="bio" className="block text-sm font-bold text-gray-700 mb-1.5">
                                    Short Bio
                                </label>
                                <textarea
                                    id="bio"
                                    rows={3}
                                    value={bio}
                                    maxLength={2000}
                                    onChange={(e) => setBio(e.target.value)}
                                    disabled={isLoading}
                                    placeholder="Complete beginner, training 3x a week after work..."
                                    className="w-full border border-gray-300 bg-gray-50 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-y"
                                />
                            </div>
                        </div>
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
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white font-black py-3.5 px-4 rounded-xl hover:bg-blue-700 transition shadow-sm mt-4 disabled:opacity-50 flex justify-center items-center"
                    >
                        {isLoading ? "Creating Account..." : "Sign Up"}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500 font-medium">
                    Already have an account?{" "}
                    <Link to="/login" className="text-blue-600 font-bold hover:text-blue-800 transition">
                        Sign In here
                    </Link>
                </div>
            </div>
        </div>
    );
}
