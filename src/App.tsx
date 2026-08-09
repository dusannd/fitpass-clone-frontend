import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Layout from "./components/Layout";
import Subscriptions from "./pages/member/Subscriptions";
import ManagePlans from "./pages/admin/ManagePlans.tsx";
import HRPanel from "./pages/admin/HRPanel.tsx";
import TrainerPlans from "./pages/trainer/TrainerPlans.tsx";
import Workouts from "./pages/member/Workouts.tsx";
import TrainerClients from "./pages/trainer/TrainerClients.tsx";
import MemberCoaching from "./pages/member/MemberCoaching.tsx";
import MemberAppointments from "./pages/member/MemberAppointments.tsx";
import TrainerAppointments from "./pages/trainer/TrainerAppointments.tsx";
import WorkerDashboard from "./pages/worker/WorkerDashboard.tsx";
import AdminAnalytics from "./pages/admin/AdminAnalytics.tsx";
import WorkerScanner from "./pages/worker/WorkerScanner"; // <-- IMPORT SCANNER
import NotFound from "./pages/NotFound";
import RequireRole from "./components/RequireRole";

export default function App() {
    return (
        <Routes>
            {/* PUBLIC ROUTES (No Layout) */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* PROTECTED ROUTES (Wrapped inside the Layout sidebar) */}
            <Route element={<Layout />}>
                {/* All routes inside here will have the sidebar menu */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />

                {/*
                  ROLE GATED SECTIONS: <RequireRole /> mirrors the sidebar links.
                  A user without the role gets a 403 page instead of a broken screen
                  full of failed API calls. Each section also ends with its own 404,
                  so a typo like /admin/plansss keeps the sidebar around.
                */}

                {/* MEMBER ROUTES */}
                <Route element={<RequireRole allowed={["member"]} />}>
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/workouts" element={<Workouts />} />
                    <Route path="/coaching" element={<MemberCoaching />} />
                    <Route path="/appointments" element={<MemberAppointments />} />
                </Route>

                {/* WORKER ROUTES */}
                <Route element={<RequireRole allowed={["worker"]} />}>
                    <Route path="/worker/dashboard" element={<WorkerDashboard />} />
                    {/*
                      ROUTE DEFINITION ONLY: This tells React what component to load
                      when the URL changes to /worker/scanner
                    */}
                    <Route path="/worker/scanner" element={<WorkerScanner />} />
                    <Route path="/worker/*" element={<NotFound />} />
                </Route>

                {/* ADMIN ROUTES */}
                <Route element={<RequireRole allowed={["admin"]} />}>
                    <Route path="/admin/plans" element={<ManagePlans />} />
                    <Route path="/admin/hr" element={<HRPanel />} />
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                    <Route path="/admin/*" element={<NotFound />} />
                </Route>

                {/* TRAINER ROUTES */}
                <Route element={<RequireRole allowed={["trainer"]} />}>
                    <Route path="/trainer/plans" element={<TrainerPlans />} />
                    <Route path="/trainer/clients" element={<TrainerClients />} />
                    <Route path="/trainer/appointments" element={<TrainerAppointments />} />
                    <Route path="/trainer/*" element={<NotFound />} />
                </Route>

            </Route>

            {/*
              404 CATCH-ALL: everything else. Kept outside of Layout so a logged
              out visitor on a broken link actually sees the 404 instead of being
              bounced to /login by the Layout auth check.
            */}
            <Route path="*" element={<NotFound standalone />} />
        </Routes>
    );
}