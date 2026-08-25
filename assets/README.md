# Media assets

Every image and animation referenced by [`../README.md`](../README.md) and
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) lives in this folder.

The filenames below are **already wired into those documents**. Drop a file in
under the exact name and it appears in place — no Markdown editing needed. Until
then GitHub renders a broken-image icon, which is expected.

## What to capture

### Banner

| File | Notes |
|---|---|
| `banner.png` | Title banner at the top of the README. Wide (roughly 1280×320), same visual language as the app: rounded corners, `font-black` heading, blue-600 accent. The backend repo's `assets/banner.png` is the reference. |

### Animations (GIF)

Keep them short — 6 to 10 seconds, under ~5 MB each. GitHub loads them inline on
the README, so a 30 MB recording makes the page unusable on mobile.

| File | What the recording should show |
|---|---|
| `qr-turnstile.gif` | `Dashboard` → pick **ENTRY** → QR appears with its countdown → the scanner consumes it → the QR is wiped from the screen the instant the WebSocket event lands. This is the single most impressive flow in the app; it is worth recording both screens side by side. |
| `worker-scanner.gif` | `/worker/scanner` on a phone: the camera preview picks up a member's QR and the verdict panel flips to **GRANTED** (and once to **DENIED**, if you can stage one). |
| `live-workout.gif` | `LiveWorkoutModal`: logging a set, the rest timer counting down and beeping, and a personal record being detected. |
| `dark-mode.gif` | The theme toggle in the sidebar, light → dark, on a content-heavy page so the whole palette swaps visibly. |

### Screenshots (PNG)

Full-page captures, light mode, on a desktop viewport (1440px wide is a good
default). Use a seeded demo account so the panels are not empty.

| File | Screen |
|---|---|
| `dashboard.png` | Member dashboard — QR panel, subscription standing, INSIDE/OUTSIDE badge |
| `subscriptions.png` | `/subscriptions` — the Stripe plan cards with their perks |
| `workouts.png` | `/workouts` — the Recharts progress chart with real history behind it |
| `trainer-plans.png` | `/trainer/plans` — the workout plan editor with sets, reps and rest filled in |
| `worker-dashboard.png` | `/worker/dashboard` — the currently-inside list and a member lookup result |
| `admin-analytics.png` | `/admin/analytics` — MRR, peak hours and the weekly breakdown |

## A note on privacy

These end up in a public repository. Use seeded demo data — no real member names,
no real email addresses, and no live Stripe identifiers in a screenshot.
