import { useRequireRole } from "@/hooks/useRequireRole";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";

// Only routes that exist as files in this folder are registered. AI Quiz
// Studio, Results, and Profile are added here once their screens are built.
export default function TeacherTabLayout() {
  // Session + teacher role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("teacher");

  if (guard === "checking") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.centerText}>Verifying your account...</Text>
      </View>
    );
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
              color={color}
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
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
});
