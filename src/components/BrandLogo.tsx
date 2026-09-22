// --- BRAND LOGO ---
// The README banner's mark, rebuilt as inline SVG + text instead of an <img>.
// banner.png has an opaque dark background and a baked-in white "Clone", so it
// would sit as a black box in light mode. Here every part follows the theme.

interface BrandLogoProps {
    // Mark only, for the narrow mobile header
    compact?: boolean;
}

export default function BrandLogo({ compact = false }: BrandLogoProps) {
    return (
        <span className="inline-flex items-center gap-2">
            {/* 1. QR-style mark: three finder squares plus the scan strokes */}
            <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 shrink-0 text-blue-600 dark:text-blue-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <rect x="2" y="2" width="8" height="8" rx="2" />
                <rect x="14" y="2" width="8" height="8" rx="2" />
                <rect x="2" y="14" width="8" height="8" rx="2" />
                <path d="M14 14v3h3M21 14v3M14 21h3M20.5 20v1.5" />
            </svg>

            {/* 2. Wordmark: blue "Fitpass", neutral "Clone" */}
            {compact ? (
                <span className="sr-only">FitpassClone</span>
            ) : (
                <span className="text-2xl font-bold tracking-tight leading-none">
                    <span className="text-blue-600 dark:text-blue-500">Fitpass</span>
                    <span className="text-gray-900 dark:text-white">Clone</span>
                </span>
            )}
        </span>
    );
}
