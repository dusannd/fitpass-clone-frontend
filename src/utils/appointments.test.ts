import { describe, it, expect } from "vitest";
import {
    canMemberCancel,
    displayStatus,
    groupForTrainer,
    splitAppointments,
    validateBooking,
    type Appointment,
    type AppointmentStatus,
} from "./appointments";

// --- 1. FIXTURES ---
// A fixed local "now": 1 October 2026, 12:00 on the browser's clock. Everything is
// built from local parts, the same way the booking form reads its inputs.
const NOW = new Date(2026, 9, 1, 12, 0).getTime();
const HOUR = 60 * 60 * 1000;

const appt = (id: number, startOffsetHours: number, status: AppointmentStatus = "SCHEDULED"): Appointment => ({
    id,
    trainer_id: 1,
    client_id: 2,
    start_time: new Date(NOW + startOffsetHours * HOUR).toISOString(),
    end_time: new Date(NOW + (startOffsetHours + 1) * HOUR).toISOString(),
    status,
    notes: null,
    trainer: null,
    client: null,
});

// --- 2. validateBooking ---
describe("validateBooking", () => {
    it("accepts a normal slot tomorrow", () => {
        expect(validateBooking("2026-10-02", "10:00", "11:00", NOW)).toBeNull();
    });

    it("leaves empty fields to the browser", () => {
        expect(validateBooking("", "10:00", "11:00", NOW)).toBeNull();
    });

    it("refuses an end before the start", () => {
        expect(validateBooking("2026-10-02", "11:00", "10:00", NOW)).toMatch(/after start/);
    });

    it("refuses more than 3 hours", () => {
        expect(validateBooking("2026-10-02", "10:00", "13:30", NOW)).toMatch(/3 hours/);
    });

    it("refuses times outside opening hours, but allows the edges", () => {
        expect(validateBooking("2026-10-02", "05:30", "06:30", NOW)).toMatch(/between 06:00 and 23:00/);
        expect(validateBooking("2026-10-02", "22:30", "23:30", NOW)).toMatch(/between 06:00 and 23:00/);
        expect(validateBooking("2026-10-02", "06:00", "07:00", NOW)).toBeNull();
        expect(validateBooking("2026-10-02", "22:00", "23:00", NOW)).toBeNull();
    });

    it("refuses a time that already passed today", () => {
        // The date picker allows today, so this is the case it cannot catch.
        expect(validateBooking("2026-10-01", "09:00", "10:00", NOW)).toMatch(/already passed/);
        expect(validateBooking("2026-10-01", "15:00", "16:00", NOW)).toBeNull();
    });

    it("refuses more than 60 days ahead", () => {
        expect(validateBooking("2026-12-15", "10:00", "11:00", NOW)).toMatch(/60 days/);
    });
});

// --- 3. canMemberCancel ---
describe("canMemberCancel", () => {
    it("allows 12h or more before the start, not less", () => {
        expect(canMemberCancel(appt(1, 13), NOW)).toBe(true);
        expect(canMemberCancel(appt(1, 12), NOW)).toBe(true);
        expect(canMemberCancel(appt(1, 11), NOW)).toBe(false);
    });

    it("never offers it on a closed session", () => {
        expect(canMemberCancel(appt(1, 48, "CANCELLED"), NOW)).toBe(false);
    });
});

// --- 4. displayStatus ---
describe("displayStatus", () => {
    it("shows a session the trainer never closed as awaiting, not scheduled", () => {
        expect(displayStatus(appt(1, -3), NOW).label).toBe("Awaiting trainer");
        expect(displayStatus(appt(1, -0.5), NOW).label).toBe("In progress");
        expect(displayStatus(appt(1, 5), NOW).label).toBe("Scheduled");
        expect(displayStatus(appt(1, -3, "COMPLETED"), NOW).label).toBe("Completed");
    });
});

// --- 5. GROUPING ---
describe("splitAppointments", () => {
    it("puts what is ahead first, soonest on top, and history newest on top", () => {
        const list = [
            appt(1, -72, "COMPLETED"),
            appt(2, -24, "CANCELLED"),
            appt(3, 48),
            appt(4, 5),
            appt(5, -5), // over, never closed
            appt(6, -0.5), // running now
        ];
        const { upcoming, past } = splitAppointments(list, NOW);

        expect(upcoming.map((a) => a.id)).toEqual([6, 4, 3]);
        expect(past.map((a) => a.id)).toEqual([5, 2, 1]);
    });
});

describe("groupForTrainer", () => {
    it("lists started-but-open sessions first as needing a close-out", () => {
        const list = [appt(1, -72, "COMPLETED"), appt(2, 24), appt(3, -5), appt(4, -0.5), appt(5, 2)];
        const { needsClosing, upcoming, past } = groupForTrainer(list, NOW);

        expect(needsClosing.map((a) => a.id)).toEqual([3, 4]);
        expect(upcoming.map((a) => a.id)).toEqual([5, 2]);
        expect(past.map((a) => a.id)).toEqual([1]);
    });
});
