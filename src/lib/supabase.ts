import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase configuration is missing. Check your .env file.");
}

// `localStorage` only exists in a browser. A static web export renders routes
// inside Node, where referencing this global at module load time crashes the
// build, so the storage is resolved here and omitted when unavailable.
// Supabase falls back to in-memory storage when none is provided.
const browserStorage =
  typeof globalThis.localStorage === "undefined"
    ? undefined
    : globalThis.localStorage;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: browserStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
