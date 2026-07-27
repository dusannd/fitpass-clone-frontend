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


          {/* ADMIN ROUTES */}
          <Route path="/admin/plans" element={<ManagePlans />} />
          <Route path="/admin/hr" element={<HRPanel />} />

          {/* TRAINER ROUTES */}
          <Route path="/trainer/plans" element={<TrainerPlans />} />

        </Route>
      </Routes>
  );
}