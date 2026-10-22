// Writes supabase/seed.sql. Run with:  npm run db:seed
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSeedSql } from './seedSql.ts'

const target = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url))
writeFileSync(target, buildSeedSql())
console.log(`Wrote ${target}`)
