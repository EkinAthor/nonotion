import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import PageView from './components/page/PageView';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthGuard from './components/auth/AuthGuard';
import AdminGuard from './components/auth/AdminGuard';
import UserManagementPage from './pages/admin/UserManagementPage';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<WelcomeView />} />
        <Route path="/page/:pageId" element={<PageView />} />
        <Route
          path="/admin/users"
          element={
            <AdminGuard>
              <UserManagementPage />
            </AdminGuard>
          }
        />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function WelcomeView() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-notion-text-secondary">
        <p className="text-lg">Select a page from the sidebar</p>
        <p className="text-sm mt-2">or create a new one</p>
      </div>
    </div>
  );
}

export default App;
