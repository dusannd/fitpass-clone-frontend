import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import type { AxiosResponse } from "axios";
import Login from "./Login";
import { api } from "../api/axios";

// --- HELPERS ---

/**
 * Renders the login screen inside a real router, with a marker page at /dashboard.
 * A successful login navigates there, so finding the marker is how we prove the
 * redirect happened - no need to mock useNavigate.
 */
const renderLogin = (initialEntry = "/login") =>
    render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<h1>Dashboard</h1>} />
                <Route path="/forgot-password" element={<h1>Forgot</h1>} />
                <Route path="/register" element={<h1>Register</h1>} />
            </Routes>
        </MemoryRouter>,
    );

/** A rejection shaped the way axios shapes one, so axios.isAxiosError() accepts it. */
const axiosFailure = (
    status: number,
    data: unknown = {},
    headers: Record<string, string> = {},
) => {
    const response = { status, statusText: "", data, headers } as AxiosResponse;

    return new AxiosError("Request failed", String(status), undefined, undefined, response);
};

const fields = () => ({
    email: screen.getByLabelText(/email address/i),
    password: screen.getByLabelText(/^password$/i),
    submit: screen.getByRole("button", { name: /sign in/i }),
});

describe("Login", () => {
    let postSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Every test decides what the call does; none of them may reach the network.
        // restoreMocks in vite.config.ts puts the real method back afterwards.
        postSpy = vi.spyOn(api, "post");
    });

    // --- 1. LOCAL VALIDATION ---
    // The point of validating here is to spare the API the request entirely, so the
    // assertion that matters is the one about api.post NOT being called.
    it("blocks an empty submit locally without calling the API", async () => {
        const user = userEvent.setup();
        renderLogin();

        await user.click(fields().submit);

        expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
        expect(screen.getByText("Password must be at least 6 characters long.")).toBeInTheDocument();
        expect(postSpy).not.toHaveBeenCalled();
    });

    it("rejects a malformed address and a short password", async () => {
        const user = userEvent.setup();
        renderLogin();

        await user.type(fields().email, "member@example"); // no TLD
        await user.type(fields().password, "12345"); // one short of the minimum
        await user.click(fields().submit);

        expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();
        expect(screen.getByText("Password must be at least 6 characters long.")).toBeInTheDocument();
        expect(postSpy).not.toHaveBeenCalled();
    });

    it("clears the error of the field being edited and leaves the other one", async () => {
        const user = userEvent.setup();
        renderLogin();

        await user.click(fields().submit);
        expect(await screen.findByText("Please enter a valid email address.")).toBeInTheDocument();

        await user.type(fields().email, "m");

        expect(screen.queryByText("Please enter a valid email address.")).not.toBeInTheDocument();
        expect(screen.getByText("Password must be at least 6 characters long.")).toBeInTheDocument();
    });

    // --- 2. THE HAPPY PATH ---
    it("posts the credentials and redirects to the dashboard", async () => {
        const user = userEvent.setup();
        postSpy.mockResolvedValue({ data: {} } as AxiosResponse);
        renderLogin();

        await user.type(fields().email, "member@example.com");
        await user.type(fields().password, "correct-horse");
        await user.click(fields().submit);

        expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

        expect(postSpy).toHaveBeenCalledTimes(1);
        expect(postSpy).toHaveBeenCalledWith("/users/login", {
            email: "member@example.com",
            password: "correct-horse",
            // The honeypot stays empty for a human, and reCAPTCHA is off in this suite.
            extra_info: "",
            recaptcha_token: null,
        });
    });

    // --- 3. SERVER ERRORS ---
    it("shows a generic message on 401 and stays on the form", async () => {
        const user = userEvent.setup();
        postSpy.mockRejectedValue(axiosFailure(401, { detail: "Incorrect password" }));
        renderLogin();

        await user.type(fields().email, "member@example.com");
        await user.type(fields().password, "wrong-password");
        await user.click(fields().submit);

        // Deliberately vague: telling an attacker which half was wrong is a gift.
        expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
    });

    it("offers to resend the verification link on 403", async () => {
        const user = userEvent.setup();
        postSpy.mockRejectedValue(axiosFailure(403, { detail: "Email not verified" }));
        renderLogin();

        await user.type(fields().email, "member@example.com");
        await user.type(fields().password, "correct-horse");
        await user.click(fields().submit);

        expect(await screen.findByText(/email is not verified/i)).toBeInTheDocument();

        postSpy.mockResolvedValue({ data: {} } as AxiosResponse);
        await user.click(screen.getByRole("button", { name: /resend verification link/i }));

        expect(await screen.findByText(/new verification link has been sent/i)).toBeInTheDocument();
        expect(postSpy).toHaveBeenLastCalledWith("/users/resend-verification", {
            email: "member@example.com",
        });
    });

    // --- 4. RATE LIMITING ---
    // The wait comes from the Retry-After header, never from the body: slowapi answers
    // a 429 with a message whose first number is the request count, not a number of
    // seconds to wait.
    it("reads the cooldown off Retry-After and locks the form", async () => {
        const user = userEvent.setup();
        postSpy.mockRejectedValue(
            axiosFailure(429, { error: "Rate limit exceeded: 5 per 1 minute" }, { "retry-after": "42" }),
        );
        renderLogin();

        await user.type(fields().email, "member@example.com");
        await user.type(fields().password, "correct-horse");
        await user.click(fields().submit);

        expect(await screen.findByText(/please wait 42 seconds/i)).toBeInTheDocument();

        // The button relabels itself with the countdown, so it can no longer be found
        // by its "Sign In" name - which is itself the behaviour being asserted.
        expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();

        expect(screen.getByRole("button", { name: /try again in 4[12]s/i })).toBeDisabled();
        expect(screen.getByLabelText(/email address/i)).toBeDisabled();
        expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
    });

    it("falls back to 60 seconds when Retry-After is missing or unusable", async () => {
        const user = userEvent.setup();
        postSpy.mockRejectedValue(axiosFailure(429, {}, { "retry-after": "not-a-number" }));
        renderLogin();

        await user.type(fields().email, "member@example.com");
        await user.type(fields().password, "correct-horse");
        await user.click(fields().submit);

        expect(await screen.findByText(/please wait 60 seconds/i)).toBeInTheDocument();
    });

    // --- 5. THE SESSION EXPIRED HAND-OFF ---
    // The axios interceptor redirects here with ?session=expired so the user learns
    // why they were kicked out instead of meeting a blank form.
    it("explains an expired session when the interceptor sends one over", () => {
        renderLogin("/login?session=expired");

        expect(screen.getByRole("status")).toHaveTextContent(/session expired/i);
    });

    it("shows no such notice on a normal visit", () => {
        renderLogin();

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
});
