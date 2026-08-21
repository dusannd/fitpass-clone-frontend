import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PasswordStrengthMeter from "./PasswordStrengthMeter";

/**
 * Counts the bars that are actually lit.
 *
 * The four segments always exist; an inactive one is collapsed with `w-0` and a lit
 * one is `w-1/4`. Reading the class is the only handle we have here - the component
 * carries no test id on purpose, so the test does not get to reshape the markup.
 */
const litBars = (container: HTMLElement): number => {
    const track = container.querySelector("div.flex.gap-1");
    if (!track) return 0;

    return Array.from(track.children).filter((bar) =>
        bar.className.includes("w-1/4"),
    ).length;
};

describe("PasswordStrengthMeter", () => {
    // --- 1. NOTHING TYPED YET ---
    // An empty field is not a weak password, it is no password. The meter stays out
    // of the way rather than greeting the user with a red "Too short".
    it("renders nothing at all for an empty password", () => {
        const { container } = render(<PasswordStrengthMeter password="" />);

        expect(container).toBeEmptyDOMElement();
    });

    // --- 2. BELOW THE MINIMUM ---
    it("says 'Too short' with no bars lit below six characters", () => {
        const { container } = render(<PasswordStrengthMeter password="abc" />);

        expect(screen.getByText("Too short")).toBeInTheDocument();
        expect(litBars(container)).toBe(0);
    });

    // --- 3. THE LADDER, AS THE USER SEES IT ---
    it("says 'Weak' for a six character password", () => {
        const { container } = render(<PasswordStrengthMeter password="abcdef" />);

        expect(screen.getByText("Weak")).toBeInTheDocument();
        expect(litBars(container)).toBe(1);
    });

    it("says 'Fair' for a long single-case password", () => {
        const { container } = render(<PasswordStrengthMeter password="abcdefgh" />);

        expect(screen.getByText("Fair")).toBeInTheDocument();
        expect(litBars(container)).toBe(2);
    });

    it("says 'Good' for mixed case without a digit and a symbol", () => {
        const { container } = render(<PasswordStrengthMeter password="Abcdefgh" />);

        expect(screen.getByText("Good")).toBeInTheDocument();
        expect(litBars(container)).toBe(3);
    });

    it("says 'Strong' with all four bars lit for the full set", () => {
        const { container } = render(<PasswordStrengthMeter password="Abcdefg1!" />);

        expect(screen.getByText("Strong")).toBeInTheDocument();
        expect(litBars(container)).toBe(4);
    });
});
