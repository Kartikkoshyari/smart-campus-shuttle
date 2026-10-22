import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import AuthProvider from './components/AuthProvider.tsx'
import BookingsProvider from './components/BookingsProvider.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import FleetProvider from './components/FleetProvider.tsx'
import SimulationProvider from './components/SimulationProvider.tsx'
import ToastProvider from './components/ToastProvider.tsx'
import { AdminContext } from './hooks/useAdmin.ts'
import './index.css'
import { adminService } from './services/index.ts'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Could not find the #root element in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SimulationProvider>
              <FleetProvider>
                <BookingsProvider>
                  <AdminContext value={adminService}>
                    <App />
                  </AdminContext>
                </BookingsProvider>
              </FleetProvider>
            </SimulationProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
