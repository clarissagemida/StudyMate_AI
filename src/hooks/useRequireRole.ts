import { supabase } from "@/lib/supabase";
import { isAppLocked, subscribeAppLock } from "@/utils/appLock";
import { showNotice } from "@/utils/notify";
import { router } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";

// Shared guard for every protected route tree (admin, student, teacher).
//
// A screen may only mount when all of the following hold:
//   1. the app is not locked (fresh password or biometric unlock required),
//   2. a Supabase session exists,
//   3. the profile row exists, its role matches the route tree, and the
//      account is approved.
//
// Anything else is redirected to /login; a pending, rejected, or wrong-role
// session is signed out so it cannot be replayed through a deep link.
// Verification runs again whenever the lock flag or the auth session changes.

export type GuardState = "checking" | "allowed" | "denied";

export type RequiredRole = "student" | "teacher" | "admin";

export function useRequireRole(requiredRole: RequiredRole): GuardState {
  const [state, setState] = useState<GuardState>("checking");

  const locked = useSyncExternalStore(
    subscribeAppLock,
    isAppLocked,
    () => false,
  );

  useEffect(() => {
    let active = true;

    const verify = async () => {
      try {
        if (isAppLocked()) {
          // The session stays alive; only a fresh unlock may clear this.
          // Drop back to "checking" first so the protected tree unmounts
          // instead of staying rendered as "allowed" while we navigate.
          if (active) {
            setState("checking");
            router.replace("/login");
          }
          return;
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authError || !user) {
          if (active) {
            setState("checking");
            router.replace("/login");
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          console.error("Route guard verification failed:", profileError);

          showNotice(
            "Verification Error",
            "Your access could not be verified. Please check your connection and try again.",
          );

          setState("denied");
          router.replace("/login");
          return;
        }

        const allowed =
          profile?.role === requiredRole &&
          profile?.approval_status === "approved";

        if (!allowed) {
          await supabase.auth.signOut();

          if (active) {
            setState("denied");
            router.replace("/login");
          }

          return;
        }

        if (active) setState("allowed");
      } catch (error) {
        console.error("Route guard failed:", error);

        if (active) {
          setState("denied");
          router.replace("/login");
        }
      }
    };

    void verify();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void verify();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [requiredRole, locked]);

  return state;
}
