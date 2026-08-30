import { Link } from "react-router-dom";
import Avatar from "./Avatar";
import { activeTrainers, pendingTrainers, trainerName, type CoachingLink } from "../utils/coaching";

interface MyTrainerChipProps {
    links: CoachingLink[];
    /**
     * Find a Trainer IS the call to action, so it leaves this off and the chip renders
     * nothing at all when the member has no trainer yet.
     */
    showEmptyState?: boolean;
}

/**
 * "Who is my trainer", stated at the top of the page.
 *
 * Purely presentational on purpose: the pages that show it already load the coaching
 * links, so fetching in here would mean asking the API twice for the same thing.
 */
export default function MyTrainerChip({ links, showEmptyState = false }: MyTrainerChipProps) {
    const active = activeTrainers(links);
    const pending = pendingTrainers(links);

    // --- 1. THE NORMAL CASE: SOMEBODY IS COACHING YOU ---
    if (active.length > 0) {
        const [trainer, ...others] = active;

        return (
            <Link
                to="/coaching"
                className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50 transition-colors group"
            >
                <Avatar profile={trainer.profile} firstName={trainer.first_name} size="sm" />

                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Your Trainer
                    </p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:underline">
                        {trainerName(trainer)}
                    </p>
                </div>

                {/* Coaching by two trainers at once is rare, but it must not break the row */}
                {others.length > 0 && (
                    <span className="shrink-0 text-[10px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-1 rounded-full">
                        +{others.length}
                    </span>
                )}
            </Link>
        );
    }

    // --- 2. ASKED, STILL WAITING ---
    if (pending.length > 0) {
        const [trainer] = pending;

        return (
            <Link
                to="/coaching"
                className="flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors group"
            >
                <Avatar profile={trainer.profile} firstName={trainer.first_name} size="sm" />

                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        ⏳ Request pending
                    </p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:underline">
                        {trainerName(trainer)}
                    </p>
                </div>
            </Link>
        );
    }

    // --- 3. NOBODY YET ---
    if (!showEmptyState) return null;

    return (
        <Link
            to="/coaching"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
        >
            No trainer yet · Find one →
        </Link>
    );
}
