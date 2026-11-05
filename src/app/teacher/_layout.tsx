import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";

export default function TeacherTabLayout() {
  // Session + teacher role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("teacher");
  const pathname = usePathname();

  if (guard === "checking") {
    return <DashboardSkeleton />;
  }

  if (guard === "denied") {
    return (
      <View style={styles.center}>
        <View style={styles.deniedBadge}>
          <Ionicons name="lock-closed" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.centerText}>
          This area is restricted to approved teacher accounts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: GREEN,
          tabBarInactiveTintColor: INACTIVE,
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.label,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabItem,
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "grid" : "grid-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="material"
        options={{
          title: "Materials",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "book" : "book-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="quizzes"
        options={{
          title: "Quizzes",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "clipboard" : "clipboard-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen name="students" options={{ href: null }} />

      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-buddy"
        options={{ href: null, tabBarStyle: { display: "none" } }}
      />
      </Tabs>
      {pathname !== "/teacher/ai-buddy" ? (
        <Pressable
          onPress={() => router.push({ pathname: "/teacher/ai-buddy", params: { returnTo: pathname } })}
          accessibilityRole="button"
          accessibilityLabel="Open Teacher AI Buddy"
          style={({ pressed }) => [styles.aiFab, pressed && styles.aiFabPressed]}
        >
          <View style={styles.aiFabIcon}>
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.aiFabLabel}>AI Buddy</Text>
          <View style={styles.aiFabArrow}>
            <Ionicons name="arrow-up" size={13} color={GREEN} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: "#F4F8F5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerText: {
    fontSize: 14,
    color: "#65776B",
    textAlign: "center",
  },
  deniedBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#B33A3A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  deniedTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#20392B",
  },
  tabBar: {
    backgroundColor: "#FFFFFF",
    borderTopColor: BORDER,
    borderTopWidth: 1,
    height: 62,
    paddingTop: 6,
    paddingBottom: 5,
    elevation: 8,
  },
  tabItem: {
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
  aiFab: {
    position: "absolute",
    right: 16,
    bottom: 76,
    minHeight: 54,
    paddingLeft: 7,
    paddingRight: 14,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAE0",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    elevation: 8,
    shadowColor: "#103D28",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  aiFabPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  aiFabIcon: {
    width: 40,
    height: 40,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GREEN,
  },
  aiFabLabel: { color: "#123D2A", fontSize: 13, fontWeight: "800" },
  aiFabArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
});
