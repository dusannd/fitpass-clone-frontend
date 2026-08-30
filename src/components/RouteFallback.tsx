// Shown while a lazily-loaded route chunk is still downloading. Deliberately
// plain: it is on screen for a few hundred milliseconds once per chunk, and a
// heavy skeleton here would need its own code in the main bundle.
export default function RouteFallback() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-500" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Loading module…</p>
            </div>
        </div>
    );
}
