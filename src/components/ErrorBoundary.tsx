import { AlertTriangle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * If a screen crashes, show a short message and a way out instead of a blank
 * page. Error boundaries must be class components in React.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visible in the browser console (F12) for debugging.
    console.error('Smart Campus Shuttle crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main role="alert" className="grid min-h-screen place-items-center px-4">
        <div className="max-w-md text-center">
          <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-alert" />
          <h1 className="mt-4 text-xl font-bold">Something went wrong on this screen</h1>
          <p className="mt-2 text-sm text-muted">
            Reload the page to try again. Your bookings are not affected. If this keeps happening, clear this
            site&apos;s data in the browser settings to reset the local demo.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <a href="/" className="btn btn-secondary">
              Go to the home page
            </a>
          </div>
        </div>
      </main>
    )
  }
}
