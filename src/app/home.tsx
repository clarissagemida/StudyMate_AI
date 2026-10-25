import { supabase } from "@/lib/supabase";
import { Redirect } from "expo-router";
import type { Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PRIMARY = "#176B45";

type Destination = Href | null;

// Legacy entry point. It must never render a dashboard itself: opening the
// wrong role's home (for example a teacher landing on the student hub) would
// bypass the role guards used by the dedicated layouts.
export default function HomeScreen() {
  const [destination, setDestination] = useState<Destination>(null);
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveDestination() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authError || !user) {
          setRedirectToLogin(true);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (!profile || profile.approval_status !== "approved") {
          await supabase.auth.signOut();
          if (active) setRedirectToLogin(true);
          return;
        }

        switch (profile.role) {
          case "student":
            setDestination("/student");
            break;
          case "teacher":
            setDestination("/teacher");
            break;
          case "admin":
            setDestination("/admin/home");
            break;
          default:
            await supabase.auth.signOut();
            if (active) setRedirectToLogin(true);
        }
      } catch (error) {
        console.error("Home routing error:", error);
        if (active) setRedirectToLogin(true);
      }
    }

    void resolveDestination();

    return () => {
      active = false;
    };
  }, []);

  if (redirectToLogin) return <Redirect href="/login" />;
  if (destination) return <Redirect href={destination} />;

  return (
    <SafeAreaView style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={PRIMARY} />
      <Text style={styles.loadingText}>Loading your dashboard...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F5" },
  center: { justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#52665A", fontSize: 14, marginTop: 12 },
});
