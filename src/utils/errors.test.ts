import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { errorDetail } from "./errors";

/** An axios error carrying whatever body the server is pretending to have sent. */
function axiosErrorWith(data: unknown): AxiosError {
    const config = { headers: new AxiosHeaders() };
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, {
        status: 400,
        statusText: "Bad Request",
        headers: new AxiosHeaders(),
        config,
        data,
    });
}

describe("errorDetail", () => {
    it("returns the backend detail string", () => {
        expect(errorDetail(axiosErrorWith({ detail: "Token has expired." }), "fallback")).toBe(
            "Token has expired.",
        );
    });

    it("falls back when the request never reached the server", () => {
        const networkError = new AxiosError("Network Error", "ERR_NETWORK");
        expect(errorDetail(networkError, "Could not reach the server.")).toBe(
            "Could not reach the server.",
        );
    });

    it("falls back when detail is a validation array rather than a string", () => {
        // FastAPI answers a 422 with a list of error objects under the same key.
        // Rendering that straight would put "[object Object]" in front of the user.
        const err = axiosErrorWith({ detail: [{ loc: ["body", "email"], msg: "invalid" }] });
        expect(errorDetail(err, "Please check the form.")).toBe("Please check the form.");
    });

    it("falls back for anything that is not an axios error at all", () => {
        expect(errorDetail(new Error("boom"), "Something went wrong.")).toBe("Something went wrong.");
    });
});
