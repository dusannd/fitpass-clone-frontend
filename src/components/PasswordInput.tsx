import { useState } from "react";
import type { ChangeEvent } from "react";

// =============================================================================
// PasswordInput - a password field with an eye button that shows what you typed.
//
// On a phone keyboard a typo in a hidden field is invisible, and the only way to
// find it is to wipe the whole thing. The eye flips the input between "password"
// and "text" so you can check it before submitting.
//
// Every password field in the app goes through this one component, so they all
// look and behave the same. Each field keeps its own toggle - revealing the
// password does not reveal the confirmation next to it.
// =============================================================================

interface PasswordInputProps {
    id: string;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    // "current-password" on login, "new-password" when creating one. Password
    // managers use it to decide whether to fill in or to offer a new password.
    autoComplete: "current-password" | "new-password";

    disabled?: boolean;
    placeholder?: string;
    className?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
}

export default function PasswordInput({ className = "", disabled, ...rest }: PasswordInputProps) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input
                {...rest}
                type={visible ? "text" : "password"}
                disabled={disabled}
                // Room on the right so the text never runs under the eye button.
                className={`${className} pr-12`}
            />
            <button
                // type="button", or a tap on the eye would submit the form.
                type="button"
                onClick={() => setVisible((v) => !v)}
                disabled={disabled}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                className="absolute inset-y-0 right-0 w-12 flex items-center justify-center rounded-r-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 touch-manipulation transition-colors"
            >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {visible ? (
                        // Eye with a slash - tapping it hides the password again.
                        <>
                            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
                            <path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                            <path d="M2 2l20 20" />
                        </>
                    ) : (
                        <>
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                            <circle cx="12" cy="12" r="3" />
                        </>
                    )}
                </svg>
            </button>
        </div>
    );
}
