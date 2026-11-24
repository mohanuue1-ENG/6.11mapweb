import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import PageTitle from './components/common/PageTitle';
import { AuthProvider, useAuth, homePathFor } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { GpsProvider } from './context/GpsContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DashboardLayout from './components/layout/DashboardLayout';

// Public Pages
import Home from './pages/public/Home';
import About from './pages/public/About';
import Features from './pages/public/Features';
import Pricing from './pages/public/Pricing';
import Contact from './pages/public/Contact';
import Subscribe from './pages/public/Subscribe';
import SubscribeComplete from './pages/public/SubscribeComplete';
import CompanySetup from './pages/public/CompanySetup';
import CreateAccount from './pages/public/CreateAccount';
import Download from './pages/public/Download';
import Privacy from './pages/public/Privacy';
import { isFirstVisit, markSiteSeen } from './services/signupDraft';
import SetPassword from './pages/public/SetPassword';
import ForgotPassword from './pages/public/ForgotPassword';
import SignupComplete from './pages/public/SignupComplete';
import MockCheckout from './pages/public/MockCheckout';
import SuperAdminRequests from './pages/superadmin/SuperAdminRequests';
import Login from './pages/public/Login';

// Company Admin Pages
import CompanyDashboard from './pages/company/CompanyDashboard';
import LiveTracking from './pages/company/LiveTracking';
import Trips from './pages/company/Trips';
import GpsLocationHistory from './pages/company/GpsLocationHistory';
import Trucks from './pages/company/Trucks';
import Drivers from './pages/company/Drivers';
import Notifications from './pages/company/Notifications';
import Reports from './pages/company/Reports';
import CompanyProfile from './pages/company/CompanyProfile';

// Super Admin Pages
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import SuperAdminCompanies from './pages/superadmin/SuperAdminCompanies';
import SuperAdminPayments from './pages/superadmin/SuperAdminPayments';
import SuperAdminPlans from './pages/superadmin/SuperAdminPlans';
import SuperAdminAuditLogs from './pages/superadmin/SuperAdminAuditLogs';

// Driver Mobile View
import DriverPortal from './pages/driver/DriverPortal';

function PublicLayout({ children }) {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col min-h-dvh bg-app text-ink">
      <Navbar />
      <main key={pathname} className="flex-1 anim-rise">{children}</main>
      <Footer />
    </div>
  );
}

function DriverLayout({ children }) {
  return <div className="min-h-dvh bg-app text-ink px-3">{children}</div>;
}

function SessionLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-xs text-gray-500" role="status">
      Loading…
    </div>
  );
}

// Shows a private page only to a signed-in user with one of the given roles.
// This is for navigation only: the API enforces the same rule on every request.
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  // The account exists, but the dashboard opens only after the plan is paid.
  if (user.role === 'COMPANY_ADMIN' && user.subscribed === false) return <Navigate to="/subscribe" replace />;
  // Paid, but the company has not told us about itself yet.
  if (user.role === 'COMPANY_ADMIN' && user.needsSetup) return <Navigate to="/company-setup" replace />;
  return children;
}

// The plan page: for a signed-in company administrator. A company that has paid goes to its dashboard instead.
function PlanGuard({ children, allowPaid = false }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: '/subscribe' }} />;
  if (user.role !== 'COMPANY_ADMIN') return <Navigate to={homePathFor(user.role)} replace />;
  if (user.subscribed && !allowPaid) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}

// Asked once, right after the first payment.
function SetupGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'COMPANY_ADMIN') return <Navigate to={homePathFor(user.role)} replace />;
  if (!user.subscribed) return <Navigate to="/subscribe" replace />;
  if (!user.needsSetup) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}

// Login and Register are pointless once signed in.
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoading />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;
  return children;
}

// A person's very first visit goes straight to "Create account". Later visits, and anyone signed in, see the home page.
function FirstVisit({ children }) {
  const { user, loading } = useAuth();
  const [first] = React.useState(() => isFirstVisit());
  React.useEffect(() => markSiteSeen(), []);
  if (loading) return <SessionLoading />;
  if (first && !user) return <Navigate to="/create-account" replace />;
  return children;
}

const company = (page) => (
  <Protected roles={['COMPANY_ADMIN']}>
    <DashboardLayout>{page}</DashboardLayout>
  </Protected>
);
const superAdmin = (page) => (
  <Protected roles={['SUPER_ADMIN']}>
    <DashboardLayout>{page}</DashboardLayout>
  </Protected>
);

function AppRoutes() {
  return (
    <>
    <PageTitle />
    <Routes>
      {/* Public Pages with Top Glass Navbar & Footer */}
      <Route path="/" element={<FirstVisit><PublicLayout><Home /></PublicLayout></FirstVisit>} />
      <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
      <Route path="/features" element={<PublicLayout><Features /></PublicLayout>} />
      <Route path="/pricing" element={<PublicLayout><Pricing /></PublicLayout>} />
      <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
      <Route path="/download" element={<PublicLayout><Download /></PublicLayout>} />
      <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
      <Route path="/create-account" element={<GuestOnly><CreateAccount /></GuestOnly>} />
      <Route path="/join" element={<Navigate to="/create-account" replace />} />
      <Route path="/company-setup" element={<SetupGuard><CompanySetup /></SetupGuard>} />
      <Route path="/subscribe" element={<PlanGuard><Subscribe /></PlanGuard>} />
      <Route path="/subscribe/complete" element={<PlanGuard allowPaid><SubscribeComplete /></PlanGuard>} />
      <Route path="/request-access" element={<Navigate to="/create-account" replace />} />
      <Route path="/register" element={<Navigate to="/create-account" replace />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/signup/complete" element={<SignupComplete />} />
      <Route path="/mock-checkout" element={<MockCheckout />} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />

      {/* Company Admin Dashboard with Left Sidebar + Top Header Glassmorphism */}
      <Route path="/company/dashboard" element={company(<CompanyDashboard />)} />
      <Route path="/company/live-tracking" element={company(<LiveTracking />)} />
      <Route path="/company/trips" element={company(<Trips />)} />
      <Route path="/company/gps-history" element={company(<GpsLocationHistory />)} />
      <Route path="/company/trucks" element={company(<Trucks />)} />
      <Route path="/company/drivers" element={company(<Drivers />)} />
      <Route path="/company/notifications" element={company(<Notifications />)} />
      <Route path="/company/reports" element={company(<Reports />)} />
      <Route path="/company/profile" element={company(<CompanyProfile />)} />

      {/* Super Admin Dashboard with Left Sidebar */}
      <Route path="/superadmin" element={superAdmin(<SuperAdminDashboard />)} />
      <Route path="/superadmin/companies" element={superAdmin(<SuperAdminCompanies />)} />
      <Route path="/superadmin/payments" element={superAdmin(<SuperAdminPayments />)} />
      <Route path="/superadmin/requests" element={superAdmin(<SuperAdminRequests />)} />
      <Route path="/superadmin/plans" element={superAdmin(<SuperAdminPlans />)} />
      <Route path="/superadmin/audit-logs" element={superAdmin(<SuperAdminAuditLogs />)} />

      {/* Driver Mobile View with Native Bottom Nav */}
      <Route
        path="/driver/portal"
        element={<Protected roles={['DRIVER']}><DriverLayout><DriverPortal /></DriverLayout></Protected>}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GpsProvider>
          <Router>
            <AppRoutes />
          </Router>
        </GpsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
