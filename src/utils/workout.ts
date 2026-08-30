// Shared types and helpers for the workout feature.
// They live here (and not inside a component file) for the same reason as profile.ts:
// a file that exports a component should only export components, or Vite fast refresh breaks.

// --- 1. TYPES (must mirror app/schemas/workout.py 1:1) ---

export interface Exercise {
    id: number;
    name: string;
    sets: number;
    reps: string;
    rest_time_seconds: number;
    requires_weight: boolean;
    // Trainer setup for the live workout screen
    recommended_weight_kg: number | null;
    weight_step_kg: number;
    instructions: string | null;
}

export interface WorkoutPlan {
    id: number;
    trainer_id: number;
    client_id: number | null;
    name: string;
    description: string;
    exercises: Exercise[];
}

// One row = one single set that was actually performed.
export interface ExerciseLog {
    id: number;
    exercise_id: number | null;
    set_number: number;
    reps_completed: string;
    weight_kg: number | null;
    exercise: Exercise | null;
}

export interface WorkoutSession {
    id: number;
    user_id: number;
    plan_id: number | null;
    date: string;
    notes: string | null;
    exercise_logs: ExerciseLog[];
}

// One exercise inside a past session, rebuilt from its individual set rows.
export interface GroupedExercise {
    key: string;
    name: string;
    sets: ExerciseLog[];
    topWeight: number | null;
}

/**
 * The API returns one row per set. Every history screen wants one tile per exercise,
 * headlined by the heaviest set - which is exactly what counts as the personal record.
 * Shared by the history list and the session detail modal so the two can never disagree.
 */
export const groupLogsByExercise = (logs: ExerciseLog[]): GroupedExercise[] => {
    const groups = new Map<string, GroupedExercise>();

    logs.forEach((log) => {
        // exercise_id is nullable (the trainer may have deleted the exercise), so fall
        // back to the name to avoid merging unrelated rows under a single "null" key.
        const key = log.exercise_id !== null ? `id-${log.exercise_id}` : `name-${log.exercise?.name ?? "unknown"}`;

        const existing = groups.get(key);
        if (existing) {
            existing.sets.push(log);
            if (log.weight_kg !== null && (existing.topWeight === null || log.weight_kg > existing.topWeight)) {
                existing.topWeight = log.weight_kg;
            }
        } else {
            groups.set(key, {
                key,
                name: log.exercise?.name || "Unknown",
                sets: [log],
                topWeight: log.weight_kg,
            });
        }
    });

    return Array.from(groups.values());
};

// --- 2. WEIGHT STEPS ---
// Every machine moves in its own increment, and the client should never have to work
// that out mid set. The trainer picks one of these and the "+" button obeys it.

export interface WeightStepOption {
    label: string;
    value: number;
}

export const WEIGHT_STEP_OPTIONS: WeightStepOption[] = [
    { label: "Free Weights (2.5kg)", value: 2.5 },
    // A dumbbell rack is its own thing: the light end climbs 2, 4, 6, 8 and the
    // heavy end jumps in fives. "Free Weights" was the closest match before, and
    // it is wrong in both halves of the rack.
    //
    // The step is PER DUMBBELL, not the pair. The client logs one weight_kg per
    // set, so a trainer meaning 2x20kg has to be told which number to write -
    // that is what the helper text under the picker says.
    { label: "Dumbbells (2kg)", value: 2 },
    { label: "Heavy Dumbbells (5kg)", value: 5 },
    { label: "Cable 10lbs (4.5kg)", value: 4.5 },
    { label: "Cable 15lbs (6.8kg)", value: 6.8 },
    { label: "Drop-pin (2.25kg)", value: 2.25 },
    { label: "Micro (1.0kg)", value: 1.0 },
];

export const DEFAULT_WEIGHT_STEP = 2.5;

/**
 * Adds or subtracts one step without letting binary floats leak into the UI.
 * Three taps of the 6.8 kg step would otherwise show 20.400000000000002.
 * Never returns a negative weight.
 */
export const roundToStep = (value: number, step: number): number => {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
    const snapped = Math.round(value / step) * step;
    // Two decimals is enough for every step we offer (2.25 is the finest).
    return Math.max(0, Math.round(snapped * 100) / 100);
};

/**
 * The trainer writes reps as free text ("8-10", "AMRAP", "12"), but the live screen
 * needs a number it can put +/- buttons around. Take the first number we find.
 */
export const parseTargetReps = (reps: string): number => {
    const match = /\d+/.exec(reps ?? "");
    if (!match) return 10;
    return Math.max(1, parseInt(match[0], 10));
};

// --- 3. SENSORY FEEDBACK ---

/**
 * Short buzz when the rest timer runs out.
 * iOS Safari has no Vibration API at all, so this has to fail silently.
 */
export const vibrate = (pattern: number | number[]): void => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // Some browsers throw if the page is not visible. Nothing to do about it.
    }
};

// One shared AudioContext. Browsers cap how many you may create, and opening a new
// one for every rest timer would eventually stop producing sound.
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioContext) {
        const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        audioContext = new Ctor();
    }
    return audioContext;
};

/**
 * Synthesizes a short beep. We generate the tone instead of shipping an audio file so
 * there is nothing to download, nothing to 404 and nothing to decode before it plays.
 */
const synthesizeBeep = (): void => {
    const ctx = getAudioContext();
    if (!ctx) return;

    // A tab that was in the background suspends its audio context.
    if (ctx.state === "suspended") void ctx.resume();

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5, cuts through gym noise

    // Ramp the volume instead of switching it on and off, otherwise you hear a click.
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
};

/**
 * The short confirmation cue: rest is over, or the turnstile let somebody in.
 *
 * This used to try an optional `/beep.mp3` first and fall back to the tone. That
 * was worse than it looked. `location /` in nginx serves index.html for anything
 * it cannot find, so a missing file came back as **200 with 2.6 KB of HTML** - the
 * browser downloaded it, failed to decode it, logged an error, and only then fell
 * through to the tone. Every single beep paid for a wasted request and a red line
 * in the console.
 *
 * It also meant dropping a file into public/ silently changed a sound nobody was
 * thinking about: a 2.8 second recording added for the scanner replaced the 0.3
 * second rest-timer cue too. Synthesizing unconditionally keeps the cue owned by
 * this function.
 */
export const playBeep = (): void => {
    synthesizeBeep();
};
