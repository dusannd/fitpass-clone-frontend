import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";

// A component whose only job is to blow up during render.
function Boom(): never {
    throw new Error("kaboom");
}

// The whole tree the boundary is meant to protect, wired the way main.tsx wires it:
// boundary INSIDE the router, so the ErrorPage fallback can call its router hooks.
function renderTree(initialPath: string) {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <ErrorBoundary>
                <Routes>
                    <Route path="/crash" element={<Boom />} />
                    <Route path="/dashboard" element={<p>Dashboard rendered fine</p>} />
                </Routes>
            </ErrorBoundary>
        </MemoryRouter>,
    );
}

describe("ErrorBoundary", () => {
    beforeEach(() => {
        // React prints the caught error and a component stack on its own. Silence it
        // so a passing run is not full of red noise. restoreMocks puts it back.
        vi.spyOn(console, "error").mockImplementation(() => {});

        // jsdom ships no window.matchMedia, and ErrorPage reads it in its standalone
        // theme effect. Without this the effect throws, the boundary catches ITS OWN
        // fallback, re-renders it, and loops until React bails out with "Maximum
        // update depth exceeded" - so the missing stub looks exactly like a bug in
        // the boundary. restoreMocks does not undo stubGlobal, hence the afterEach.
        vi.stubGlobal(
            "matchMedia",
            vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders the 500 page instead of a blank screen when a child throws", () => {
        renderTree("/crash");

        expect(screen.getByText("500")).toBeInTheDocument();
        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("logs the error so it is not swallowed", () => {
        renderTree("/crash");

        // componentDidCatch runs with our own prefix; React's own logging is separate.
        expect(console.error).toHaveBeenCalledWith(
            "Uncaught render error:",
            expect.objectContaining({ message: "kaboom" }),
            expect.anything(),
        );
    });

    it("clears the error once the user navigates away", async () => {
        const user = userEvent.setup();
        renderTree("/crash");

        // The fallback offers this link. Without the resetKey wiring the boundary
        // would stay stuck on the error page and this route would never appear.
        await user.click(screen.getByRole("link", { name: "Go to Dashboard" }));

        expect(screen.getByText("Dashboard rendered fine")).toBeInTheDocument();
        expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });

    it("renders its children untouched when nothing throws", () => {
        renderTree("/dashboard");

        expect(screen.getByText("Dashboard rendered fine")).toBeInTheDocument();
        expect(screen.queryByText("500")).not.toBeInTheDocument();
    });
});
