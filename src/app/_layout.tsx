import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";

// Prevent auto hide - handled in animated splash overlay for this setup

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
    </ThemeProvider>
  );
}
