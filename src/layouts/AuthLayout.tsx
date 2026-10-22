import type { ReactNode } from 'react'
import { Link } from 'react-router'
import DataModeNotice from '../components/DataModeNotice.tsx'
import Logo from '../components/Logo.tsx'

interface AuthLayoutProps {
  title: string
  description: string
  children: ReactNode
  /** Shown under the form, e.g. the demo accounts. */
  aside?: ReactNode
}

/** The shell for the sign-in and registration pages. */
export default function AuthLayout({ title, description, children, aside }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-6 sm:px-6">
      <header className="mx-auto w-full max-w-md">
        <Link to="/" className="inline-block rounded-lg">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 py-10">
        <div className="panel p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
          <div className="mt-6">{children}</div>
        </div>
        {aside}
        <DataModeNotice />
      </main>
    </div>
  )
}
