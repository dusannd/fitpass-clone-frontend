// Shared types and helpers for the trainer <-> client relationship.
// Same reasoning as utils/workout.ts: a file that exports a component should only export
// components, or Vite fast refresh breaks.

import type { UserProfile } from "../components/Layout";

// --- 1. TYPES (must mirror app/schemas/coaching.py 1:1) ---

/**
 * The lightweight user the coaching endpoints embed in a link. The backend deliberately
 * leaves out roles and subscriptions here, so this is NOT the same shape as User.
 */
export interface CoachingUser {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string;
    profile: UserProfile | null;
}

export interface CoachingLink {
    id: number;
    trainer_id: number;
    client_id: number;
    // "PENDING" | "ACCEPTED" | "REJECTED" - kept as a string because the backend column is one.
    status: string;
    created_at: string;
    trainer: CoachingUser | null;
    client: CoachingUser | null;
}

// --- 2. SELECTORS ---
// Both drop links whose trainer came back null, so nothing downstream can render a
// nameless, faceless chip.

const trainersWithStatus = (links: CoachingLink[], status: string): CoachingUser[] =>
    links
        .filter((link) => link.status === status && link.trainer !== null)
        .map((link) => link.trainer as CoachingUser);

/** Trainers who accepted this member - the ones who can actually assign them plans. */
export const activeTrainers = (links: CoachingLink[]): CoachingUser[] =>
    trainersWithStatus(links, "ACCEPTED");

/** Trainers this member has asked, who have not answered yet. */
export const pendingTrainers = (links: CoachingLink[]): CoachingUser[] =>
    trainersWithStatus(links, "PENDING");

/**
 * A display name that is never empty. Both name fields are nullable on the backend, and
 * an account created through the admin panel can genuinely have neither.
 */
export const trainerName = (user: CoachingUser): string => {
    const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    return full || user.email;
};
