import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { useEffect } from "react";
import { loadAdminTheme } from "@/utils/adminTheme";
import { applyAppearance, loadAccountAppearance } from "@/utils/accountAppearance";
import { supabase } from "@/lib/supabase";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { SweetAlertHost } from "@/components/ui/sweet-alert-host";

// Prevent auto hide - handled in animated splash overlay for this setup

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    let active = true;
    const applyForUser = async (userId: string | null) => {
      try {
        if (!userId) {
          const preference = await loadAdminTheme();
          if (active) applyAppearance(preference);
          return;
        }
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
        const preference = profile?.role === "student" || profile?.role === "teacher"
          ? await loadAccountAppearance(userId)
          : await loadAdminTheme();
        if (active) applyAppearance(preference);
      } catch (error) {
        console.warn("Unable to apply saved appearance preference:", error);
      }
    };
    void supabase.auth.getSession().then(({ data: { session } }) => applyForUser(session?.user.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { if (active) void applyForUser(session?.user.id ?? null); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="home" />
        <Stack.Screen name="student" />
        <Stack.Screen name="teacher" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="auth/callback" />
      </Stack>
      <SweetAlertHost />
    </ThemeProvider>
  );
}
