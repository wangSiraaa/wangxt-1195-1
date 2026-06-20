import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import Login from './pages/Login.jsx';
import MainLayout from './components/MainLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Deviations from './pages/Deviations.jsx';
import DeviationDetail from './pages/DeviationDetail.jsx';
import RootCauses from './pages/RootCauses.jsx';
import Actions from './pages/Actions.jsx';
import Verifications from './pages/Verifications.jsx';
import Escalations from './pages/Escalations.jsx';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="deviations" element={<Deviations />} />
        <Route path="deviations/:id" element={<DeviationDetail />} />
        <Route path="root-causes" element={<RootCauses />} />
        <Route path="actions" element={<Actions />} />
        <Route path="verifications" element={<Verifications />} />
        <Route path="escalations" element={<Escalations />} />
      </Route>
    </Routes>
  );
}

export default App;
