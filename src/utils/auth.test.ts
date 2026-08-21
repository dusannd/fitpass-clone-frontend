import { describe, it, expect } from "vitest";
import { calculatePasswordScore, MIN_PASSWORD_LENGTH, EMAIL_REGEX } from "./auth";

// The score is a LADDER, not a sum of points: every level has to clear the one below
// it. These tests pin that down, because an additive rewrite still passes a naive
// "strong password scores 4" check while letting "AAAAAAAA" tie with "aB".

describe("calculatePasswordScore", () => {
    // --- 1. LEVEL 0: below the length the form itself enforces ---
    it("scores anything shorter than the minimum as 0", () => {
        expect(calculatePasswordScore("")).toBe(0);
        expect(calculatePasswordScore("abcde")).toBe(0);
        expect(calculatePasswordScore("Ab1!")).toBe(0);
    });

    // --- 2. LEVEL 1: long enough to submit, too short to survive ---
    it("scores 6 or 7 characters as 1, however varied they are", () => {
        expect(calculatePasswordScore("abcdef")).toBe(1);
        // Every character class present, still only 7 characters long.
        expect(calculatePasswordScore("Abc1!de")).toBe(1);
    });

    // --- 3. LEVEL 2: long, but written in a single alphabet ---
    it("caps a single-case password at 2 no matter what else it has", () => {
        expect(calculatePasswordScore("abcdefgh")).toBe(2);
        expect(calculatePasswordScore("ABCDEFGH")).toBe(2);
        // Digits and symbols cannot lift it past the missing case - this is the
        // assertion an additive scorer fails.
        expect(calculatePasswordScore("abcdef1!")).toBe(2);
        expect(calculatePasswordScore("ABCDEF1!")).toBe(2);
    });

    // --- 4. LEVEL 3: mixed case, but nothing breaking the words up ---
    it("scores mixed case without both a digit and a symbol as 3", () => {
        expect(calculatePasswordScore("Abcdefgh")).toBe(3);
        expect(calculatePasswordScore("Abcdefg1")).toBe(3); // no symbol
        expect(calculatePasswordScore("Abcdefg!")).toBe(3); // no digit
    });

    // --- 5. LEVEL 4 ---
    it("scores the full set as 4", () => {
        expect(calculatePasswordScore("Abcdefg1!")).toBe(4);
    });

    // --- 6. REGRESSION: the symbol test is "not a letter or a digit" ---
    // The old check listed !@#$%^&* by hand, so these very common characters were
    // invisible to it and a genuinely strong password was graded 3.
    it("counts _ - . and + as symbols", () => {
        expect(calculatePasswordScore("Abcdefg1_")).toBe(4);
        expect(calculatePasswordScore("Abcdefg1-")).toBe(4);
        expect(calculatePasswordScore("Abcdefg1.")).toBe(4);
        expect(calculatePasswordScore("Abcdefg1+")).toBe(4);
        expect(calculatePasswordScore("Abcdefg1 ")).toBe(4); // a space is one too
    });

    // --- 7. The exact boundary the API also enforces ---
    it("turns from 0 into a real score exactly at MIN_PASSWORD_LENGTH", () => {
        const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
        const exact = "a".repeat(MIN_PASSWORD_LENGTH);

        expect(calculatePasswordScore(short)).toBe(0);
        expect(calculatePasswordScore(exact)).toBeGreaterThan(0);
    });
});

describe("EMAIL_REGEX", () => {
    it("accepts an ordinary address", () => {
        expect(EMAIL_REGEX.test("member@example.com")).toBe(true);
        expect(EMAIL_REGEX.test("first.last+tag@sub.example.co.uk")).toBe(true);
    });

    it("rejects the shapes the login form has to catch", () => {
        expect(EMAIL_REGEX.test("")).toBe(false);
        expect(EMAIL_REGEX.test("member")).toBe(false);
        expect(EMAIL_REGEX.test("member@example")).toBe(false); // no TLD
        expect(EMAIL_REGEX.test("@example.com")).toBe(false);
        expect(EMAIL_REGEX.test("mem ber@example.com")).toBe(false);
    });
});
