import { StateView } from "@/components/ui/state-view";
import { verifyAccountAndNavigate } from "@/utils/accountAccess";
import { showNotice } from "@/utils/notify";
import {
  completeOAuthCallback,
  describeGoogleAuthError,
} from "@/utils/oauthCallback";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

type CallbackParams = Record<string, string | string[] | undefined>;

function buildCallbackUrl(params: CallbackParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "url" || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, value);
    }
  }

  const query = search.toString();

  return `studymateai://auth/callback${query ? `?${query}` : ""}`;
}

function resolveCallbackUrl(params: CallbackParams): string {
  const explicitUrl = params.url;
  if (typeof explicitUrl === "string") return explicitUrl;

  const generated = buildCallbackUrl(params);

  // On the web the router can finish before the query string is reflected in
  // params, and implicit responses keep tokens in the fragment, so the live
  // location is the most complete source.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.href;
  }

  return generated;
}

/**
 * Shared OAuth landing screen. The web build uses it after a full-page Google
 * redirect; on native it catches the deep link while the browser session is
 * completing. Both paths share single-flight exchange and verification, so a
 * duplicate deep link can never redeem the same code twice.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<CallbackParams>();
  const handled = useRef(false);
  const [message, setMessage] = useState(
    "Confirming your Google account with StudyMate...",
  );

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finishSignIn = async () => {
      try {
        const user = await completeOAuthCallback(resolveCallbackUrl(params));

        setMessage("Loading your StudyMate account...");

        const navigated = await verifyAccountAndNavigate(user, {
          trustedProvider: true,
        });

        // Verification may already have opened the email-confirmation route.
        // Waiting briefly lets that navigation unmount this screen (which
        // clears the timer) before falling back to the sign-in page.
        if (!navigated) {
          fallbackTimer = setTimeout(() => router.replace("/login"), 1500);
        }
      } catch (error) {
        console.error("OAuth callback error:", error);
        showNotice("Google Sign-In Failed", describeGoogleAuthError(error));
        router.replace("/login");
      }
    };

    void finishSignIn();

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [params]);

  return (
    <StateView variant="loading" title="Signing you in" message={message} />
  );
}
