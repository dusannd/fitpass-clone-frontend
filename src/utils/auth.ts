// Shared bits of the auth screens.
// Lives here rather than in Register.tsx so the reset-password screen can grade a
// password the same way the sign-up screen does.

/**
 * Scores a password from 0 (unusable) to 4 (strong).
 *
 * Deliberately a ladder, not a sum of independent points: every level has to clear
 * the one below it first. An additive score lets "AAAAAAAA" tie with "aB", because
 * length and variety count the same there. Here length is the floor, and variety
 * only lifts a password that is already long enough to be worth lifting.
 *
 * Lives outside the component because it depends on nothing but its argument -
 * rebuilding it on every keystroke would buy nothing, and keeping it out here is
 * what keeps the component itself pure.
 */
export function calculatePasswordScore(password: string): number {
    // 1. Below the minimum the form already blocks - nothing to grade yet.
    if (password.length < 6) return 0;

    // 2. Long enough to submit, short enough to brute-force.
    if (password.length < 8) return 1;

    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    // Anything that is not a letter or a digit counts. The old check listed
    // !@#$%^&* by hand and so ignored _, -, . and +, which are just as common.
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    // 3. Long, but written in a single alphabet - a dictionary word survives here.
    if (!hasLower || !hasUpper) return 2;

    // 4. Mixed case, but nothing to break the words up for a cracking dictionary.
    if (!hasNumber || !hasSpecial) return 3;

    return 4;
}

// The minimum the API enforces too (Field(min_length=6) on UserCreate and
// PasswordResetConfirm). Kept in one place so the two never drift apart.
export const MIN_PASSWORD_LENGTH = 6;

// Same shape used by Login, Register and the reset screens.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
