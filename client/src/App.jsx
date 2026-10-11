import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { Spinner } from './components/ui/index.jsx';
import AuthPage from './pages/AuthPage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import DatasetsPage from './pages/DatasetsPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ExplorerPage from './pages/ExplorerPage.jsx';
import ChartsPage from './pages/ChartsPage.jsx';
import DashboardsPage from './pages/DashboardsPage.jsx';
import DashboardBuilderPage from './pages/DashboardBuilderPage.jsx';
import InsightsPage from './pages/InsightsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ReportViewPage from './pages/ReportViewPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner label="Restoring session..." /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? <Navigate to="/app" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<OverviewPage />} />
        <Route path="datasets" element={<DatasetsPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="explorer" element={<ExplorerPage />} />
        <Route path="explorer/:datasetId" element={<ExplorerPage />} />
        <Route path="charts" element={<ChartsPage />} />
        <Route path="charts/:datasetId" element={<ChartsPage />} />
        <Route path="dashboards" element={<DashboardsPage />} />
        <Route path="dashboards/:dashboardId" element={<DashboardBuilderPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="insights/:datasetId" element={<InsightsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:reportId" element={<ReportViewPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
