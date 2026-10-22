import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import StateMessage from '../components/StateMessage.tsx'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <StateMessage
        tone="empty"
        icon={MapPinOff}
        title="Page not found"
        action={
          <Link to="/" className="btn btn-primary">
            Back to home
          </Link>
        }
      >
        This address is not on any route. Check the link, or start again from the home page.
      </StateMessage>
    </main>
  )
}
