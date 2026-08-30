import { useEffect, useRef, useState } from "react";

// =============================================================================
// NumberField - a number input you can actually empty.
//
// THE BUG THIS EXISTS TO KILL
// The obvious way to write a controlled number input is the broken one:
//
//     <input type="number" value={sets}
//            onChange={(e) => setSets(parseInt(e.target.value) || 1)} />
//
// Select all, press Delete, and `e.target.value` is "". `parseInt("")` is NaN,
// `|| 1` turns that into 1, and React puts a 1 straight back into the box. The
// field cannot be emptied. To change 60 into 90 you have to type in FRONT of the
// digit that keeps reappearing, which is how people end up with 960 and 060.
//
// The `||` costs a second bug on its own: 0 is falsy, so typing a legitimate 0
// silently becomes the fallback.
//
// HOW THIS FIXES IT
// The text you are typing and the number the form stores are two different
// things, so this keeps them apart. Internally it holds a STRING - whatever is
// on screen, including "" - and only hands the parent a number when there is a
// real one to hand over. While the box is empty the parent keeps the last good
// value, so the payload is never NaN and never a surprise zero.
//
// On blur, an empty or half-typed box ("-", "5e") snaps back to the parent's
// value, and anything below `min` is clamped. Nothing is corrected mid-keystroke,
// because correcting someone while they type is the whole problem.
//
// WHAT THIS IS NOT FOR
// Optional fields where empty is a real, meaningful value - "no target weight" -
// want `number | null` state instead, with "" mapping to null. See the Target
// (kg) input in TrainerPlans.tsx and the weight input in LiveWorkoutModal.tsx.
// Those are already correct and must not be moved onto this component: it always
// reports a number, which is exactly wrong when "nothing" is a valid answer.
// =============================================================================

interface NumberFieldProps {
    value: number;
    // Deliberately not called `onChange`: it does not take a DOM event, and a
    // prop that looks like a DOM handler but is not one invites the mistake this
    // whole component is about.
    onValueChange: (value: number) => void;

    id?: string;
    name?: string;
    min?: number;
    max?: number;
    step?: number;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    inputMode?: "numeric" | "decimal";
    className?: string;
    "aria-label"?: string;
}

const clamp = (value: number, min?: number, max?: number): number => {
    let result = value;
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
    return result;
};

export default function NumberField({
    value,
    onValueChange,
    min,
    max,
    step,
    inputMode,
    className,
    ...rest
}: NumberFieldProps) {
    const [text, setText] = useState<string>(() => String(value));

    // The last number WE told the parent about. It is what separates "the parent
    // changed this behind our back" (a form reset, a draft being restored) from
    // "the parent is just echoing what we sent it". Without it, every commit
    // would bounce back through the effect below and overwrite the text mid-type
    // - retyping "2.50" as "2.5" under the cursor.
    const lastCommitted = useRef<number>(value);

    useEffect(() => {
        if (value !== lastCommitted.current) {
            lastCommitted.current = value;
            setText(String(value));
        }
    }, [value]);

    const commit = (next: number) => {
        lastCommitted.current = next;
        onValueChange(next);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;

        // Show it first, always. Whatever is in the box is the user's business
        // until they leave it.
        setText(raw);

        // An empty box is a legitimate thing to be looking at halfway through
        // typing a number, so it is displayed and NOT reported upward.
        if (raw.trim() === "") return;

        const parsed = Number(raw);

        // "5e", "-", "1.2.3" - type="number" hands these over as "" in most
        // browsers, but not all, and this is also reachable via paste.
        if (!Number.isFinite(parsed)) return;

        commit(parsed);
    };

    // Tidying up happens here, once, rather than on every keystroke.
    const handleBlur = () => {
        const parsed = Number(text);

        if (text.trim() === "" || !Number.isFinite(parsed)) {
            setText(String(value));
            return;
        }

        const clamped = clamp(parsed, min, max);
        if (clamped !== value) commit(clamped);
        setText(String(clamped));
    };

    return (
        <input
            {...rest}
            type="number"
            inputMode={inputMode}
            min={min}
            max={max}
            step={step}
            value={text}
            onChange={handleChange}
            onBlur={handleBlur}
            className={className}
        />
    );
}
