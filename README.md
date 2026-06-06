# Gather & Graze

Gather & Graze is a mobile-first household dinner planning PWA. Individual
accounts share recipes, weekly plans, pantry stock, cooking history, and a
pantry-aware shopping list through one Supabase household.

## Local development

This repository expects Node.js 24 or newer. A project-local toolchain may be
available under `.tools`:

```bash
export PATH="$PWD/.tools/node-v24.16.0-darwin-arm64/bin:$PATH"
npm install
npm run dev
```

Open `http://localhost:3000`. There is no demo mode; Supabase must be
configured before the protected application can be used.

## Environment

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_DEFAULT_MODEL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` are server-only. Never
prefix either with `NEXT_PUBLIC_`.

## Supabase setup

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in numeric order.
3. Add local and deployed `/auth/callback` URLs to the Auth redirect allow
   list.
4. Configure Auth email delivery and confirmation settings.
5. Add the environment values to `.env.local` for local development and to
   Railway service variables for production.

New users confirm their email, then create a household or accept a seven-day,
email-bound invitation. Production households start empty.

## OpenRouter

The importer loads OpenRouter's model catalog through `/api/ai/models`. Recipe
imports require structured-output support, and screenshot imports additionally
require image input. A household can save a default model while an individual
import can temporarily use another compatible model ID.

AI output is always returned as an editable draft and is never saved without
human review.

For Railway, OpenRouter does not have a separate integration panel. Open the
deployed app service, go to **Variables**, and add:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_DEFAULT_MODEL=...
NEXT_PUBLIC_APP_URL=https://your-railway-domain
```

You can add these one at a time with **New Variable** or paste them with
**Raw Editor**. After saving, review/deploy Railway's staged changes so the
running app receives the variables. `OPENROUTER_API_KEY` must stay server-only;
do not rename it to `NEXT_PUBLIC_OPENROUTER_API_KEY`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Live invitation, email, Realtime, and AI verification additionally requires a
configured Supabase project and OpenRouter key.
