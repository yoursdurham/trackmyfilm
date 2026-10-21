<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent environment

When `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are unset, the environment start script boots a local Supabase stack with the native runtime, applies `supabase/migrations`, and writes `.env.local`. Set those three variables to use the hosted project instead. `.env.local` is gitignored.

The local staff account is `staff@localhost.test` / `local-dev-password`. It exists only in that local stack.

App commands are in `README.md`: `npm run dev` (port 3000), `npm test`, `npm run lint`, and `npm run build`. Install with `npm ci`.
