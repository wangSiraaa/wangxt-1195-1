import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import DeviationList from './pages/deviations/DeviationList'
import DeviationDetail from './pages/deviations/DeviationDetail'
import DeviationCreate from './pages/deviations/DeviationCreate'
import MeasureList from './pages/measures/MeasureList'
import ValidationList from './pages/validations/ValidationList'
import EscalationList from './pages/escalations/EscalationList'
import { api } from './services/api'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (token && !user) fetchMe()
  }, [token, user, fetchMe])

  useEffect(() => {
    const interval = setInterval(async () => {
      if (token) {
        try { await api.measures.checkOverdue() } catch (_) {}
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [token])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <PrivateRoute><MainLayout /></PrivateRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="deviations" element={<DeviationList />} />
        <Route path="deviations/create" element={<DeviationCreate />} />
        <Route path="deviations/:id" element={<DeviationDetail />} />
        <Route path="measures" element={<MeasureList />} />
        <Route path="validations" element={<ValidationList />} />
        <Route path="escalations" element={<EscalationList />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
