import { supabase } from "@/lib/supabase";
import { setAppLocked } from "@/utils/appLock";
import { confirmAction, showNotice } from "@/utils/notify";
import type { User } from "@supabase/supabase-js";
import { router } from "expo-router";

type AccountAccessOptions = {
  // Google verifies the address before Supabase creates the session. Trusting
  // that provider lets OAuth users through even when email_confirmed_at is
  // absent, without weakening the password-login check.
  trustedProvider?: boolean;
};

function isTrustedGoogleUser(user: User): boolean {
  const provider = user.app_metadata?.provider;
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];

  return provider === "google" || providers.includes("google");
}

// A native deep link and the browser-session handler can both finish the same
// sign-in. Share the verification so the user gets one navigation and one
// message instead of two racing checks.
const verifications = new Map<string, Promise<boolean>>();

async function runAccountVerification(
  user: User,
  options: AccountAccessOptions,
): Promise<boolean> {
  try {
    const emailVerified =
      Boolean(user.email_confirmed_at) ||
      (options.trustedProvider === true && isTrustedGoogleUser(user));

    if (!emailVerified) {
      await supabase.auth.signOut();

      const targetEmail = (user.email ?? "").trim().toLowerCase();

      confirmAction(
        "Email Not Verified",
        "Please verify your email address before signing in. We can send a new code.",
        () => {
          router.replace({
            pathname: "/verify-email",
            params: {
              ...(targetEmail ? { email: targetEmail } : {}),
              userId: user.id,
            },
          });
        },
        { confirmLabel: "Verify Email", cancelLabel: "Cancel" },
      );
      return false;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      // A failed verification must never leave a half-authenticated session.
      await supabase.auth.signOut();

      showNotice(
        "Connection Error",
        "We couldn't verify your account. Check your internet connection and try again.",
      );
      return false;
    }

    if (!profile) {
      await supabase.auth.signOut();

      showNotice(
        "Profile Error",
        "We couldn't find your StudyMate profile. Please contact the administrator.",
      );
      return false;
    }

    if (profile.approval_status !== "approved") {
      await supabase.auth.signOut();

      if (profile.approval_status === "rejected") {
        showNotice(
          "Registration Not Approved",
          "Your registration was not approved. Please contact the administrator for assistance.",
        );
      } else {
        showNotice(
          "Account Pending Approval",
          "Your account is waiting for administrator approval. You can sign in after it has been approved.",
        );
      }
      return false;
    }

    setAppLocked(false);

    switch (profile.role) {
      case "student":
        router.replace("/student");
        return true;

      case "teacher":
        router.replace("/teacher");
        return true;

      case "admin":
        router.replace("/admin/home");
        return true;

      default:
        await supabase.auth.signOut();

        showNotice(
          "Invalid Role",
          "Your account role could not be verified. Please contact the administrator.",
        );
        return false;
    }
  } catch (error) {
    console.error("Account verification error:", error);

    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.error("Sign out after verification error failed:", signOutError);
    }

    showNotice(
      "Verification Error",
      "We couldn't verify your account. Please try again.",
    );
    return false;
  }
}

/**
 * Central post-authentication gate. Verifies the email, loads the profile,
 * enforces administrator approval, then routes to the correct dashboard.
 * Callers must drop the session on any failure path (handled here).
 * Resolves true when navigation happened, false when the user was stopped.
 */
export function verifyAccountAndNavigate(
  user: User,
  options: AccountAccessOptions = {},
): Promise<boolean> {
  const existing = verifications.get(user.id);
  if (existing) return existing;

  const verification = runAccountVerification(user, options);

  verifications.set(user.id, verification);

  // Retain the settled result briefly so a second OAuth handler that finishes
  // a moment later cannot trigger a duplicate check or message.
  void verification.finally(() => {
    setTimeout(() => {
      if (verifications.get(user.id) === verification) {
        verifications.delete(user.id);
      }
    }, 3000);
  });

  return verification;
}
