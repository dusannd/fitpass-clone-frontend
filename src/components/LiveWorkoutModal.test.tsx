import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LiveWorkoutModal from "./LiveWorkoutModal";
import type { Exercise, WorkoutPlan } from "../utils/workout";

// --- 1. FIXTURES ---
// Rest is 0 so ticking a set never mounts the rest timer - it is not what is under
// test here and it would bring real intervals along.
const exercise = (id: number, name: string, sets: number): Exercise => ({
    id,
    name,
    sets,
    reps: "10",
    rest_time_seconds: 0,
    requires_weight: false,
    recommended_weight_kg: null,
    weight_step_kg: 2.5,
    instructions: null,
});

const plan: WorkoutPlan = {
    id: 1,
    trainer_id: 1,
    client_id: null,
    name: "Push day",
    description: "",
    exercises: [exercise(10, "Bench Press", 2), exercise(20, "Dips", 1), exercise(30, "Push-ups", 1)],
};

const setup = () => render(<LiveWorkoutModal plan={plan} onClose={vi.fn()} onSaved={vi.fn()} />);

// The card header is a button whose accessible name starts with the exercise name.
const header = (name: string) => screen.getByRole("button", { name: new RegExp(name) });
const doneButtons = () => screen.queryAllByRole("button", { name: /^Done$/ });

describe("LiveWorkoutModal accordion", () => {
    // --- 2. JSDOM GAPS ---
    // jsdom has no layout, so scrollIntoView does not exist. The component calls it
    // from requestAnimationFrame after opening a card.
    beforeEach(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        // Put jsdom back the way it was for the next file.
        delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    // --- 3. TESTS ---
    it("opens only the first exercise on start", () => {
        setup();

        expect(header("Bench Press")).toHaveAttribute("aria-expanded", "true");
        expect(header("Dips")).toHaveAttribute("aria-expanded", "false");
        expect(header("Push-ups")).toHaveAttribute("aria-expanded", "false");
        // Two sets of Bench Press on screen, nothing from the closed cards.
        expect(doneButtons()).toHaveLength(2);
    });

    it("moves to the next exercise once the last set is ticked", () => {
        setup();

        fireEvent.click(doneButtons()[0]);
        // One set of Bench Press left - the card must stay open.
        expect(header("Bench Press")).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(doneButtons()[0]);
        expect(header("Bench Press")).toHaveAttribute("aria-expanded", "false");
        expect(header("Dips")).toHaveAttribute("aria-expanded", "true");
        expect(doneButtons()).toHaveLength(1);
    });

    it("skips forward past a finished exercise and wraps to a skipped one", () => {
        setup();

        // Jump ahead to Push-ups and finish it while Bench Press and Dips are untouched.
        fireEvent.click(header("Push-ups"));
        fireEvent.click(doneButtons()[0]);

        // Nothing after Push-ups is left, so it wraps to the first unfinished one.
        expect(header("Bench Press")).toHaveAttribute("aria-expanded", "true");
    });

    it("toggles a card from its header", () => {
        setup();

        fireEvent.click(header("Dips"));
        expect(header("Dips")).toHaveAttribute("aria-expanded", "true");
        expect(header("Bench Press")).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(header("Dips"));
        expect(header("Dips")).toHaveAttribute("aria-expanded", "false");
        expect(doneButtons()).toHaveLength(0);
    });
});
