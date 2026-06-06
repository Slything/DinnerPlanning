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
OPENROUTER_DEFAULT_MODEL=google/gemini-2.5-flash-lite
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` are server-only. Never
prefix either with `NEXT_PUBLIC_`.

## Supabase setup

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in numeric order.
3. Configure Supabase Auth URLs:
   - Site URL:
     `https://dinnerplanning-production.up.railway.app`
   - Redirect URLs:
     `https://dinnerplanning-production.up.railway.app/auth/callback`
     `https://dinnerplanning-production.up.railway.app/auth/callback**`
     `https://dinnerplanning-production.up.railway.app/invite/**`
     `https://dinnerplanning-production.up.railway.app/recipe-invite/**`
     `http://localhost:3000/auth/callback`
     `http://localhost:3000/auth/callback**`
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
OPENROUTER_DEFAULT_MODEL=google/gemini-2.5-flash-lite
NEXT_PUBLIC_APP_URL=https://dinnerplanning-production.up.railway.app
```

You can add these one at a time with **New Variable** or paste them with
**Raw Editor**. After saving, review/deploy Railway's staged changes so the
running app receives the variables. `OPENROUTER_API_KEY` must stay server-only;
do not rename it to `NEXT_PUBLIC_OPENROUTER_API_KEY`.

If the app ever appears to use a model you did not choose, confirm the
household default in Supabase:

```sql
select id, name, ai_model_id
from public.households;
```

To clear the old Jamba value and return to the app default:

```sql
update public.households
set ai_model_id = null
where ai_model_id = 'ai21/jamba-large-1.7';
```

## Auth link troubleshooting

Supabase confirmation, reset-password, and invite email templates should use
the default `{{ .ConfirmationURL }}` link. If a user is stuck after a failed
signup or password reset, check the exact email in Supabase SQL:

```sql
select id, email, email_confirmed_at, confirmed_at, created_at
from auth.users
where lower(email) = lower('sister@example.com');

select id, provider, identity_data
from auth.identities
where lower(identity_data->>'email') = lower('sister@example.com');

select id, user_id, email, household_id
from public.household_members
where lower(email::text) = lower('sister@example.com');

select id, email, accepted_at, expires_at
from public.household_invitations
where lower(email::text) = lower('sister@example.com');
```

If only an unused pending household invite remains, clear it:

```sql
delete from public.household_invitations
where lower(email::text) = lower('sister@example.com')
  and accepted_at is null;
```

If `auth.users` still contains the address, delete that user from Supabase
Authentication → Users, wait a minute, and retry signup.

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
