import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
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

          {/* MEMBER ROUTES */}
          <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/workouts" element={<Workouts />} />
            <Route path="/coaching" element={<MemberCoaching />} />
            <Route path="/appointments" element={<MemberAppointments />} />

            {/* WORKER ROUTES */}
            <Route path="/worker/dashboard" element={<WorkerDashboard />} />

            {/* ADMIN ROUTES */}
          <Route path="/admin/plans" element={<ManagePlans />} />
          <Route path="/admin/hr" element={<HRPanel />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
          {/* TRAINER ROUTES */}
          <Route path="/trainer/plans" element={<TrainerPlans />} />
            <Route path="/trainer/clients" element={<TrainerClients />} />
            <Route path="/trainer/appointments" element={<TrainerAppointments />} />

        </Route>
      </Routes>
  );
}