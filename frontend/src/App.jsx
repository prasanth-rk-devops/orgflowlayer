import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Departments from './pages/Departments';
import Leave from './pages/Leave';
import Approvals from './pages/Approvals';
import Audit from './pages/Audit';
import Account from './pages/Account';
import Calendar from './pages/Calendar';
import Holidays from './pages/Holidays';
import Announcements from './pages/Announcements';
import OrgChart from './pages/OrgChart';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="departments" element={<Departments />} />
        <Route path="leave" element={<Leave />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="holidays" element={<Holidays />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="org-chart" element={<OrgChart />} />
        <Route path="employees/:id" element={<Profile />} />
        <Route path="approvals" element={<Protected roles={['admin', 'manager']}><Approvals /></Protected>} />
        <Route path="reports" element={<Protected roles={['admin']}><Reports /></Protected>} />
        <Route path="audit" element={<Protected roles={['admin']}><Audit /></Protected>} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
