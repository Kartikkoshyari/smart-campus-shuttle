/// <reference types="vite/client" />

// Tells TypeScript which environment variables the app reads.
// Only variables starting with VITE_ are exposed to browser code.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
