import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase configuration is missing. Check your .env file.");
}

let storage: any;

if (Platform.OS === "web") {
  storage =
    typeof globalThis.localStorage !== "undefined"
      ? globalThis.localStorage
      : undefined;
} else {
  storage = AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    flowType: "pkce",
    detectSessionInUrl: false,
  },
});
