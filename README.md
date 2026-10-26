# StudyMate AI

An Expo/React Native study companion with role-based portals for students,
teachers, and administrators. Lessons, quizzes, and AI answers are backed by
Supabase (Postgres + Auth + Edge Functions).

## Features

- **Students** — read published lessons, take quizzes with instant scoring and
  answer review, ask the AI study buddy questions grounded in published
  materials, and review recent results.
- **Teachers** — create and publish learning materials, build quizzes manually
  or with AI assistance, and track their own content.
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
   ai_reports.sql
   approve_registration.sql
   account_deletion.sql
   reconcile_approved_roles.sql
   ```

4. Deploy the Edge Functions and provide their secrets (`GEMINI_API_KEY`,
   service-role key, etc.):

   ```bash
   npx supabase functions deploy study-buddy materials-index teacher-ai-generator
   npx supabase functions deploy send-verification-code verify-registration-code delete-account
   ```

5. Start the app:

   ```bash
   npx expo start
   ```

   The AI Edge Functions and any native modules require a development build,
   not Expo Go.

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
