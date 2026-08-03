import { useState, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { api } from "../api/axios";

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
    const [extraInfo, setExtraInfo] = useState(""); // HONEYPOT FIELD

    // --- UI STATE ---
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // --- RESEND VERIFICATION STATE ---
    const [isResending, setIsResending] = useState(false);
    const [resendMessage, setResendMessage] = useState("");

    // --- VALIDATION & STRENGTH STATE ---
    const [validationErrors, setValidationErrors] = useState({ email: "", password: "", name: "" });
    const [passwordScore, setPasswordScore] = useState(0);

    // reCAPTCHA Reference
    const recaptchaRef = useRef<ReCAPTCHA>(null);



    // --- PASSWORD STRENGTH LOGIC ---
    const calculateStrength = (pass: string) => {
        let score = 0;
        if (!pass) return 0;
        if (pass.length >= 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[a-z]/.test(pass)) score += 1;
        if (/[0-9!@#$%^&*]/.test(pass)) score += 1;
        return score;
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setPassword(val);
        setPasswordScore(calculateStrength(val));
        if (validationErrors.password) setValidationErrors({ ...validationErrors, password: "" });
    };

    // --- CLIENT-SIDE VALIDATION ---
    const validateForm = () => {
        let isValid = true;
        const errors = { email: "", password: "", name: "" };

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

        setValidationErrors(errors);
        return isValid;
    };

    // --- HANDLE FORM SUBMIT ---
    const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");

        if (!validateForm()) return;

        setIsLoading(true);

        try {
            let recaptchaToken = null;

            if (FEATURE_RECAPTCHA && recaptchaRef.current) {
                recaptchaToken = await recaptchaRef.current.executeAsync();
                recaptchaRef.current.reset();
            }

            // Send to our bulletproof backend!
            await api.post("/users/", {
                email,
                password,
                first_name: firstName,
                last_name: lastName,
                extra_info: extraInfo, // Honeypot
                recaptcha_token: recaptchaToken // reCAPTCHA
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
                        {password.length > 0 && (
                            <div className="mt-3">
                                <div className="flex gap-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-300 ${passwordScore >= 1 ? 'w-1/4 bg-red-500' : 'w-0'}`}></div>
                                    <div className={`h-full transition-all duration-300 ${passwordScore >= 2 ? 'w-1/4 bg-orange-400' : 'w-0'}`}></div>
                                    <div className={`h-full transition-all duration-300 ${passwordScore >= 3 ? 'w-1/4 bg-yellow-400' : 'w-0'}`}></div>
                                    <div className={`h-full transition-all duration-300 ${passwordScore >= 4 ? 'w-1/4 bg-green-500' : 'w-0'}`}></div>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1.5 text-right">
                                    {passwordScore === 0 ? "" : passwordScore === 1 ? "Weak" : passwordScore === 2 ? "Fair" : passwordScore === 3 ? "Good" : "Strong"}
                                </p>
                            </div>
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