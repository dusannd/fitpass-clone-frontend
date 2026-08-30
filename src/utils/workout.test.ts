import { describe, it, expect } from "vitest";
import type { Exercise, ExerciseLog } from "./workout";
import {
    groupLogsByExercise,
    roundToStep,
    parseTargetReps,
    DEFAULT_WEIGHT_STEP,
} from "./workout";

// --- FIXTURES ---
// The API returns one row per SET, so a realistic fixture is several rows sharing an
// exercise_id. Both factories fill in the boring fields so each test only states the
// part it actually cares about.

const makeExercise = (over: Partial<Exercise> = {}): Exercise => ({
    id: 1,
    name: "Bench Press",
    sets: 3,
    reps: "8-10",
    rest_time_seconds: 90,
    requires_weight: true,
    recommended_weight_kg: 60,
    weight_step_kg: DEFAULT_WEIGHT_STEP,
    instructions: null,
    ...over,
});

const makeLog = (over: Partial<ExerciseLog> = {}): ExerciseLog => ({
    id: 1,
    exercise_id: 1,
    set_number: 1,
    reps_completed: "10",
    weight_kg: 50,
    exercise: makeExercise(),
    ...over,
});

describe("groupLogsByExercise", () => {
    it("collapses the sets of one exercise into a single group", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, set_number: 1, weight_kg: 50 }),
            makeLog({ id: 2, set_number: 2, weight_kg: 55 }),
            makeLog({ id: 3, set_number: 3, weight_kg: 52.5 }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].sets).toHaveLength(3);
        expect(groups[0].name).toBe("Bench Press");
    });

    // The personal record is the heaviest set inside the session, not the last one.
    it("reports the heaviest set as topWeight regardless of order", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, weight_kg: 50 }),
            makeLog({ id: 2, weight_kg: 80 }), // the PR, in the middle
            makeLog({ id: 3, weight_kg: 60 }),
        ]);

        expect(groups[0].topWeight).toBe(80);
    });

    // A bodyweight warm-up set logs no weight at all. It must not pin topWeight to
    // null for the loaded sets that follow it.
    it("lets a later weighted set lift a topWeight that started as null", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, weight_kg: null }),
            makeLog({ id: 2, weight_kg: 50 }),
        ]);

        expect(groups[0].topWeight).toBe(50);
    });

    it("keeps topWeight null when no set carried a weight", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, weight_kg: null }),
            makeLog({ id: 2, weight_kg: null }),
        ]);

        expect(groups[0].topWeight).toBeNull();
    });

    it("separates different exercises", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, exercise_id: 1, exercise: makeExercise({ id: 1, name: "Bench Press" }) }),
            makeLog({ id: 2, exercise_id: 2, exercise: makeExercise({ id: 2, name: "Squat" }) }),
        ]);

        expect(groups.map((g) => g.name)).toEqual(["Bench Press", "Squat"]);
    });

    // The trainer can delete an exercise, which nulls exercise_id on the old rows.
    // Keying on the id alone would then merge every orphaned row under one "null" key
    // and report someone's squats as bench press sets.
    it("falls back to the name when exercise_id is null, instead of merging orphans", () => {
        const groups = groupLogsByExercise([
            makeLog({ id: 1, exercise_id: null, exercise: makeExercise({ name: "Deleted Bench" }) }),
            makeLog({ id: 2, exercise_id: null, exercise: makeExercise({ name: "Deleted Squat" }) }),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups.map((g) => g.name)).toEqual(["Deleted Bench", "Deleted Squat"]);
    });

    it("labels a row with no exercise at all as Unknown", () => {
        const groups = groupLogsByExercise([makeLog({ exercise_id: null, exercise: null })]);

        expect(groups[0].name).toBe("Unknown");
    });

    it("returns an empty array for an empty session", () => {
        expect(groupLogsByExercise([])).toEqual([]);
    });
});

describe("roundToStep", () => {
    // Three taps of the 6.8 kg step is the case that used to render
    // 20.400000000000002 on the live workout screen.
    it("keeps binary float noise out of the displayed weight", () => {
        let weight = 0;
        for (let i = 0; i < 3; i++) weight = roundToStep(weight + 6.8, 6.8);

        expect(weight).toBe(20.4);
    });

    it("snaps a value to the nearest multiple of the step", () => {
        expect(roundToStep(11, DEFAULT_WEIGHT_STEP)).toBe(10);
        expect(roundToStep(11.5, DEFAULT_WEIGHT_STEP)).toBe(12.5);
        expect(roundToStep(9, 2.25)).toBe(9);
    });

    it("never returns a negative weight", () => {
        expect(roundToStep(-5, DEFAULT_WEIGHT_STEP)).toBe(0);
        expect(roundToStep(1, DEFAULT_WEIGHT_STEP)).toBe(0);
    });

    it("returns 0 rather than NaN for a broken step or value", () => {
        expect(roundToStep(10, 0)).toBe(0);
        expect(roundToStep(10, -2.5)).toBe(0);
        expect(roundToStep(Number.NaN, 2.5)).toBe(0);
        expect(roundToStep(Number.POSITIVE_INFINITY, 2.5)).toBe(0);
    });
});

describe("parseTargetReps", () => {
    it("takes the first number out of the trainer's free text", () => {
        expect(parseTargetReps("8-10")).toBe(8);
        expect(parseTargetReps("12")).toBe(12);
        expect(parseTargetReps("3 x 5")).toBe(3);
    });

    it("falls back to 10 when there is no number to find", () => {
        expect(parseTargetReps("AMRAP")).toBe(10);
        expect(parseTargetReps("")).toBe(10);
        expect(parseTargetReps("to failure")).toBe(10);
    });

    it("never returns less than one rep", () => {
        expect(parseTargetReps("0")).toBe(1);
    });
});
