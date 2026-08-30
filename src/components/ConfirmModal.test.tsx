import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmModal from "./ConfirmModal";

/**
 * Renders the dialog with both callbacks spied on, so every test can assert which of
 * the two fired. Defaults describe a destructive action, which is what every current
 * caller uses it for.
 */
const setup = (props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const view = render(
        <ConfirmModal
            isOpen
            title="Revoke this pass?"
            message="The membership is cancelled immediately."
            confirmText="Revoke pass"
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />,
    );

    return { onConfirm, onCancel, ...view };
};

describe("ConfirmModal", () => {
    // --- 1. CLOSED IS CLOSED ---
    // The callers keep one instance mounted for the whole page, so a closed dialog has
    // to leave no markup at all - not a hidden div that could still catch a click.
    it("renders nothing while isOpen is false", () => {
        const { container } = setup({ isOpen: false });

        expect(container).toBeEmptyDOMElement();
    });

    // --- 2. THE DIALOG ITSELF ---
    it("exposes its title and message to assistive tech", () => {
        setup();

        const dialog = screen.getByRole("dialog");

        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleName("Revoke this pass?");
        expect(dialog).toHaveAccessibleDescription("The membership is cancelled immediately.");
    });

    // --- 3. CONFIRMING ---
    it("calls onConfirm when the confirm button is pressed", async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel } = setup();

        await user.click(screen.getByRole("button", { name: "Revoke pass" }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    // --- 4. THE THREE WAYS OUT ---
    // Escape, the backdrop and the cancel button all mean the same thing, and none of
    // them may ever be mistaken for a yes - this is what replaced window.confirm on
    // two destructive desk actions.
    it("calls onCancel on the cancel button, Escape and a backdrop click", async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel, container } = setup();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledTimes(1);

        await user.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledTimes(2);

        // The backdrop is the sibling sitting behind the panel; it carries no role by
        // design, so this is the one place the test reaches for the DOM directly.
        const backdrop = container.querySelector("div.absolute.inset-0");
        expect(backdrop).not.toBeNull();
        await user.click(backdrop as HTMLElement);
        expect(onCancel).toHaveBeenCalledTimes(3);

        expect(onConfirm).not.toHaveBeenCalled();
    });

    // --- 5. KEYBOARD ENTRY ---
    // Without this the focus ring stays on the button behind the backdrop, and a
    // keyboard user would have to tab in blind.
    it("moves focus onto the confirm button when it opens", () => {
        setup();

        expect(screen.getByRole("button", { name: "Revoke pass" })).toHaveFocus();
    });

    // --- 6. THE NON DESTRUCTIVE VARIANT ---
    it("uses the blue accent for the primary variant and default labels", () => {
        setup({ variant: "primary", confirmText: undefined });

        expect(screen.getByRole("button", { name: "Confirm" }).className).toContain("bg-blue-600");
    });
});
