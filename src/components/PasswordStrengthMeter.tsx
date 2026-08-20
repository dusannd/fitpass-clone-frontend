import { calculatePasswordScore } from "../utils/auth";

interface PasswordStrengthMeterProps {
    password: string;
}

/**
 * The four-bar strength meter shown under a password field.
 *
 * Shared by Register and ResetPassword rather than copied into both - two
 * hand-maintained sets of bars drift apart the first time a label changes.
 * Scores the password itself so callers don't each have to.
 */
export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
    // Nothing typed yet means nothing to say about it.
    if (password.length === 0) return null;

    const passwordScore = calculatePasswordScore(password);

    return (
        <div className="mt-3">
            <div className="flex gap-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${passwordScore >= 1 ? 'w-1/4 bg-red-500' : 'w-0'}`}></div>
                <div className={`h-full transition-all duration-300 ${passwordScore >= 2 ? 'w-1/4 bg-orange-400' : 'w-0'}`}></div>
                <div className={`h-full transition-all duration-300 ${passwordScore >= 3 ? 'w-1/4 bg-yellow-400' : 'w-0'}`}></div>
                <div className={`h-full transition-all duration-300 ${passwordScore >= 4 ? 'w-1/4 bg-green-500' : 'w-0'}`}></div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1.5 text-right">
                {passwordScore === 0 ? "Too short" : passwordScore === 1 ? "Weak" : passwordScore === 2 ? "Fair" : passwordScore === 3 ? "Good" : "Strong"}
            </p>
        </div>
    );
}
