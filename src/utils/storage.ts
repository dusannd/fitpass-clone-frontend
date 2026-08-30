/**
 * The localStorage keys that belong to the signed-in user, and the one helper that
 * clears them.
 *
 * Both keys are written by a page (Dashboard, TrainerPlans) but have to be cleared
 * from somewhere else entirely - Layout on logout, the axios interceptor on a 401 -
 * so they live here rather than in the page that owns them. Importing them out of a
 * page module instead would pull that page's code into the main bundle and undo the
 * route-level code splitting.
 */

// Dashboard's turnstile QR: the token itself, its expiry and the 30s cooldown.
export const QR_STATE_KEY = "fitpass_qr_state";

// TrainerPlans mirrors the plan builder here on every keystroke.
export const WORKOUT_DRAFT_KEY = "workout_plan_draft";

/**
 * Drops everything tied to whoever was signed in.
 *
 * Deliberately NOT localStorage.clear(): "theme" is a preference of the machine, not
 * of the account, and wiping it would flip the next person back to light mode in the
 * middle of the night. Listing the keys means a new one has to be added here on
 * purpose, which is the point.
 */
export function clearUserScopedStorage(): void {
    localStorage.removeItem(QR_STATE_KEY);
    localStorage.removeItem(WORKOUT_DRAFT_KEY);
}
