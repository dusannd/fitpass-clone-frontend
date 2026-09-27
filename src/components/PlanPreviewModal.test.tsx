import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlanPreviewModal from "./PlanPreviewModal";
import type { Exercise, WorkoutPlan } from "../utils/workout";

// --- 1. FIXTURE ---
// Five exercises on purpose: the plan card stops at three, and the preview exists
// for the ones the card cannot show.
const exercise = (id: number, name: string, extra: Partial<Exercise> = {}): Exercise => ({
    id,
    name,
    sets: 3,
    reps: "10",
    rest_time_seconds: 90,
    requires_weight: true,
    recommended_weight_kg: null,
    weight_step_kg: 2.5,
    instructions: null,
    ...extra,
});

const plan: WorkoutPlan = {
    id: 1,
    trainer_id: 1,
    client_id: null,
    name: "Push Workout",
    description: "Chest, shoulders and triceps.",
    exercises: [
        exercise(1, "Barbell Bench Press", { sets: 4, reps: "8", recommended_weight_kg: 60, instructions: "Squeeze the shoulder blades." }),
        exercise(2, "Machine Chest Fly"),
        exercise(3, "Dumbbell Shoulder Press", { rest_time_seconds: 120 }),
        exercise(4, "Lateral Raise"),
        exercise(5, "Push-ups", { requires_weight: false }),
    ],
};

const setup = () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(
        <PlanPreviewModal
            plan={plan}
            onClose={onClose}
            actionLabel="Start Workout 🚀"
            actionClassName="bg-blue-600"
            onAction={onAction}
        />,
    );
    return { onClose, onAction };
};

// --- 2. TESTS ---
describe("PlanPreviewModal", () => {
    it("lists every exercise, including the ones the card hides", () => {
        setup();

        for (const ex of plan.exercises) {
            expect(screen.getByText(ex.name)).toBeInTheDocument();
        }
        expect(screen.getByText("5 exercises · 16 sets")).toBeInTheDocument();
    });

    it("shows the target weight, rest and the trainer's cues", () => {
        setup();

        expect(screen.getByText(/4 × 8 @ 60 kg · rest 90s/)).toBeInTheDocument();
        expect(screen.getByText(/rest 2 min/)).toBeInTheDocument();
        expect(screen.getByText("Squeeze the shoulder blades.")).toBeInTheDocument();
        expect(screen.getByText("Bodyweight")).toBeInTheDocument();
    });

    it("runs the card's action from the footer button", () => {
        const { onAction, onClose } = setup();

        fireEvent.click(screen.getByRole("button", { name: "Start Workout 🚀" }));

        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes on the close button and on Escape", () => {
        const { onClose } = setup();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        fireEvent.keyDown(document, { key: "Escape" });

        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
