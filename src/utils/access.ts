// =============================================================================
// Turnstile access helpers.
// =============================================================================

export type DoorAction = "ENTRY" | "EXIT";
export type PhysicalStatus = "INSIDE" | "OUTSIDE" | "LOADING";

/**
 * Has the turnstile already eaten this QR code?
 *
 * A code dies two deaths and the dashboard only ever noticed one. It expires
 * after five minutes, which a timestamp covers. But it is also burned
 * server-side the moment it is scanned - `app/api/access.py` drops its `jti`
 * into Redis - and nothing in the stored state records that. So a scanned code
 * stays "valid" on the client for the rest of its five minutes.
 *
 * That gap is not theoretical. The granted WebSocket event is what normally
 * clears the code, and it is pushed exactly once, to a socket that may be
 * mid-reconnect or on a page that is mid-reload. Miss it and a refresh puts a
 * dead code back on screen; the next scan answers "Replay Attack: Token already
 * consumed", which reads as the member cheating rather than the app handing them
 * a stale code.
 *
 * The server already tells us, in the status the dashboard fetches on mount:
 *
 *   - an ENTRY code cannot still be pending once you are INSIDE
 *   - an EXIT code cannot still be pending once you are OUTSIDE
 *
 * LOADING answers false. Before the first status lands there is no evidence
 * either way, and guessing "spent" would blank a code the member is holding up
 * to the scanner right now.
 */
export const isQrSpent = (
    actionType: DoorAction | null,
    status: PhysicalStatus,
): boolean => {
    if (actionType === null) return false;

    return (actionType === "ENTRY" && status === "INSIDE")
        || (actionType === "EXIT" && status === "OUTSIDE");
};
