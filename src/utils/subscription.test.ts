import { describe, it, expect } from "vitest";
import type { Plan } from "./subscription";
import {
    parseAllowedDays,
    formatAllowedDays,
    formatTime,
    billingCycleProgress,
    daysRemaining,
    getPlanTheme,
    activePerks,
    sortPlansByPrice,
    PLAN_PERKS,
} from "./subscription";

// A plan with every perk switched off, so each test only turns on what it asserts.
const makePlan = (over: Partial<Plan> = {}): Plan => ({
    id: 1,
    name: "Standard",
    description: null,
    price: 3000,
    duration_days: 30,
    is_active: true,
    tier: "Standard",
    locations: [],
    rule: null,
    includes_trainer: false,
    includes_group_classes: false,
    has_sauna_access: false,
    has_towel_service: false,
    allows_guest: false,
    ...over,
});

describe("parseAllowedDays", () => {
    it("turns the stored CSV into day indexes", () => {
        expect(parseAllowedDays("0,1,2,3,4")).toEqual([0, 1, 2, 3, 4]);
        expect(parseAllowedDays("0, 6")).toEqual([0, 6]); // tolerates spaces
    });

    it("returns an empty array for a missing rule", () => {
        expect(parseAllowedDays(null)).toEqual([]);
        expect(parseAllowedDays(undefined)).toEqual([]);
        expect(parseAllowedDays("")).toEqual([]);
    });

    // A hand-edited row must not reach the render as NaN, which would index
    // DAY_LABELS with undefined and blank out the whole card.
    it("drops garbage and out-of-range entries instead of producing NaN", () => {
        expect(parseAllowedDays("9,abc,3")).toEqual([3]);
        expect(parseAllowedDays("-1,7,0")).toEqual([0]);
        expect(parseAllowedDays("abc")).toEqual([]);
    });
});

describe("formatAllowedDays", () => {
    it("names the days in order", () => {
        expect(formatAllowedDays("0,1,2")).toBe("Mon, Tue, Wed");
        expect(formatAllowedDays("5,6")).toBe("Sat, Sun");
    });

    it("collapses all seven into 'Every day'", () => {
        expect(formatAllowedDays("0,1,2,3,4,5,6")).toBe("Every day");
    });
});

describe("formatTime", () => {
    it("trims the seconds off a stored time", () => {
        expect(formatTime("09:00:00")).toBe("09:00");
        expect(formatTime("23:30:00")).toBe("23:30");
    });
});

describe("billingCycleProgress", () => {
    const start = "2026-01-01T00:00:00Z";
    const end = "2026-01-31T00:00:00Z";
    const at = (iso: string) => new Date(iso).getTime();

    it("reports how far through the period we are", () => {
        expect(billingCycleProgress(start, end, at("2026-01-16T00:00:00Z"))).toBeCloseTo(50, 5);
        expect(billingCycleProgress(start, end, at("2026-01-01T00:00:00Z"))).toBe(0);
        expect(billingCycleProgress(start, end, at("2026-01-31T00:00:00Z"))).toBe(100);
    });

    it("clamps to 0-100 outside the period", () => {
        expect(billingCycleProgress(start, end, at("2025-12-01T00:00:00Z"))).toBe(0);
        expect(billingCycleProgress(start, end, at("2026-03-01T00:00:00Z"))).toBe(100);
    });

    // A zero-length or inverted period would otherwise divide by zero and render NaN%
    // as the bar width.
    it("reports a full bar for a zero-length or inverted period", () => {
        expect(billingCycleProgress(start, start, at("2026-01-16T00:00:00Z"))).toBe(100);
        expect(billingCycleProgress(end, start, at("2026-01-16T00:00:00Z"))).toBe(100);
    });
});

describe("daysRemaining", () => {
    const now = new Date("2026-01-01T00:00:00Z").getTime();

    it("rounds up, so the last few hours still read as a day", () => {
        expect(daysRemaining("2026-01-03T12:00:00Z", now)).toBe(3); // 2.5 days
        expect(daysRemaining("2026-01-01T01:00:00Z", now)).toBe(1); // one hour
    });

    it("never goes negative on an expired pass", () => {
        expect(daysRemaining("2025-12-25T00:00:00Z", now)).toBe(0);
        expect(daysRemaining("2026-01-01T00:00:00Z", now)).toBe(0);
    });
});

describe("getPlanTheme", () => {
    it("gives each tier its own theme and marks Pro as the bestseller", () => {
        expect(getPlanTheme("Pro").isPopular).toBe(true);
        expect(getPlanTheme("Standard").isPopular).toBe(false);
        expect(getPlanTheme("VIP").isPopular).toBe(false);
    });

    // An older backend or a hand-edited row must not render an undefined theme.
    it("falls back to Standard for an unknown tier", () => {
        expect(getPlanTheme("Platinum")).toBe(getPlanTheme("Standard"));
        expect(getPlanTheme("")).toBe(getPlanTheme("Standard"));
    });
});

describe("activePerks", () => {
    it("lists only the perks the plan carries, in the advertised order", () => {
        const plan = makePlan({ has_sauna_access: true, includes_trainer: true });

        expect(activePerks(plan).map((p) => p.key)).toEqual([
            "includes_trainer",
            "has_sauna_access",
        ]);
    });

    it("returns nothing for a bare plan and everything for a loaded one", () => {
        expect(activePerks(makePlan())).toEqual([]);

        const loaded = makePlan({
            includes_trainer: true,
            includes_group_classes: true,
            has_sauna_access: true,
            has_towel_service: true,
            allows_guest: true,
        });
        expect(activePerks(loaded)).toHaveLength(PLAN_PERKS.length);
    });
});

describe("sortPlansByPrice", () => {
    // The API returns plans in whatever order the database hands back, so this is
    // what decides how the pricing cards actually read: cheapest on the left.
    it("orders plans from cheapest to most expensive", () => {
        const plans = [
            makePlan({ id: 1, name: "VIP", price: 10000 }),
            makePlan({ id: 2, name: "Standard", price: 3000 }),
            makePlan({ id: 3, name: "Gold", price: 5000 }),
        ];

        expect(sortPlansByPrice(plans).map((p) => p.name)).toEqual(["Standard", "Gold", "VIP"]);
    });

    // Two plans at the same price would otherwise be free to swap places between
    // two responses, and the row would reshuffle itself on a refetch.
    it("breaks a price tie on id, so the order never wobbles", () => {
        const plans = [
            makePlan({ id: 9, price: 3000 }),
            makePlan({ id: 2, price: 3000 }),
            makePlan({ id: 5, price: 3000 }),
        ];

        expect(sortPlansByPrice(plans).map((p) => p.id)).toEqual([2, 5, 9]);
    });

    // React Query hands out the array it is caching. Sorting in place would reorder
    // it for every other reader of the same key.
    it("leaves the array it was given untouched", () => {
        const plans = [makePlan({ id: 1, price: 10000 }), makePlan({ id: 2, price: 3000 })];

        const sorted = sortPlansByPrice(plans);

        expect(plans.map((p) => p.id)).toEqual([1, 2]);
        expect(sorted).not.toBe(plans);
    });
});
