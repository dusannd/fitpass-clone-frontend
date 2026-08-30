import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GymWsMessage } from "./useGymWebSocket";
import { useGymWebSocket } from "./useGymWebSocket";

const WS_URL = "ws://localhost/api/access/ws";

// Every socket the hook has ever opened, oldest first. This is how the reconnection
// tests tell "it retried" apart from "it never gave up in the first place".
const sockets: MockWebSocket[] = [];

/**
 * A WebSocket stand-in with a hand crank.
 *
 * The statics matter as much as the instance: the hook's cleanup compares
 * `ws.readyState` against `WebSocket.OPEN` and `WebSocket.CONNECTING`, read off the
 * global at that moment. A stub without them would leave both comparisons false and
 * close() would silently never be called.
 */
class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState: number = MockWebSocket.CONNECTING;
    readonly url: string;

    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: (() => void) | null = null;

    // The keepalive writes to this. A mock without it would make every test that
    // fast-forwards past the heartbeat interval die on "send is not a function"
    // rather than on whatever it was actually asserting.
    send = vi.fn();

    // A real browser fires onclose after close(), which is exactly what pushes the
    // hook through its "we closed this ourselves" guard. Skipping it would make the
    // unmount test pass without ever exercising that branch.
    close = vi.fn((code = 1000, reason = "") => {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code, reason } as CloseEvent);
    });

    constructor(url: string) {
        this.url = url;
        sockets.push(this);
    }

    // --- THE CRANK ---
    simulateOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
    }

    simulateMessage(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    }

    simulateRawFrame(raw: string) {
        this.onmessage?.({ data: raw } as MessageEvent);
    }

    /** A drop from the other side. 1006 = abnormal closure, i.e. the network died. */
    simulateClose(code: number) {
        if (this.readyState === MockWebSocket.CLOSED) return;
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code, reason: "" } as CloseEvent);
    }
}

// --- HOOK HARNESS ---
// Named `use...` on purpose: react-hooks/rules-of-hooks rejects a hook called from an
// anonymous callback, and it reads better than an eslint-disable.
interface HookProps {
    url?: string;
    enabled?: boolean;
    onMessage?: (message: GymWsMessage) => void;
}

const useHookUnderTest = ({ url = WS_URL, enabled, onMessage }: HookProps = {}) =>
    useGymWebSocket(url, { enabled, onMessage });

/** The socket the hook is currently using - always the most recent one it opened. */
const latest = () => sockets[sockets.length - 1];

const goOnline = () => {
    act(() => {
        window.dispatchEvent(new Event("online"));
    });
};

const advance = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
};

beforeEach(() => {
    sockets.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.useFakeTimers();

    // The backoff nudges every wait by up to +/-20% so that clients do not retry in
    // lockstep. 0.5 lands dead centre - `Math.random() * 2 - 1` becomes 0 - so the
    // jitter cancels out and the waits are exactly 1000, 2000, 4000 ms. Without this
    // the test would have to fast-forward "roughly" a second, which proves nothing
    // about the doubling.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
    vi.useRealTimers();
    // restoreMocks puts spies back, but it does not undo stubGlobal.
    vi.unstubAllGlobals();
});

// --- 1. OPENING THE CONNECTION ---------------------------------------------------

describe("useGymWebSocket - connecting", () => {
    it("opens exactly one socket to the given url and starts out CONNECTING", () => {
        const { result } = renderHook(useHookUnderTest);

        expect(sockets).toHaveLength(1);
        expect(sockets[0].url).toBe(WS_URL);
        expect(result.current.status).toBe("CONNECTING");
        expect(result.current.lastMessage).toBeNull();
    });

    it("reports OPEN once the socket opens", () => {
        const { result } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });

        expect(result.current.status).toBe("OPEN");
        expect(result.current.reconnectAttempt).toBe(0);
    });

    // enabled: false is how Dashboard keeps the hook mounted for a non-member instead
    // of calling it conditionally. Reporting the internal "CONNECTING" default here
    // would make callers render a reconnect banner for a socket nobody asked for.
    it("opens nothing and reports CLOSED while disabled", () => {
        const { result } = renderHook(useHookUnderTest, { initialProps: { enabled: false } });

        expect(sockets).toHaveLength(0);
        expect(result.current.status).toBe("CLOSED");
    });

    it("connects as soon as it is enabled", () => {
        const { result, rerender } = renderHook(useHookUnderTest, {
            initialProps: { enabled: false } as HookProps,
        });

        // The real sequence on the dashboard: isMember only becomes true once
        // /users/me has answered.
        rerender({ enabled: true });

        expect(sockets).toHaveLength(1);
        expect(result.current.status).toBe("CONNECTING");
    });
});

// --- 2. RECEIVING MESSAGES -------------------------------------------------------

describe("useGymWebSocket - messages", () => {
    it("parses a frame into lastMessage and hands it to onMessage", () => {
        const onMessage = vi.fn();
        const { result } = renderHook(useHookUnderTest, { initialProps: { onMessage } });

        act(() => {
            latest().simulateOpen();
            latest().simulateMessage({ type: "ACCESS_EVENT", granted: true });
        });

        expect(result.current.lastMessage).toEqual({
            seq: 1,
            data: { type: "ACCESS_EVENT", granted: true },
        });
        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith(result.current.lastMessage);
    });

    // Two Manual Overrides in a row carry an identical payload. The consumer reacts
    // through a useEffect keyed on the message object, so a repeat has to arrive as a
    // new object with a new seq - otherwise the second door event is silently ignored.
    it("gives two identical payloads distinct seq numbers and identities", () => {
        const onMessage = vi.fn<(message: GymWsMessage) => void>();
        renderHook(useHookUnderTest, { initialProps: { onMessage } });

        const payload = { type: "ACCESS_EVENT", reason: "Manual Override" };
        act(() => {
            latest().simulateOpen();
            latest().simulateMessage(payload);
            latest().simulateMessage(payload);
        });

        const [first] = onMessage.mock.calls[0];
        const [second] = onMessage.mock.calls[1];

        expect(first.seq).toBe(1);
        expect(second.seq).toBe(2);
        expect(second).not.toBe(first);
        expect(second.data).toEqual(first.data);
    });

    it("swallows a frame that is not JSON instead of dying on it", () => {
        const onMessage = vi.fn();
        const { result } = renderHook(useHookUnderTest, { initialProps: { onMessage } });

        act(() => {
            latest().simulateOpen();
            latest().simulateMessage({ type: "ACCESS_EVENT" });
            latest().simulateRawFrame("<html>gateway timeout</html>");
        });

        // The good message before it is still the last one we saw.
        expect(result.current.lastMessage?.seq).toBe(1);
        expect(onMessage).toHaveBeenCalledTimes(1);
    });
});

// --- 3. EXPONENTIAL BACKOFF ------------------------------------------------------

describe("useGymWebSocket - reconnection", () => {
    const dropTheNetwork = () => {
        act(() => {
            latest().simulateClose(1006); // abnormal closure
        });
    };

    it("waits before retrying rather than reconnecting on the spot", () => {
        const { result } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        dropTheNetwork();

        expect(sockets).toHaveLength(1);
        expect(result.current.status).toBe("CONNECTING");
        expect(result.current.reconnectAttempt).toBe(1);
    });

    // This is the assertion that separates a backoff from a retry-every-second loop:
    // each wait has to be twice the last one.
    it("doubles the wait after every failure: 1s, 2s, 4s", () => {
        renderHook(useHookUnderTest);

        dropTheNetwork();
        advance(999);
        expect(sockets).toHaveLength(1);
        advance(1);
        expect(sockets).toHaveLength(2);

        dropTheNetwork();
        advance(1999);
        expect(sockets).toHaveLength(2);
        advance(1);
        expect(sockets).toHaveLength(3);

        dropTheNetwork();
        advance(3999);
        expect(sockets).toHaveLength(3);
        advance(1);
        expect(sockets).toHaveLength(4);
    });

    it("counts the attempts it has made", () => {
        const { result } = renderHook(useHookUnderTest);

        dropTheNetwork();
        expect(result.current.reconnectAttempt).toBe(1);

        advance(1000);
        dropTheNetwork();
        expect(result.current.reconnectAttempt).toBe(2);
    });

    // A connection that comes back wipes the history of failures, so the next outage
    // starts at 1s again instead of picking up at 4s.
    it("resets the backoff after a connection succeeds", () => {
        const { result } = renderHook(useHookUnderTest);

        dropTheNetwork();
        advance(1000);
        dropTheNetwork();
        advance(2000);
        expect(sockets).toHaveLength(3);

        act(() => {
            latest().simulateOpen();
        });
        expect(result.current.reconnectAttempt).toBe(0);

        // Third outage, but the ladder starts from the bottom again.
        dropTheNetwork();
        advance(999);
        expect(sockets).toHaveLength(3);
        advance(1);
        expect(sockets).toHaveLength(4);
    });

    // The 4G-to-WiFi handoff is the whole reason this hook exists. The browser tells
    // us the moment it completes, and sitting out the rest of an 8 second window then
    // is just a user staring at a dead screen.
    it("reconnects immediately when the network comes back, without waiting out the timer", () => {
        const { result } = renderHook(useHookUnderTest);

        dropTheNetwork();
        advance(1000);
        dropTheNetwork(); // second failure, now a 2s window
        expect(sockets).toHaveLength(2);

        goOnline();
        expect(sockets).toHaveLength(3);
        expect(result.current.reconnectAttempt).toBe(0);

        // The window it short-circuited must not fire a second socket afterwards.
        advance(10000);
        expect(sockets).toHaveLength(3);
    });

    it("ignores an online event while a socket is already up", () => {
        renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        goOnline();

        expect(sockets).toHaveLength(1);
    });
});

// --- 4. THE ONE CLOSE CODE WE REFUSE TO RETRY ------------------------------------

describe("useGymWebSocket - policy violation", () => {
    // The backend closes with 1008 when the auth cookie is missing, expired or
    // invalid. That is not a network blip: retrying it means a logged-out browser
    // hammering the API forever on nobody's behalf.
    it("gives up for good on 1008", () => {
        const { result } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
            latest().simulateClose(1008);
        });

        expect(result.current.status).toBe("CLOSED");

        advance(30000);
        expect(sockets).toHaveLength(1);
    });

    it("stays given up even when the network comes back", () => {
        renderHook(useHookUnderTest);

        act(() => {
            latest().simulateClose(1008);
        });
        goOnline();

        expect(sockets).toHaveLength(1);
    });

    it("still retries every other close code", () => {
        renderHook(useHookUnderTest);

        act(() => {
            latest().simulateClose(1001); // going away
        });
        advance(1000);

        expect(sockets).toHaveLength(2);
    });
});

// --- 5. CLEANUP ------------------------------------------------------------------

describe("useGymWebSocket - unmount", () => {
    it("closes the socket with a normal closure", () => {
        const { unmount } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        const socket = sockets[0];

        unmount();

        expect(socket.close).toHaveBeenCalledWith(1000, "Component unmounted");
        expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    });

    // Our own close() fires onclose, which is where the retry lives. Without the
    // "we are closing" flag being raised first, every unmount would leave an orphaned
    // socket behind - and in StrictMode that happens on every single mount.
    it("does not schedule a reconnect for a close it performed itself", () => {
        const { unmount } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        unmount();

        advance(30000);
        expect(sockets).toHaveLength(1);
    });

    it("drops a pending retry timer", () => {
        const { unmount } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateClose(1006);
        });
        unmount(); // the 1s window is still ticking

        advance(30000);
        expect(sockets).toHaveLength(1);
    });

    // Behavioural proof that the listener came off: a leaked one would open a socket
    // for a component that no longer exists.
    it("stops listening for the network coming back", () => {
        const { unmount } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateClose(1006);
        });
        unmount();
        goOnline();

        expect(sockets).toHaveLength(1);
    });
});

// --- 6. KEEPALIVE ----------------------------------------------------------------

describe("useGymWebSocket - keepalive", () => {
    // Cloudflare reclaims a WebSocket that has been silent for ~100s, and this
    // socket is silent by design: it exists to wait for a turnstile scan. Without
    // a heartbeat the connection dies in production and works perfectly in dev,
    // which is the worst shape a bug can have.
    it("sends a frame every 45s while the socket is open", () => {
        renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        const socket = latest();

        advance(44999);
        expect(socket.send).not.toHaveBeenCalled();

        advance(1);
        expect(socket.send).toHaveBeenCalledTimes(1);

        advance(45000);
        expect(socket.send).toHaveBeenCalledTimes(2);
    });

    // Nothing is sent before the handshake completes: a frame on a CONNECTING
    // socket is a hard throw in the browser, not a no-op.
    it("sends nothing until the socket has opened", () => {
        renderHook(useHookUnderTest);

        advance(45000);

        expect(latest().send).not.toHaveBeenCalled();
    });

    it("stops pinging a socket the network has dropped", () => {
        renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        const dead = latest();

        act(() => {
            dead.simulateClose(1006);
        });

        // Long enough to cover both the 1s reconnect window and a heartbeat tick.
        advance(60000);

        expect(dead.send).not.toHaveBeenCalled();
    });

    // A leaked interval is invisible until it fires on an unmounted component.
    it("stops pinging after unmount", () => {
        const { unmount } = renderHook(useHookUnderTest);

        act(() => {
            latest().simulateOpen();
        });
        const socket = sockets[0];

        unmount();
        advance(60000);

        expect(socket.send).not.toHaveBeenCalled();
    });
});

// --- 7. WHAT MUST NOT REBUILD THE SOCKET -----------------------------------------

describe("useGymWebSocket - dependencies", () => {
    // Dashboard builds a fresh handleAccessEvent on every single render and passes it
    // straight in. If the callback's identity were a dependency of the connection,
    // that would be an endless reconnect loop. The hook keeps it in a ref instead,
    // and this is the test standing between that design and a one-word regression.
    it("does not reconnect when the onMessage callback changes identity", () => {
        const first = vi.fn();
        const second = vi.fn();

        const { rerender } = renderHook(useHookUnderTest, {
            initialProps: { onMessage: first } as HookProps,
        });

        act(() => {
            latest().simulateOpen();
        });

        rerender({ onMessage: second });
        rerender({ onMessage: vi.fn() });
        rerender({ onMessage: second });

        expect(sockets).toHaveLength(1);
    });

    it("delivers the next message to the newest callback, not the one it started with", () => {
        const first = vi.fn();
        const second = vi.fn();

        const { rerender } = renderHook(useHookUnderTest, {
            initialProps: { onMessage: first } as HookProps,
        });

        act(() => {
            latest().simulateOpen();
        });
        rerender({ onMessage: second });

        act(() => {
            latest().simulateMessage({ type: "ACCESS_EVENT" });
        });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    // The url, on the other hand, genuinely is a different connection.
    it("tears the socket down and rebuilds it when the url changes", () => {
        const { rerender } = renderHook(useHookUnderTest, {
            initialProps: { url: WS_URL } as HookProps,
        });

        act(() => {
            latest().simulateOpen();
        });
        const original = sockets[0];

        rerender({ url: "ws://localhost/api/access/ws?v=2" });

        expect(original.close).toHaveBeenCalledWith(1000, "Component unmounted");
        expect(sockets).toHaveLength(2);
        expect(sockets[1].url).toBe("ws://localhost/api/access/ws?v=2");
    });
});
