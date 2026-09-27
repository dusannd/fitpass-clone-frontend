import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import RefreshButton from "./RefreshButton";

describe("RefreshButton", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("refetches and spins until both the data and the minimum turn are done", async () => {
        vi.useFakeTimers();

        // A refetch we resolve by hand, to hold the button mid-refresh.
        let finish: () => void = () => undefined;
        const onRefresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

        render(<RefreshButton onRefresh={onRefresh} label="Refresh the schedule" />);
        const button = screen.getByRole("button", { name: "Refresh the schedule" });

        fireEvent.click(button);
        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(button).toBeDisabled();
        expect(button.querySelector("svg")).toHaveClass("animate-spin");

        // Data back quickly, but the minimum spin has not passed yet: still spinning.
        await act(async () => {
            finish();
            await vi.advanceTimersByTimeAsync(100);
        });
        expect(button).toBeDisabled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(600);
        });
        expect(button).toBeEnabled();
        expect(button.querySelector("svg")).not.toHaveClass("animate-spin");
    });

    it("stops spinning when the refresh fails", async () => {
        vi.useFakeTimers();
        const onRefresh = vi.fn(() => Promise.reject(new Error("offline")));

        render(<RefreshButton onRefresh={onRefresh} label="Refresh" />);
        const button = screen.getByRole("button", { name: "Refresh" });

        fireEvent.click(button);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(700);
        });

        expect(button).toBeEnabled();
    });
});
