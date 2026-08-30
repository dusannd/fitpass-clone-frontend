import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumberField from "./NumberField";

// The bug this file exists for only appears when a PARENT holds the number and
// feeds it straight back down. Rendering NumberField on its own with a static
// prop would pass even with the original `parseInt(x) || 1` in place, because
// nothing echoes the coerced value back into the box. So every test here drives
// the real loop: state -> value -> onValueChange -> state.
//
// Named `use...`-free on purpose: this is a component, not a hook, so it does not
// trip react-hooks/rules-of-hooks.
function Harness({ min, initial, onValueChange }: { min?: number; initial: number; onValueChange?: (n: number) => void }) {
    const [value, setValue] = useState(initial);

    return (
        <>
            <NumberField
                aria-label="Sets"
                min={min}
                value={value}
                onValueChange={(next) => {
                    setValue(next);
                    onValueChange?.(next);
                }}
            />
            {/* The parent's own idea of the value, so a test can tell "the box
                looks empty" apart from "the form actually stored something". */}
            <output data-testid="committed">{String(value)}</output>
        </>
    );
}

const field = () => screen.getByLabelText("Sets") as HTMLInputElement;
const committed = () => screen.getByTestId("committed").textContent;

describe("NumberField", () => {
    it("lets the box be emptied instead of snapping back to a number", async () => {
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} />);

        await user.clear(field());

        // THE REGRESSION. With `parseInt(e.target.value) || 0` the box refills
        // with "0" the instant it is cleared, and the trainer ends up typing in
        // front of a digit that will not go away.
        expect(field().value).toBe("");
    });

    it("keeps the last good value in the form while the box is empty", async () => {
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} />);

        await user.clear(field());

        // Empty on screen, but the form still holds a real number - so a submit
        // mid-edit can never post NaN.
        expect(committed()).toBe("60");
    });

    it("types a whole number cleanly after clearing", async () => {
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} />);

        await user.clear(field());
        await user.type(field(), "90");

        // The old handler produced "090" here: the stuck 0 stayed put and the
        // new digits landed in front of it.
        expect(field().value).toBe("90");
        expect(committed()).toBe("90");
    });

    it("accepts a literal zero instead of treating it as 'nothing typed'", async () => {
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} />);

        await user.clear(field());
        await user.type(field(), "0");

        // Second bug in the same expression: 0 is falsy, so `|| 1` silently
        // replaced a deliberate zero with the fallback.
        expect(field().value).toBe("0");
        expect(committed()).toBe("0");
    });

    it("restores the previous value when you leave an empty box", async () => {
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} />);

        await user.clear(field());
        await user.tab();

        expect(field().value).toBe("60");
        expect(committed()).toBe("60");
    });

    it("clamps below-minimum input on blur, not while typing", async () => {
        const user = userEvent.setup();
        render(<Harness initial={5} min={3} />);

        await user.clear(field());
        await user.type(field(), "1");

        // Still 1 while the cursor is in the box - correcting someone mid-keystroke
        // is the behaviour this component exists to remove.
        expect(field().value).toBe("1");

        await user.tab();

        expect(field().value).toBe("3");
        expect(committed()).toBe("3");
    });

    it("never reports NaN to the parent", async () => {
        const onValueChange = vi.fn();
        const user = userEvent.setup();
        render(<Harness initial={60} min={0} onValueChange={onValueChange} />);

        await user.clear(field());
        await user.tab();

        const reported = onValueChange.mock.calls.map(([n]) => n);
        expect(reported.every((n) => Number.isFinite(n))).toBe(true);
    });

    it("follows the value when the parent resets it from the outside", async () => {
        function ResettableHarness() {
            const [value, setValue] = useState(60);
            return (
                <>
                    <NumberField aria-label="Sets" value={value} onValueChange={setValue} min={0} />
                    <button type="button" onClick={() => setValue(3)}>reset</button>
                </>
            );
        }

        const user = userEvent.setup();
        render(<ResettableHarness />);

        await user.clear(field());
        await user.type(field(), "45");
        expect(field().value).toBe("45");

        // Publishing a plan empties the whole builder, so the box has to accept a
        // value it did not produce itself.
        await user.click(screen.getByRole("button", { name: "reset" }));

        expect(field().value).toBe("3");
    });
});
