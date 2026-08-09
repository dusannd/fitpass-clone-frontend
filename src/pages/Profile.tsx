import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api } from "../api/axios";
import Avatar from "../components/Avatar";
import { parseGoals, getPrimaryAccent, getRoleAccent } from "../utils/profile";
import type { User, UserProfile } from "../components/Layout";

// Must match the max_length values from UserProfileBase on the backend
const BIO_MAX = 2000;
const GOALS_MAX = 255;

// The backend accepts 2MB max, we check here too so we don't upload for nothing
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export default function Profile() {
    const user = useOutletContext<User>();
    const queryClient = useQueryClient();

    const roleNames = user.roles.map(r => r.name);
    const isTrainer = roleNames.includes("trainer");
    // Trainers sell their services, members write their goals - same field, different story
    const goalsLabel = isTrainer ? "Specialties" : "Fitness Goals";

    // The ring and glow around the picture depend on the role (trainer purple, member blue...)
    const accent = getPrimaryAccent(roleNames);

    // --- FORM STATE ---
    const [bio, setBio] = useState(user.profile?.bio || "");
    const [goals, setGoals] = useState(user.profile?.fitness_goals || "");

    // --- UI STATE ---
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Preview of the picture while the upload is still running, so you instantly see what you picked
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // When the profile is refreshed from the server, pull the new values into the form.
    // We do it during render (same approach as Layout.tsx with prevPathname)
    // instead of in a useEffect, so we don't cause an extra render pass.
    const serverValues = `${user.profile?.bio ?? ""}|${user.profile?.fitness_goals ?? ""}`;
    const [prevServerValues, setPrevServerValues] = useState(serverValues);
    if (serverValues !== prevServerValues) {
        setPrevServerValues(serverValues);
        setBio(user.profile?.bio || "");
        setGoals(user.profile?.fitness_goals || "");
    }

    // Object URLs have to be released by hand, otherwise we leak memory
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // The Save button stays greyed out until you actually change something
    const isDirty =
        bio.trim() !== (user.profile?.bio || "").trim() ||
        goals.trim() !== (user.profile?.fitness_goals || "").trim();

    // Live badge preview while you type the commas
    const goalBadges = useMemo(() => parseGoals(goals), [goals]);

    const memberSince = useMemo(() => {
        const sub = user.subscriptions?.[0];
        if (!sub?.start_date) return null;
        return new Date(sub.start_date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }, [user.subscriptions]);

    // After every change we refresh the cache, same as Dashboard does after Stripe
    const refreshUser = async () => {
        await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    };

    // --- 1. SAVING THE TEXT (bio + goals) ---
    const handleSave = async () => {
        setError("");
        setSuccessMsg("");
        setIsSaving(true);

        try {
            await api.put<UserProfile>("/users/me/profile", {
                bio: bio.trim(),
                fitness_goals: goals.trim(),
            });

            await refreshUser();
            setSuccessMsg("Profile updated!");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Failed to save your profile.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setBio(user.profile?.bio || "");
        setGoals(user.profile?.fitness_goals || "");
        setError("");
    };

    // --- 2. PICTURE UPLOAD ---
    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError("");
        setSuccessMsg("");

        // Reject oversized files before we send them over the network
        if (file.size > MAX_FILE_BYTES) {
            setError("That image is larger than 2MB. Please pick a smaller one.");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        // Show a local preview right away while the upload is running
        const localPreview = URL.createObjectURL(file);
        setPreviewUrl(localPreview);
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", file);

            // Do NOT set Content-Type by hand! The browser has to add the
            // multipart boundary itself, otherwise the backend can't parse the file.
            await api.post<UserProfile>("/users/me/avatar", formData);

            await refreshUser();
            setSuccessMsg("Profile picture updated!");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Upload failed. Please try again.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            // Drop the preview and go back to the picture from the server
            setPreviewUrl(null);
            setIsUploading(false);
            // Reset the input so the SAME file can be picked again
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // --- 3. REMOVING THE PICTURE ---
    const handleRemovePhoto = async () => {
        setError("");
        setSuccessMsg("");
        setIsUploading(true);

        try {
            await api.delete("/users/me/avatar");
            await refreshUser();
            setSuccessMsg("Profile picture removed.");
            setTimeout(() => setSuccessMsg(""), 4000);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data?.detail || "Could not remove the picture.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto flex flex-col gap-6">

            {/* MAIN CARD - everything centered, no banner.
                No negative margins, so nothing overlaps the text anymore. */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 px-6 py-10 transition-colors">
                <div className="flex flex-col items-center text-center">

                    {/* AVATAR WITH THE GLOW */}
                    <div className="relative">
                        {/* Soft colored glow behind the picture. pointer-events-none so it doesn't steal the click. */}
                        <div
                            aria-hidden="true"
                            className={`absolute -inset-5 rounded-full bg-gradient-to-tr ${accent.glow} opacity-30 dark:opacity-40 blur-2xl pointer-events-none`}
                        ></div>

                        <div className="relative group">
                            <div className={`rounded-full ring-4 ${accent.ring} shadow-xl`}>
                                <Avatar
                                    profile={user.profile}
                                    firstName={user.first_name}
                                    previewUrl={previewUrl}
                                    size="xl"
                                    className={isUploading ? "opacity-50" : ""}
                                />
                            </div>

                            {/* Camera overlay */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                aria-label="Change profile picture"
                                className="absolute inset-0 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-4 focus:ring-blue-500/40 transition-opacity flex flex-col items-center justify-center disabled:cursor-not-allowed"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-[10px] font-black uppercase tracking-wider mt-1">Change</span>
                            </button>

                            {/* Spinner while the picture is uploading */}
                            {isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => void handleFileSelected(e)}
                                className="hidden"
                            />
                        </div>
                    </div>

                    {/* NAME AND EMAIL */}
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white mt-6 break-words max-w-full">
                        {user.first_name} {user.last_name}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all max-w-full">
                        {user.email}
                    </p>

                    {/* ROLES */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                        {user.roles.map(role => (
                            <span
                                key={role.id}
                                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${getRoleAccent(role.name).badge}`}
                            >
                                {role.name}
                            </span>
                        ))}
                    </div>

                    {memberSince && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-3">
                            Member since {memberSince}
                        </p>
                    )}

                    {/* PICTURE ACTIONS */}
                    <div className="flex items-center gap-4 mt-6">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
                        >
                            {isUploading ? "Uploading..." : "Change photo"}
                        </button>

                        {user.profile?.profile_picture_url && (
                            <>
                                <span className="h-3 w-px bg-gray-300 dark:bg-slate-700"></span>
                                <button
                                    type="button"
                                    onClick={() => void handleRemovePhoto()}
                                    disabled={isUploading}
                                    className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                                >
                                    Remove photo
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* PORUKE */}
            {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl font-bold text-sm border border-emerald-200 dark:border-emerald-800 transition-colors">
                    ✅ {successMsg}
                </div>
            )}
            {error && (
                <div className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 p-4 rounded-xl font-bold text-sm border border-rose-200 dark:border-rose-800 transition-colors" role="alert">
                    ❌ {error}
                </div>
            )}

            {/* FORMA ZA BIO I CILJEVE */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6 transition-colors">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">About You</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    {isTrainer
                        ? "This is what members see when they browse for a personal trainer."
                        : "Your trainer sees this when deciding whether to accept your request."}
                </p>

                <div className="flex flex-col gap-6">
                    {/* BIO */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label htmlFor="bio" className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                Bio
                            </label>
                            <span className={`text-xs font-bold tabular-nums ${
                                bio.length > BIO_MAX ? "text-rose-500" : "text-gray-400 dark:text-gray-500"
                            }`}>
                                {bio.length} / {BIO_MAX}
                            </span>
                        </div>
                        <textarea
                            id="bio"
                            rows={5}
                            value={bio}
                            maxLength={BIO_MAX}
                            onChange={(e) => setBio(e.target.value)}
                            disabled={isSaving}
                            placeholder={isTrainer
                                ? "Certified strength coach with 8 years of experience helping people get stronger..."
                                : "Tell your trainer a bit about yourself, your experience level and your schedule..."}
                            className="w-full border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-y disabled:opacity-50"
                        />
                    </div>

                    {/* CILJEVI / SPECIJALNOSTI */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label htmlFor="goals" className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                {goalsLabel}
                            </label>
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                                Separate with commas
                            </span>
                        </div>
                        <input
                            id="goals"
                            type="text"
                            value={goals}
                            maxLength={GOALS_MAX}
                            onChange={(e) => setGoals(e.target.value)}
                            disabled={isSaving}
                            placeholder={isTrainer
                                ? "Strength training, Powerlifting, Nutrition"
                                : "Lose weight, Build muscle, Run a 5k"}
                            className="w-full border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                        />

                        {/* Live badge preview */}
                        {goalBadges.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {goalBadges.map((goal, i) => (
                                    <span
                                        key={`${goal}-${i}`}
                                        className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                                    >
                                        {goal}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* AKCIJE */}
                    <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-slate-800">
                        <button
                            onClick={() => void handleSave()}
                            disabled={!isDirty || isSaving}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-8 rounded-xl transition-all shadow-sm mt-4 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                        {isDirty && !isSaving && (
                            <button
                                onClick={handleCancel}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-bold py-3 px-6 rounded-xl transition-colors mt-4"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
