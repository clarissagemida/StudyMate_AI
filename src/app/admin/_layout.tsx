import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Drawer } from "expo-router/drawer";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const GREEN = "#176B45";

type GuardState = "checking" | "allowed" | "denied";

export default function AdminLayout() {
  const [guard, setGuard] = useState<GuardState>("checking");

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        const isAdmin =
          profile?.role === "admin" && profile?.approval_status === "approved";

        if (isAdmin) {
          setGuard("allowed");
          return;
        }

        setGuard("denied");
        await supabase.auth.signOut();
        router.replace("/login");
      } catch {
        if (!active) return;
        setGuard("denied");
        router.replace("/login");
      }
    }

    void verifyAdmin();

    return () => {
      active = false;
    };
  }, []);

  if (guard === "checking") {
    return (
      <View style={styles.center}>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={30} color="#FFFFFF" />
        </View>
        <ActivityIndicator size="large" color={GREEN} style={styles.spinner} />
        <Text style={styles.checkingText}>Verifying administrator access...</Text>
      </View>
    );
  }

  if (guard === "denied") {
    return (
      <View style={styles.center}>
        <View style={[styles.badge, styles.deniedBadge]}>
          <Ionicons name="lock-closed" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.deniedTitle}>Access denied</Text>
        <Text style={styles.checkingText}>
          This area is restricted to administrators.
        </Text>
      </View>
    );
  }

  return (
    <Drawer
      screenOptions={{
        headerStyle: {
          backgroundColor: GREEN,
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "800",
        },
        drawerActiveTintColor: GREEN,
        drawerActiveBackgroundColor: "#E7F3EA",
        drawerInactiveTintColor: "#425348",
        drawerLabelStyle: {
          fontSize: 14,
          fontWeight: "600",
          marginLeft: -12,
        },
        drawerStyle: {
          backgroundColor: "#FFFFFF",
          width: 285,
        },
        sceneStyle: {
          backgroundColor: "#F4F8F5",
        },
      }}
    >
      <Drawer.Screen
        name="home"
        options={{
          title: "Admin Dashboard",
          drawerLabel: "Dashboard",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="users"
        options={{
          title: "User Management",
          drawerLabel: "User Management",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="materials"
        options={{
          title: "Learning Materials",
          drawerLabel: "Learning Materials",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="reports"
        options={{
          title: "Reports",
          drawerLabel: "Reports",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="settings"
        options={{
          title: "Settings",
          drawerLabel: "Settings",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: "#F4F8F5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  deniedBadge: {
    backgroundColor: "#B33A3A",
  },
  spinner: {
    marginTop: 10,
  },
  checkingText: {
    fontSize: 14,
    color: "#65776B",
    textAlign: "center",
    marginTop: 4,
  },
  deniedTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#20392B",
    marginTop: 8,
  },
});
