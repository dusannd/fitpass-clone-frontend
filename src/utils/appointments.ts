// Shared types, rules and grouping for 1-on-1 appointments. Used by both the member's
// and the trainer's schedule, so the two can never disagree about what "upcoming" or
// "can still be cancelled" means.
//
// Every function takes `now` as a parameter instead of reading the clock itself. The
// pages stamp it inside their queryFn, which keeps render pure and makes these
// trivially testable.

import type { CoachingUser } from "./coaching";

// --- 1. TYPES (must mirror AppointmentResponse in app/schemas/coaching.py) ---

export type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface Appointment {
    id: number;
    trainer_id: number;
    client_id: number;
    start_time: string;
    end_time: string;
    status: AppointmentStatus;
    notes: string | null;
    trainer: CoachingUser | null;
    client: CoachingUser | null;
}

// --- 2. RULES (mirror app/core/config.py and app/api/coaching.py) ---
// The server enforces all of these. They are repeated here only so the form can say
// what is wrong before sending, instead of after a round trip.

export const MAX_BOOKING_HORIZON_DAYS = 60;
export const GYM_OPEN_HOUR = 6;
export const GYM_CLOSE_HOUR = 23;
export const MAX_SESSION_HOURS = 3;
export const MEMBER_CANCEL_CUTOFF_HOURS = 12;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The first thing wrong with a booking, or null when it is fine to send.
 *
 * `date` is an <input type="date"> value (YYYY-MM-DD) and `start`/`end` are
 * <input type="time"> values (HH:MM), all read as the browser's local time - the
 * same way the page builds the timestamps it sends.
 */
export const validateBooking = (date: string, start: string, end: string, now: number): string | null => {
    // Empty fields are the browser's job (`required`), not an error to show here.
    if (!date || !start || !end) return null;

    const startAt = new Date(`${date}T${start}:00`).getTime();
    const endAt = new Date(`${date}T${end}:00`).getTime();

    if (endAt <= startAt) return "End time must be after start time.";
    if (endAt - startAt > MAX_SESSION_HOURS * HOUR_MS) return `A single session cannot exceed ${MAX_SESSION_HOURS} hours.`;

    // HH:MM strings compare correctly as text, so no parsing is needed for the hours.
    const opens = `${String(GYM_OPEN_HOUR).padStart(2, "0")}:00`;
    const closes = `${String(GYM_CLOSE_HOUR).padStart(2, "0")}:00`;
    if (start < opens || end > closes) return `Sessions can only be booked between ${opens} and ${closes}.`;

    if (startAt < now) return "That time has already passed.";
    if (startAt > now + MAX_BOOKING_HORIZON_DAYS * 24 * HOUR_MS) {
        return `Appointments can only be booked up to ${MAX_BOOKING_HORIZON_DAYS} days in advance.`;
    }

    return null;
};

/** True while a member may still cancel on their own - more than 12h before the start. */
export const canMemberCancel = (appt: Appointment, now: number): boolean =>
    appt.status === "SCHEDULED" && new Date(appt.start_time).getTime() - now >= MEMBER_CANCEL_CUTOFF_HOURS * HOUR_MS;

// --- 3. DISPLAY STATUS ---

export type StatusTone = "blue" | "amber" | "emerald" | "rose";

/**
 * What the badge should say. The stored status only changes when the trainer acts,
 * so a session that is long over still reads SCHEDULED in the database - showing
 * that as "Scheduled" made a missed close-out look like a future session.
 */
export const displayStatus = (appt: Appointment, now: number): { label: string; tone: StatusTone } => {
    if (appt.status === "COMPLETED") return { label: "Completed", tone: "emerald" };
    if (appt.status === "CANCELLED") return { label: "Cancelled", tone: "rose" };

    if (new Date(appt.end_time).getTime() <= now) return { label: "Awaiting trainer", tone: "amber" };
    if (new Date(appt.start_time).getTime() <= now) return { label: "In progress", tone: "blue" };
    return { label: "Scheduled", tone: "blue" };
};

// --- 4. GROUPING ---
// The API returns everything oldest first, so a fresh booking used to land at the
// bottom, under every past, cancelled and completed session.

const byStartAsc = (a: Appointment, b: Appointment) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime() || a.id - b.id;
const byStartDesc = (a: Appointment, b: Appointment) => byStartAsc(b, a);

/**
 * Member view: sessions still ahead (or running right now) first, soonest on top;
 * then everything else, newest on top.
 */
export const splitAppointments = (list: Appointment[], now: number) => {
    const isAhead = (a: Appointment) => a.status === "SCHEDULED" && new Date(a.end_time).getTime() > now;
    return {
        upcoming: list.filter(isAhead).sort(byStartAsc),
        past: list.filter((a) => !isAhead(a)).sort(byStartDesc),
    };
};

/**
 * Trainer view: the trainer has one more group the member does not - sessions that
 * have started but were never closed out. Those need an action, so they go first.
 */
export const groupForTrainer = (list: Appointment[], now: number) => {
    const scheduled = list.filter((a) => a.status === "SCHEDULED");
    return {
        needsClosing: scheduled.filter((a) => new Date(a.start_time).getTime() <= now).sort(byStartAsc),
        upcoming: scheduled.filter((a) => new Date(a.start_time).getTime() > now).sort(byStartAsc),
        past: list.filter((a) => a.status !== "SCHEDULED").sort(byStartDesc),
    };
};
