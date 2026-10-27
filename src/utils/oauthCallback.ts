import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

const OAUTH_CALLBACK_PATH = "auth/callback";

function resolveAppScheme(): string {
  const scheme = Constants.expoConfig?.scheme;

  if (Array.isArray(scheme)) {
    return scheme.find((value) => value.length > 0) ?? "studymateai";
  }

  return scheme || "studymateai";
}

/**
 * Returns the exact redirect URL that must be allow-listed in Supabase.
 * Expo Go needs its own exp:// proxy URL; real builds use the app scheme.
 */
export function getOAuthRedirectUrl(): string {
  if (
    Platform.OS === "web" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return makeRedirectUri({ path: OAUTH_CALLBACK_PATH });
  }

  return `${resolveAppScheme()}://${OAUTH_CALLBACK_PATH}`;
}

function callbackParams(url: URL) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  const get = (key: string) =>
    url.searchParams.get(key) ?? hash.get(key) ?? null;

  return { get };
}

// Both the browser session handler and the /auth/callback route may see the
// same redirect. Sharing one exchange keeps the single-use code from being
// redeemed twice.
const exchanges = new Map<string, Promise<User>>();

/**
 * Completes a Google OAuth redirect by exchanging the authorization code (PKCE)
 * or adopting the token pair from the URL fragment (implicit fallback).
 * Returns the authenticated Supabase user.
 */
export async function completeOAuthCallback(
  callbackUrl: string,
): Promise<User> {
  let parsed: URL;

  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error("The sign-in response was invalid. Please try again.");
  }

  const { get } = callbackParams(parsed);

  const errorMessage =
    get("error_description") ?? get("error") ?? get("message");

  if (errorMessage) throw new Error(errorMessage);

  const code = get("code");

  if (code) {
    const pending = exchanges.get(code);
    if (pending) return pending;

    const exchange = (async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) throw error;
      if (!data.user) {
        throw new Error("Google sign-in did not return a user account.");
      }

      return data.user;
    })();

    exchanges.set(code, exchange);

    // The authorization code is single-use; keep the result only long enough
    // for a second handler in the same sign-in to reuse it.
    setTimeout(() => {
      if (exchanges.get(code) === exchange) exchanges.delete(code);
    }, 60_000);

    return exchange;
  }

  // Some OAuth responses return the session in the URL fragment.
  const accessToken = get("access_token");
  const refreshToken = get("refresh_token");

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;
    if (!data.user) {
      throw new Error("Google sign-in did not return a user account.");
    }

    return data.user;
  }

  throw new Error("The sign-in response was incomplete. Please try again.");
}

/** Turns raw provider/SDK errors into messages a student can act on. */
export function describeGoogleAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("provider is not enabled") ||
    lower.includes("unsupported provider") ||
    lower.includes("missing oauth secret")
  ) {
    return "Google sign-in is not enabled for this app yet. Please sign in with your email and password or contact the administrator.";
  }

  if (
    lower.includes("redirect") &&
    (lower.includes("not allowed") ||
      lower.includes("invalid") ||
      lower.includes("mismatch"))
  ) {
    return "Google sign-in is not configured correctly. Please contact the administrator.";
  }

  if (
    lower.includes("code verifier") ||
    lower.includes("invalid flow state") ||
    lower.includes("invalid grant") ||
    lower.includes("auth code") ||
    lower.includes("code challenge")
  ) {
    return "Your Google sign-in session expired. Please try again.";
  }

  if (
    lower.includes("access_denied") ||
    lower.includes("user denied") ||
    lower.includes("consent")
  ) {
    return "Google sign-in was cancelled. Please try again if you would like to continue with Google.";
  }

  if (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error")
  ) {
    return "Please check your internet connection and try again.";
  }

  return message || "Please try again.";
}
