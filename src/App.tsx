import { Navigate, Route, Routes } from 'react-router'
import RequireAuth from './components/RequireAuth.tsx'
import { useAuth } from './hooks/useAuth.ts'
import AppLayout from './layouts/AppLayout.tsx'
import AdminPage from './pages/AdminPage.tsx'
import BookPage from './pages/BookPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import LandingPage from './pages/LandingPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import MyBookingsPage from './pages/MyBookingsPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import OperatorPage from './pages/OperatorPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'

/** Sends each role to its own starting page after sign-in. */
function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'operator') return <Navigate to="/app/operator" replace />
  if (user?.role === 'admin') return <Navigate to="/app/admin" replace />
  return <Navigate to="/app/dashboard" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="dashboard" element={<DashboardPage />} />

        <Route element={<RequireAuth roles={['student']} />}>
          <Route path="book" element={<BookPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
        </Route>

        <Route element={<RequireAuth roles={['operator', 'admin']} />}>
          <Route path="operator" element={<OperatorPage />} />
        </Route>

        <Route element={<RequireAuth roles={['admin']} />}>
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
