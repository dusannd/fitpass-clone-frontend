# FitPass Clone - Frontend (React + Vite) 🚀

This is the frontend application for the FitPass Clone Gym Management System.
Built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.

> **Status:** 🚧 `v2-develop` phase (Active Development)

## 📌 Current Features & Capabilities

The system is fully integrated with the Python/FastAPI backend and currently supports the following modules:

### 1. Identity & RBAC (Role-Based Access Control)
- Secure JWT-based Authentication (Login/Register).
- Smart route redirection and "Auth Guards" to prevent logged-in users from seeing the login screen.
- Role-specific UI (Members, Trainers, Desk Workers, and Admins see completely different dashboards).

### 2. Subscriptions & Payments
- Members can browse active subscription plans.
- Full Stripe Checkout integration for purchasing plans.
- Dynamic Gym Access QR Code is generated on the Member Dashboard *only* if they have an active subscription (refreshes every 60s).

### 3. Desk Worker Operations (Smart Door Access)
- **Check Access:** Workers can scan or manually search member IDs to verify active subscriptions.
- **Manual Override:** Workers can open doors manually in case of emergencies, which logs their `Worker ID` and `Location ID` to the backend audit database.

### 4. Coaching & Scheduling (1-on-1)
- **Member:** Can browse all trainers, send coaching requests, and book training sessions.
- **Trainer:** Can accept/reject pending requests, view their active client list, and manage their calendar.
- Overbooking protection (Trainers cannot be double-booked) and session duration limits (max 3 hours).

### 5. Workout Tracking & Plans
- **Trainer:** Can create and publish detailed workout plans (Exercises, Sets, Reps, Rest Times).
- **Member:** Can select a plan and log their actual performance.
- **Bodyweight Support:** Dedicated checkbox for bodyweight exercises, visually differentiating them from weighted lifts (prevents 0kg entries).
- Endless scrolling pagination ("Load More") for workout history.

### 6. Admin Panel
- **Analytics Dashboard:** Live statistics of daily gym entries, failed scans, and total user count.
- **Security Audit Log:** A detailed table tracking every manual door override performed by desk workers.
- **HR Panel:** Hire/Fire staff dynamically by assigning or revoking `trainer` and `worker` roles.
- **Plan Management:** Create new pricing plans and assign them to specific gym physical locations.

---

## 💻 Tech Stack

- **Framework:** React (v19)
- **Build Tool:** Vite
- **Language:** TypeScript (Strict mode enabled)
- **Styling:** Tailwind CSS
- **API Calls:** Axios (Custom interceptor for JWT injection)
- **QR Code Generation:** `qrcode.react`

## 🛠️ Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

*(Note: The FastAPI backend must be running on `localhost:8000` for the frontend to retrieve data).*