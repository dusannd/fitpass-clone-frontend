import { useEffect, useRef, useState } from "react";
import { playBeep, vibrate } from "../utils/workout";

interface RestTimerProps {
    // How long this exercise rests for, in seconds.
    seconds: number;
    // What the rest is for, e.g. "Bench Press · next: Set 3".
    label?: string;
    // Fired once, a few seconds after the countdown reaches zero.
    onDone: () => void;
    // Fired when the user taps "Skip" (or "Dismiss" once the rest is over).
    onSkip: () => void;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const EXTRA_SECONDS = 15;
// How long the green "Go!" state stays on screen before the bar goes away.
// Without it the bar vanished the instant it hit zero, and the one message
// that tells you to start the next set was never actually visible.
const GO_DISPLAY_MS = 4000;

/**
 * Rest countdown bar, pinned to the bottom of the live workout modal.
 * When it hits zero the phone buzzes and beeps, and the bar turns green for a
 * moment, so you never have to watch the screen between sets.
 */
export default function RestTimer({ seconds, label, onDone, onSkip }: RestTimerProps) {
    const [remaining, setRemaining] = useState(seconds);
    // The ring is drawn against the total, which "+15s" grows along with remaining.
    const [total, setTotal] = useState(seconds);
    const isFinished = remaining <= 0;

    // --- 1. LATEST onDone ---
    // The finish effect schedules onDone on a timeout, so we keep the latest
    // callback in a ref instead of re-arming the timeout on every parent render.
    const onDoneRef = useRef(onDone);
    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    // Guard so the buzz and beep run exactly once, even if React re-runs the effect.
    const hasFinishedRef = useRef(false);

    // --- 2. COUNTDOWN ---
    // The interval only counts. No reset of `remaining` in here on purpose: the
    // parent gives us a new key for every set, so a new rest period arrives as a
    // fresh mount with fresh state.
    useEffect(() => {
        if (isFinished) return;

        const interval = setInterval(() => {
            setRemaining((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [isFinished]);

    // --- 3. FINISH ---
    // Side effects live here, not inside the setRemaining updater: updaters must be
    // pure, and StrictMode calls them twice.
    useEffect(() => {
        if (!isFinished) return;

        if (!hasFinishedRef.current) {
            hasFinishedRef.current = true;
            // 1. Buzz (ignored on iOS), 2. beep.
            vibrate([200, 100, 200]);
            playBeep();
        }

        // 3. Keep "Go!" on screen for a moment, then tell the parent we are done.
        const timeout = setTimeout(() => onDoneRef.current(), GO_DISPLAY_MS);
        return () => clearTimeout(timeout);
    }, [isFinished]);

    const addTime = () => {
        setRemaining((prev) => prev + EXTRA_SECONDS);
        setTotal((prev) => prev + EXTRA_SECONDS);
    };

    const progress = total > 0 ? remaining / total : 0;
    const minutes = Math.floor(remaining / 60);
    const displaySeconds = remaining % 60;

    return (
        <div
            role="timer"
            aria-live="polite"
            className={`flex items-center gap-3 rounded-2xl border p-3 animate-menu-pop transition-colors ${
                isFinished
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                    : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60"
            }`}
        >
            {/* CIRCULAR PROGRESS RING */}
            <div className="relative h-14 w-14 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                    {/* Track */}
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="10"
                        className={isFinished ? "stroke-emerald-500" : "stroke-blue-200 dark:stroke-blue-900"}
                    />
                    {/* Remaining time */}
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                        className="stroke-blue-600 dark:stroke-blue-500 transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
                    />
                </svg>

                {isFinished && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">✓</span>
                    </div>
                )}
            </div>

            {/* TIME + LABEL */}
            <div className="flex-1 min-w-0">
                {isFinished ? (
                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 leading-tight">
                        Go! Next set 💪
                    </p>
                ) : (
                    <p className="text-3xl font-black text-gray-900 dark:text-white tabular-nums leading-none">
                        {minutes}:{String(displaySeconds).padStart(2, "0")}
                    </p>
                )}
                <p className={`mt-1 text-[11px] font-bold uppercase tracking-wider truncate ${
                    isFinished ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"
                }`}>
                    {label ? `Rest · ${label}` : "Rest"}
                </p>
            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-2 shrink-0">
                {!isFinished && (
                    <button
                        type="button"
                        onClick={addTime}
                        className="h-11 px-3 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 text-sm font-black active:scale-95 touch-manipulation transition-transform"
                    >
                        +{EXTRA_SECONDS}s
                    </button>
                )}
                <button
                    type="button"
                    onClick={onSkip}
                    className={`h-11 px-3 rounded-xl text-white text-sm font-black active:scale-95 touch-manipulation transition-transform ${
                        isFinished ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                >
                    {isFinished ? "Dismiss" : "Skip"}
                </button>
            </div>
        </div>
    );
}
