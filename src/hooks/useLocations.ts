import { useQuery } from "@tanstack/react-query";
import { api } from "../api/axios";
import type { GymLocation } from "../utils/subscription";

/**
 * The gyms this installation runs, for anywhere a user has to pick one.
 *
 * It exists because the worker screens used to make somebody type a raw integer
 * into a number box - the desk panel literally labelled it "Location ID:" - with
 * nothing on screen to say which gym id 3 was. Get it wrong and every member is
 * checked into the wrong building, silently, because the backend accepts any id
 * that exists.
 *
 * Shared key rather than a fetch per page: the scanner and the desk panel are
 * routinely open side by side on the same machine, and this list changes about as
 * often as the company signs a lease. `staleTime` keeps a tab switch from
 * refetching it.
 *
 * Reads `GET /subscriptions/locations`, which was admin-only until it was widened
 * to any signed-in user - a worker calling it used to get a 403.
 */
export function useLocations() {
    return useQuery({
        queryKey: ["locations"],
        queryFn: async () => (await api.get<GymLocation[]>("/subscriptions/locations")).data,
        staleTime: 5 * 60 * 1000,
    });
}
