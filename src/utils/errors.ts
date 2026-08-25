import axios from "axios";

/**
 * Pulls the backend's `detail` out of an axios error, with a readable fallback.
 *
 * FastAPI answers every failure with `{"detail": "..."}`, but three things can go
 * wrong on the way: the request may never have reached the server (no `response`
 * at all), the body may not be JSON, or `detail` may be a validation array rather
 * than a string. The typeof check covers all three - anything that is not a plain
 * string falls back rather than rendering "[object Object]" at the user.
 */
export function errorDetail(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === "string") return detail;
    }
    return fallback;
}
