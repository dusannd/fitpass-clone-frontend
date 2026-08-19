import { useEffect, useRef, useState } from "react";

// =============================================================================
// useGymWebSocket - a self-healing WebSocket connection.
//
// WHY THIS EXISTS
// A raw `new WebSocket(...)` inside a useEffect works right up until the network
// blinks. A member walking into the gym typically hands off from 4G to the gym
// WiFi, which silently kills the socket. The page keeps looking healthy while
// being completely deaf: a scan at the turnstile no longer clears the QR code or
// flips the INSIDE/OUTSIDE badge. Nothing tells the user, and nothing recovers.
//
// WHY A CUSTOM HOOK
// This is stateful logic with a lifecycle (open, close, retry, clean up) that has
// nothing to do with how anything looks. A custom hook is exactly the tool for
// that: it keeps the reconnection machinery in one place and hands the component
// back a plain, boring result - a status and the latest message.
//
// WHAT "EXPONENTIAL BACKOFF" MEANS
// The naive fix is to retry every second forever. That is the worst thing you can
// do to a server that is already down: a thousand phones retrying once a second
// is a thousand requests per second aimed at a backend that is trying to restart.
// Exponential backoff doubles the wait after each failure - 1s, 2s, 4s, 8s -
// capped so that recovery still feels immediate to a human (10s here).
//
// The waits also get a random +/-20% "jitter". Without it, every client that
// dropped during the same restart wakes up in the same millisecond and knocks the
// server over again the moment it comes back - a thundering herd. Jitter spreads
// them out. It is one line of code, and it is the difference between a backoff
// that helps and one that merely delays the stampede.
// =============================================================================

export type WsStatus = "CONNECTING" | "OPEN" | "CLOSED";

export interface GymWsMessage {
    // A monotonically increasing counter. The consumer reacts to messages with a
    // useEffect keyed on this object, and two identical payloads in a row (say,
    // two Manual Overrides) must fire that effect twice. A fresh object per
    // message already guarantees a new reference; `seq` makes that explicit and
    // gives us something readable to log.
    seq: number;
    data: unknown;
}

interface UseGymWebSocketOptions {
    // The caller may not be allowed to open the socket at all (on the dashboard,
    // only members are). Passing `false` keeps the hook mounted but idle, instead
    // of forcing the component into conditional-hook gymnastics.
    enabled?: boolean;

    // Fired once per incoming message, from inside the socket event handler.
    //
    // WHY BOTH THIS AND `lastMessage`: they answer different questions. Reading
    // `lastMessage` is for rendering something derived from the last event. This
    // callback is for reacting to an event as an event - clearing the QR code,
    // kicking off a refetch. Doing that from a useEffect on `lastMessage` instead
    // would run the same updates during the render cycle, which cascades renders
    // and is what react-hooks/set-state-in-effect exists to catch.
    //
    // The identity of this function is deliberately NOT a dependency of the
    // connection: it is kept in a ref that is refreshed on every render, so the
    // callback is always the newest one without ever rebuilding the socket. That
    // is the trap this hook is designed around - a handler in the dependency
    // array turns a reconnect into an endless loop.
    onMessage?: (message: GymWsMessage) => void;
}

interface UseGymWebSocketResult {
    status: WsStatus;
    lastMessage: GymWsMessage | null;
    reconnectAttempt: number;
}

// --- 1. BACKOFF TUNING -------------------------------------------------------
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;
const JITTER_RATIO = 0.2;

// The backend closes with 1008 (policy violation) when the auth cookie is
// missing, expired or invalid - see app/api/access.py. That is not a network
// blip, and retrying it just hammers the API on behalf of a logged-out user, so
// it is the one close code we refuse to recover from.
const WS_POLICY_VIOLATION = 1008;

/**
 * Wait before retry number `attempt` (0-based): 1s, 2s, 4s, 8s, 10s, 10s...
 * each nudged by up to +/-20% so that clients do not retry in lockstep.
 */
function backoffDelay(attempt: number): number {
    const exponential = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    const jitter = exponential * JITTER_RATIO * (Math.random() * 2 - 1);
    return Math.round(exponential + jitter);
}

export function useGymWebSocket(
    url: string,
    options: UseGymWebSocketOptions = {},
): UseGymWebSocketResult {
    const { enabled = true, onMessage } = options;

    // NOTE: the initial value is set through the useState initializer, never with
    // a setState call in the effect body. The latter is what
    // react-hooks/set-state-in-effect flags, and it also costs a wasted render on
    // every mount. Every later transition comes from a socket event handler,
    // which runs long after the effect body has returned.
    const [socketStatus, setSocketStatus] = useState<WsStatus>("CONNECTING");
    const [lastMessage, setLastMessage] = useState<GymWsMessage | null>(null);
    const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);

    // --- 2. MUTABLE BOOKKEEPING ----------------------------------------------
    // All of this lives in refs rather than state on purpose: it must survive
    // re-renders, but changing it must never re-run the effect below. A single
    // one of these in the dependency array would tear the socket down and rebuild
    // it on every render - the classic way to turn a reconnect into a loop.
    const socketRef = useRef<WebSocket | null>(null);
    const retryTimerRef = useRef<number | null>(null);
    const attemptRef = useRef<number>(0);
    const seqRef = useRef<number>(0);

    // True while we are the ones closing the socket (unmount), so that the
    // onclose handler stays quiet instead of scheduling a reconnect.
    const isClosingRef = useRef<boolean>(false);

    // True once we hit a close code we will not retry (1008). Stops both the
    // backoff timer and the "back online" shortcut from resurrecting the socket.
    const hasGivenUpRef = useRef<boolean>(false);

    // Always holds the caller's newest onMessage. Declared before the connection
    // effect so that it is already up to date the first time a frame can arrive,
    // and refreshed on every render (no dependency array) so the callback never
    // sees stale props.
    const onMessageRef = useRef(onMessage);
    useEffect(() => {
        onMessageRef.current = onMessage;
    });

    useEffect(() => {
        if (!enabled) return;

        // Reset the per-mount flags. React StrictMode runs this effect, cleans it
        // up and runs it again in development, so a stale `true` left over from
        // the first pass would leave the second connection unable to reconnect.
        isClosingRef.current = false;
        hasGivenUpRef.current = false;

        const clearRetryTimer = () => {
            if (retryTimerRef.current !== null) {
                window.clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };

        const scheduleReconnect = () => {
            clearRetryTimer();

            const delay = backoffDelay(attemptRef.current);
            attemptRef.current += 1;

            setReconnectAttempt(attemptRef.current);
            setSocketStatus("CONNECTING");

            retryTimerRef.current = window.setTimeout(() => {
                retryTimerRef.current = null;
                connect();
            }, delay);
        };

        const connect = () => {
            const ws = new WebSocket(url);
            socketRef.current = ws;

            ws.onopen = () => {
                // A successful connection wipes the history of failures, so the
                // next outage starts counting from 1s again instead of 10s.
                attemptRef.current = 0;
                setReconnectAttempt(0);
                setSocketStatus("OPEN");
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const parsed: unknown = JSON.parse(String(event.data));
                    seqRef.current += 1;

                    const message: GymWsMessage = { seq: seqRef.current, data: parsed };
                    setLastMessage(message);
                    onMessageRef.current?.(message);
                } catch {
                    // A frame that is not JSON is not something this app sends.
                    // Swallow it rather than letting it kill the handler.
                }
            };

            ws.onclose = (event: CloseEvent) => {
                socketRef.current = null;

                // We closed it ourselves during cleanup - do not fight the unmount.
                if (isClosingRef.current) return;

                if (event.code === WS_POLICY_VIOLATION) {
                    hasGivenUpRef.current = true;
                    setSocketStatus("CLOSED");
                    return;
                }

                scheduleReconnect();
            };

            ws.onerror = () => {
                // The browser always follows onerror with onclose, and onclose is
                // where the retry lives. This handler exists only so that a failed
                // connection does not surface as an unhandled error event.
            };
        };

        // --- 3. COME BACK IMMEDIATELY WHEN THE NETWORK RETURNS ----------------
        // The 4G-to-WiFi handoff is the whole reason this hook exists, and the
        // browser tells us the moment it completes. Without this the socket still
        // recovers, but the user can sit and stare at a dead screen for the
        // remaining 8 seconds of a backoff window that is no longer necessary.
        const handleOnline = () => {
            if (hasGivenUpRef.current) return;   // an auth failure, not a network one
            if (socketRef.current) return;       // already open or mid-handshake

            clearRetryTimer();
            attemptRef.current = 0;
            setReconnectAttempt(0);
            setSocketStatus("CONNECTING");
            connect();
        };

        connect();
        window.addEventListener("online", handleOnline);

        // --- 4. CLEANUP --------------------------------------------------------
        return () => {
            // Order matters: raise the flag BEFORE closing, or our own close()
            // triggers onclose, which schedules a reconnect, which leaves an
            // orphaned second socket behind after every StrictMode remount.
            isClosingRef.current = true;

            window.removeEventListener("online", handleOnline);
            clearRetryTimer();

            const ws = socketRef.current;
            socketRef.current = null;

            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close(1000, "Component unmounted");
            }
        };
    }, [url, enabled]);

    return {
        // When the hook is switched off there is no socket, and reporting the
        // internal "CONNECTING" default would make callers render a reconnect
        // banner for a connection nobody asked for.
        status: enabled ? socketStatus : "CLOSED",
        lastMessage,
        reconnectAttempt,
    };
}
