# Gather & Graze

A mobile-first dinner planning PWA for shared households. The app keeps a
recipe library, plans weekly dinners, learns from cooking feedback, tracks
pantry stock, and generates pantry-aware shopping lists.

## Local development

The repository includes a project-local Node.js toolchain under `.tools` when
installed by Codex. Add it to the front of your `PATH`, then install and run:

```bash
export PATH="$PWD/.tools/node-v24.16.0-darwin-arm64/bin:$PATH"
npm install
npm run dev
```

Open `http://localhost:3000`. Without Supabase credentials the app starts in a
fully interactive local demo mode and saves state in the browser.

## Environment

Copy `.env.example` to `.env.local` and add credentials to enable the included
cloud authentication, invitation, private-upload, and AI-import routes. The
interactive workspace defaults to local demo persistence until it is connected
to a deployed Supabase project.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_RECIPE_MODEL=gpt-5.4-mini
```

Apply the SQL migrations in `supabase/migrations` to a Supabase project before
enabling cloud mode.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
