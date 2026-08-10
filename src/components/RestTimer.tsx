import { useEffect, useRef, useState } from "react";
import { playBeep, vibrate } from "../utils/workout";

interface RestTimerProps {
    // How long this exercise rests for, in seconds.
    seconds: number;
    // Fired once, when the countdown reaches zero.
    onDone: () => void;
    // Fired when the user taps "Skip".
    onSkip: () => void;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular rest countdown shown right after a set is marked as done.
 * When it hits zero the phone buzzes and beeps, so you never have to watch the screen
 * between sets.
 */
export default function RestTimer({ seconds, onDone, onSkip }: RestTimerProps) {
    const [remaining, setRemaining] = useState(seconds);

    // The countdown fires onDone from inside an interval tick, so we keep the latest
    // callback in a ref. Otherwise the interval would keep calling the version of the
    // function that existed when it was created.
    const onDoneRef = useRef(onDone);
    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    // Guard so the finish effects run exactly once, even if React re-renders us.
    const hasFinishedRef = useRef(false);

    // No reset of `remaining` in here on purpose: the parent gives us a new key for
    // every set, so a new rest period arrives as a fresh mount with fresh state.
    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining((prev) => {
                const next = prev - 1;

                if (next <= 0 && !hasFinishedRef.current) {
                    hasFinishedRef.current = true;
                    clearInterval(interval);

                    // 1. Buzz (ignored on iOS), 2. beep, 3. tell the parent we are done.
                    vibrate([200, 100, 200]);
                    playBeep();
                    onDoneRef.current();
                }

                return Math.max(0, next);
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [seconds]);

    const progress = seconds > 0 ? remaining / seconds : 0;
    const minutes = Math.floor(remaining / 60);
    const displaySeconds = remaining % 60;

    return (
        <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-2xl p-4">
            {/* CIRCULAR PROGRESS RING */}
            <div className="relative h-24 w-24 shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    {/* Track */}
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="8"
                        className="stroke-blue-200 dark:stroke-blue-900"
                    />
                    {/* Remaining time */}
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                        className="stroke-blue-600 dark:stroke-blue-500 transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
                    />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-black text-blue-700 dark:text-blue-300 tabular-nums">
                        {minutes > 0 ? `${minutes}:${String(displaySeconds).padStart(2, "0")}` : displaySeconds}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-500 dark:text-blue-400">
                    Rest
                </p>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                    {remaining > 0 ? "Catch your breath" : "Go! Next set 💪"}
                </p>
                <button
                    type="button"
                    onClick={onSkip}
                    className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                    Skip rest
                </button>
            </div>
        </div>
    );
}
