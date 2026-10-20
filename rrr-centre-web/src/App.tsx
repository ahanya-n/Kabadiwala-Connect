import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingView } from './components/StateViews'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { BuildLotPage } from './pages/BuildLotPage'
import { ClassifyItemsPage } from './pages/ClassifyItemsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { LotDetailPage } from './pages/LotDetailPage'
import { LotsPage } from './pages/LotsPage'
import { ReceiveItemsPage } from './pages/ReceiveItemsPage'
import { RegisterPage } from './pages/RegisterPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'unknown' || status === 'working') {
    return <LoadingView message="Loading…" />
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/receive"
        element={
          <RequireAuth>
            <ReceiveItemsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/classify"
        element={
          <RequireAuth>
            <ClassifyItemsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/build-lot"
        element={
          <RequireAuth>
            <BuildLotPage />
          </RequireAuth>
        }
      />
      <Route
        path="/lots"
        element={
          <RequireAuth>
            <LotsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/lots/:lotId"
        element={
          <RequireAuth>
            <LotDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
