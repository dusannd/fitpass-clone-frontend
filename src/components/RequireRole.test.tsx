import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useOutletContext } from "react-router-dom";
import RequireRole from "./RequireRole";
import type { User } from "./Layout";

// --- FIXTURE ---
// Must mirror the User interface exported from Layout.tsx, which in turn mirrors the
// backend schema. Roles arrive as objects, not strings, which is exactly the detail a
// hand-written mock tends to get wrong.
const makeUser = (roleNames: string[]): User => ({
    id: 7,
    email: "member@example.com",
    first_name: "Ana",
    last_name: "Jovic",
    roles: roleNames.map((name, i) => ({ id: i + 1, name })),
    subscriptions: [],
    profile: null,
});

/**
 * The page behind the gate. It reads the outlet context itself, so it doubles as the
 * proof that RequireRole keeps passing the user down instead of swallowing it.
 */
function ProtectedPage() {
    const user = useOutletContext<User>();

    return <div data-testid="protected-content">Welcome {user.email}</div>;
}

/**
 * Renders the real route tree from App.tsx: Layout owns the user and hands it to the
 * outlet, RequireRole sits in the middle, the page sits at the bottom.
 *
 * Nothing is mocked here on purpose. Mocking useOutletContext would mock away the very
 * wiring this component exists to perform.
 */
const renderGate = (roleNames: string[], allowed: string[]) =>
    render(
        <MemoryRouter initialEntries={["/admin/hr"]}>
            <Routes>
                {/* Stands in for <Layout />, which does exactly this on line 377. */}
                <Route element={<Outlet context={makeUser(roleNames)} />}>
                    <Route element={<RequireRole allowed={allowed} />}>
                        <Route path="/admin/hr" element={<ProtectedPage />} />
                    </Route>
                </Route>
            </Routes>
        </MemoryRouter>,
    );

describe("RequireRole", () => {
    // --- 1. DENIED ---
    it("shows the 403 page instead of the route when the role is missing", () => {
        renderGate(["member"], ["admin"]);

        expect(screen.getByText("Access denied")).toBeInTheDocument();
        expect(screen.getByText("403")).toBeInTheDocument();
        expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });

    it("names the required role in the 403 message", () => {
        renderGate(["member"], ["admin"]);

        expect(screen.getByText(/reserved for the admin role/i)).toBeInTheDocument();
    });

    it("denies a user holding no roles at all", () => {
        renderGate([], ["admin"]);

        expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });

    // --- 2. GRANTED ---
    it("renders the route when the user holds the role", () => {
        renderGate(["admin"], ["admin"]);

        expect(screen.getByTestId("protected-content")).toBeInTheDocument();
        expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
    });

    // A user can hold several roles at once - one match is enough.
    it("lets a multi-role user through on any one match", () => {
        renderGate(["member", "trainer", "admin"], ["admin"]);

        expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    // A section open to two roles, like the worker desk.
    it("accepts either role when the gate allows several", () => {
        renderGate(["worker"], ["worker", "admin"]);

        expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    it("matches role names exactly, not by prefix", () => {
        renderGate(["admin_assistant"], ["admin"]);

        expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });

    // --- 3. THE CONTEXT HAND-OFF ---
    // Every page below the gate calls useOutletContext<User>(). Dropping `context`
    // from the <Outlet /> inside RequireRole would crash all of them at once, and this
    // is the only assertion that notices.
    it("keeps passing the user down to the page it unlocks", () => {
        renderGate(["admin"], ["admin"]);

        expect(screen.getByText("Welcome member@example.com")).toBeInTheDocument();
    });
});
