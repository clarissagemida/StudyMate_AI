# StudyMate AI

An Expo/React Native study companion with role-based portals for students,
teachers, and administrators. Lessons, quizzes, and AI answers are backed by
Supabase (Postgres + Auth + Edge Functions).

## Features

- **Students** — read published lessons, open or download attached PDF/DOCX/PPTX
  files through private signed links, take quizzes with server-graded scoring
  and answer review, ask the AI study buddy questions grounded in published
  materials, and review recent results.
- **Teachers** — create text lessons or upload PDF/DOCX/PPTX files up to 50 MB,
  extract searchable text, archive materials, build multiple-choice and
  true/false quizzes manually or with AI assistance, edit their teaching
  profile, and track student attempts and averages.
- **Administrators** — approve accounts, manage users and materials, review AI
  reports, and tune AI settings.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=your-project-url
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   # Optional: set to "false" to hide AI features in the client
   EXPO_PUBLIC_AI_ENABLED=true
   ```

3. Run the SQL files in `supabase/` in the Supabase SQL editor. Apply them in
   this order (each file is idempotent):

   ```
   handle_new_user.sql
   profiles_security.sql
   materials.sql
   ai_grounding.sql
   quizzes.sql
   quiz_attempts.sql
   ai_settings.sql
   ai_usage.sql
   teacher_features.sql
   ai_reports.sql
   approve_registration.sql
   account_deletion.sql
   reconcile_approved_roles.sql
   ```

4. Deploy the Edge Functions and provide their secrets (`GEMINI_API_KEY`,
   service-role key, etc.):

   ```bash
   npx supabase functions deploy study-buddy materials-index materials-extract teacher-ai-generator
   npx supabase functions deploy send-verification-code verify-registration-code delete-account
   ```

   `teacher_features.sql` creates the private `materials` Storage bucket.
   Attachments are limited to 50 MB (`52428800` bytes), which is also the
   Supabase Free plan and Gemini PDF maximum. `materials-extract` uses Gemini's
   Files API for PDFs over 15 MB, while DOCX/PPTX extraction runs without AI.
   A file stays attached and can still be published if text extraction fails.
   AI requests retry transient Gemini 5xx responses and fall back from the
   configured model to `gemini-3.6-flash` when the primary model is unavailable.

### Google sign-in

Google sign-in uses Supabase OAuth with PKCE. Configure both Google Cloud and
Supabase; the app redirects to `/auth/callback` after the user confirms their
Google account.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**. Add this
   authorized redirect URI:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

2. In the Supabase dashboard, open **Authentication → Providers → Google**,
   enable the provider, and paste the Google client ID and client secret.

3. Open **Authentication → URL Configuration** and add these redirect URLs:

   ```
   studymateai://auth/callback
   exp://**/--/auth/callback
   http://localhost:8081/auth/callback
   https://your-production-domain/auth/callback
   ```

   `studymateai://` is used by development/production builds, the `exp://`
   wildcard covers Expo Go, and the `http`/`https` entries cover the web app.
   Google itself only needs the Supabase callback URL from step 1. If you open
   the web app through a LAN address, add that exact origin as well.

The app requests Google's account chooser (`prompt=select_account`) so users
explicitly confirm which account to use. New Google accounts still require
administrator approval before they can open a dashboard.

If the Google OAuth consent screen is still in **Testing** mode, add each Google
account you will test with under **Audience → Test users**, or publish the app.

5. Start the app:

   ```bash
   npx expo start
   ```

   Native modules that are not bundled with Expo Go require a development
   build; the hosted AI functions do not.

## Scripts

```bash
npx expo start          # start the dev server
npx expo lint           # lint
npx tsc --noEmit        # typecheck
node --test tests/ai.test.mjs   # AI helper tests
npx expo-doctor         # diagnose dependency/config issues
npx expo install --fix  # align package versions with the SDK
```

## Project layout

- `src/app/` — Expo Router routes (`student`, `teacher`, `admin` trees plus auth)
- `src/components/` — shared UI (`ui/` primitives, material reader, themed views)
- `src/hooks/` — role guard, theme, color scheme
- `src/utils/` — Supabase helpers, AI client, app lock, notifications/dialogs
- `supabase/` — SQL migrations, Edge Functions, and SQL tests
- `tests/` — Node test suite for shared AI helpers
