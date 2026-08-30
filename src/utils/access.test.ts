import { describe, it, expect } from "vitest";
import { isQrSpent } from "./access";

describe("isQrSpent", () => {
    // The bug this encodes: a scanned code stayed "valid" on the client for the
    // rest of its five minutes, because the only death the dashboard understood
    // was the clock running out. Refresh, and the dead code came back on screen.
    it("treats an ENTRY code as spent once the member is inside", () => {
        expect(isQrSpent("ENTRY", "INSIDE")).toBe(true);
    });

    it("treats an EXIT code as spent once the member is outside", () => {
        expect(isQrSpent("EXIT", "OUTSIDE")).toBe(true);
    });

    // The other half matters just as much. A code the member is holding up to the
    // scanner right now must survive - blanking it would be a worse bug than the
    // one being fixed.
    it("keeps an ENTRY code while the member is still outside", () => {
        expect(isQrSpent("ENTRY", "OUTSIDE")).toBe(false);
    });

    it("keeps an EXIT code while the member is still inside", () => {
        expect(isQrSpent("EXIT", "INSIDE")).toBe(false);
    });

    // The status query has not answered yet on the first paint after a refresh -
    // exactly the moment this runs. No evidence is not evidence of a dead code.
    it("assumes nothing while the status is still loading", () => {
        expect(isQrSpent("ENTRY", "LOADING")).toBe(false);
        expect(isQrSpent("EXIT", "LOADING")).toBe(false);
    });

    it("has nothing to judge when no code is stored", () => {
        expect(isQrSpent(null, "INSIDE")).toBe(false);
        expect(isQrSpent(null, "OUTSIDE")).toBe(false);
        expect(isQrSpent(null, "LOADING")).toBe(false);
    });
});
