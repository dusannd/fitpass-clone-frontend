import axios from "axios";

/**
 * Pulls the backend's `detail` out of an axios error, with a readable fallback.
 *
 * FastAPI answers a plain failure with `{"detail": "..."}`, but a 422 answers with
 * `{"detail": [{"loc": [...], "msg": "...", ...}]}` - one object per field that failed
 * validation. Rendering that array straight would put "[object Object]" in front of the
 * user, so we reach in and take the first message; a form the user just submitted is
 * almost always wrong in one place, and the first complaint is the useful one.
 *
 * Everything else falls back: the request may never have reached the server (no
 * `response` at all), the body may not be JSON, or `detail` may be some shape we have
 * never seen. Each branch below checks the type it needs rather than trusting the body.
 */
export function errorDetail(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
        // --- 1. The common case: a plain string detail ---
        const detail: unknown = err.response?.data?.detail;
        if (typeof detail === "string") return detail;

        // --- 2. A 422 validation array: take the first entry's message ---
        if (Array.isArray(detail)) {
            const first: unknown = detail[0];
            if (first !== null && typeof first === "object" && "msg" in first) {
                const msg: unknown = (first as { msg: unknown }).msg;
                if (typeof msg === "string") return msg;
            }
        }
    }
    return fallback;
}
