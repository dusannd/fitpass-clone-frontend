import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import PasswordInput from "./PasswordInput";

// A real controlled parent, the same way the pages use it, inside a real form
// so the "does the eye submit the form" question gets a real answer.
function Harness({ onSubmit }: { onSubmit: () => void }) {
    const [value, setValue] = useState("hunter2");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <label htmlFor="pw">Password</label>
            <PasswordInput id="pw" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} />
        </form>
    );
}

describe("PasswordInput", () => {
    it("starts hidden and toggles visibility from the eye button", () => {
        render(<Harness onSubmit={vi.fn()} />);
        const input = screen.getByLabelText("Password");

        expect(input).toHaveAttribute("type", "password");

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));
        expect(input).toHaveAttribute("type", "text");
        expect(input).toHaveValue("hunter2");

        const hide = screen.getByRole("button", { name: "Hide password" });
        expect(hide).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(hide);
        expect(input).toHaveAttribute("type", "password");
    });

    it("does not submit the surrounding form", () => {
        const onSubmit = vi.fn();
        render(<Harness onSubmit={onSubmit} />);

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
