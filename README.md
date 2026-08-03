# FitPass Clone - Frontend Application

A modern, high-performance React frontend for the FitPass Clone / Gym Management system. Built with React 19, TypeScript, Vite, and Tailwind CSS, this application delivers a seamless, secure, and role-driven experience for gym members, personal trainers, desk workers, and administrators.

![React](https://img.shields.io/badge/React-19-blue.svg?style=flat&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg?style=flat&logo=tailwind-css)
![Vite](https://img.shields.io/badge/Vite-Lightning_Fast-646CFF.svg?style=flat&logo=vite)

---

## Key Features & Capabilities

### Advanced Security & Anti-Fraud
* **Bulletproof QR Gym Access:** Turnstile entry/exit system via QR codes. Features 5-minute TTLs, localStorage state persistence (survives page refreshes), and responsive UI cooldowns parsing 429 Too Many Requests API limits.
* **Real-time WebSocket Sync:** Listens for turnstile scanner events. Once scanned, the QR code is instantly wiped from memory and the screen to prevent screenshot/replay attacks.
* **Bot Protection:** Registration and Login forms are secured with invisible Honeypot fields and Google reCAPTCHA v3.
* **Secure Sessions:** Fully configured to use HTTP-Only JWT cookies via Axios interceptors, automatically redirecting users upon session expiration (401 Unauthorized).

### Role-Based Access Control (RBAC)
* **Members:** Buy subscriptions via Stripe, request 1-on-1 coaching, book sessions, and track workout progress via interactive area charts (Recharts).
* **Trainers:** Create public/private workout plans (with granular set/rep/rest and weight-tracking rules), accept/decline client requests, and manage daily appointment schedules.
* **Desk Workers:** Check member subscription statuses in real-time and execute manual door overrides with audit logging.
* **Admins:** Comprehensive HR panel to dynamically hire/fire staff (assign roles) and view system-wide analytics.

---

## Tech Stack

* **Core:** React 19, TypeScript, Vite
* **Routing:** React Router DOM v7
* **Data Fetching & Caching:** TanStack React Query v5, Axios
* **Styling:** Tailwind CSS (Fully configured for Dark/Light mode)
* **Data Visualization:** Recharts (For strength progress tracking)
* **Utilities:** qrcode.react (Dynamic QR generation), react-google-recaptcha

---

## Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) (v18 or higher) installed.

### 2. Installation
Clone the repository and install the dependencies:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root of the project and configure the following variables:
```env
# The base URL of your FastAPI backend
VITE_API_BASE_URL=http://localhost:8000/api

# Security configurations
VITE_FEATURE_RECAPTCHA=true
VITE_RECAPTCHA_SITE_KEY=your_google_recaptcha_site_key_here
```

### 4. Run the Development Server
Start the Vite development server:
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

---

## Recent Updates (Latest PR Highlights)

* **QR Logic Overhaul:** Migrated from auto-polling to manual, intent-based (ENTRY/EXIT) QR generation.
* **ESLint Zero Warnings:** Refactored interval timers with lazy initialization to eliminate cascading render bugs and strictly typed all variables.
* **Persistent States:** Implemented localStorage syncing for active QR tokens and rate-limit cooldowns, ensuring flawless UX even if the user reloads the browser.
* **UI Polish:** Replaced static placeholders with professional frosted-glass UI components and blurred QR placeholders for inactive states.