import { useState } from "react";
import type { UserProfile } from "./Layout";

import { resolveAvatarUrl } from "../utils/profile";

type AvatarSize = "sm" | "md" | "lg" | "xl";

// Tailwind can't build class names at runtime, so we spell them out
const SIZES: Record<AvatarSize, string> = {
    sm: "h-10 w-10 text-base",
    md: "h-14 w-14 text-xl",
    lg: "h-20 w-20 text-3xl",
    xl: "h-32 w-32 text-5xl",
};

interface AvatarProps {
    profile?: UserProfile | null;
    firstName?: string | null;
    size?: AvatarSize;
    className?: string;
    /** Overrides the stored picture, used for the instant preview while uploading */
    previewUrl?: string | null;
}

export default function Avatar({ profile, firstName, size = "md", className = "", previewUrl }: AvatarProps) {
    // If the file gets deleted from disk but the DB still points at it,
    // we fall back to the initials instead of showing a broken image icon.
    const [failed, setFailed] = useState(false);

    const src = previewUrl || resolveAvatarUrl(profile?.profile_picture_url);
    const initial = firstName?.charAt(0)?.toUpperCase() || "?";

    const base = `${SIZES[size]} rounded-full shrink-0 overflow-hidden ${className}`;

    if (src && !failed) {
        return (
            <img
                src={src}
                alt={firstName ? `${firstName}'s profile picture` : "Profile picture"}
                onError={() => setFailed(true)}
                className={`${base} object-cover bg-gray-100 dark:bg-slate-800`}
            />
        );
    }

    return (
        <div
            aria-hidden="true"
            className={`${base} bg-gradient-to-br from-blue-500 to-indigo-700 text-white font-black flex items-center justify-center select-none`}
        >
            {initial}
        </div>
    );
}
