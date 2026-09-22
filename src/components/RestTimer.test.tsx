import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import RestTimer from "./RestTimer";
import { playBeep, vibrate } from "../utils/workout";

// The buzz and beep are the timer's dependencies, not what is under test here.
// Mocked so jsdom never touches Web Audio and so we can count the calls.
vi.mock("../utils/workout", () => ({
    playBeep: vi.fn(),
    vibrate: vi.fn(),
}));

const setup = (seconds = 3) => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    render(<RestTimer seconds={seconds} label="Bench Press · next: Set 2" onDone={onDone} onSkip={onSkip} />);
    return { onDone, onSkip };
};

// One tick per call, each inside act() so React flushes the state update and
// the effects that depend on it before the next second passes.
const tick = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
        act(() => {
            vi.advanceTimersByTime(1000);
        });
    }
};

describe("RestTimer", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(playBeep).mockClear();
        vi.mocked(vibrate).mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("counts down once a second", () => {
        setup(65);
        expect(screen.getByText("1:05")).toBeInTheDocument();

        tick(6);
        expect(screen.getByText("0:59")).toBeInTheDocument();
    });

    it("shows Go! at zero and buzzes and beeps exactly once", () => {
        setup(3);
        tick(3);

        expect(screen.getByText(/Go! Next set/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

        tick(2);
        expect(playBeep).toHaveBeenCalledTimes(1);
        expect(vibrate).toHaveBeenCalledTimes(1);
    });

    // The regression: onDone used to fire at zero, the parent unmounted the timer
    // straight away, and the Go! message was never on screen.
    it("keeps Go! visible for a few seconds before calling onDone", () => {
        const { onDone } = setup(3);
        tick(3);
        expect(onDone).not.toHaveBeenCalled();

        tick(3);
        expect(onDone).not.toHaveBeenCalled();

        tick(1);
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("adds 15 seconds on +15s", () => {
        setup(10);
        fireEvent.click(screen.getByRole("button", { name: "+15s" }));
        expect(screen.getByText("0:25")).toBeInTheDocument();
    });

    it("calls onSkip on Skip", () => {
        const { onSkip, onDone } = setup(10);
        fireEvent.click(screen.getByRole("button", { name: "Skip" }));
        expect(onSkip).toHaveBeenCalledTimes(1);
        expect(onDone).not.toHaveBeenCalled();
    });
});
