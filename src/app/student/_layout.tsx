import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function StudentLayout() {
  const guard = useRequireRole("student");
  if (guard === "checking") return <DashboardSkeleton />;
  if (guard === "denied") return <View style={styles.denied}><Text style={styles.title}>Access denied</Text><Text style={styles.copy}>This area is restricted to approved student accounts.</Text></View>;

  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="quiz-attempt" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="announcements" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="analytics" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="notifications" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="profile" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="ai-buddy" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-generate" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-select-material" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-config" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-take" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-results" options={{ animation: "slide_from_right" }} />
    <Stack.Screen name="practice-history" options={{ animation: "slide_from_right" }} />
  </Stack>;
}

const styles = StyleSheet.create({ denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10, backgroundColor: "#F4F8F5" }, title: { fontSize: 19, fontWeight: "800", color: "#20392B" }, copy: { color: "#65776B", textAlign: "center" } });
