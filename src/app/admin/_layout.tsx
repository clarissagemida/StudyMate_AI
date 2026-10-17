import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const GREEN = "#176B45";

type GuardState = "checking" | "allowed" | "denied";

const MENU_ITEMS = [
  {
    route: "/admin/home",
    name: "home",
    label: "Dashboard",
    icon: "grid-outline",
  },
  {
    route: "/admin/users",
    name: "users",
    label: "User Management",
    icon: "people-outline",
  },
  {
    route: "/admin/materials",
    name: "materials",
    label: "Learning Materials",
    icon: "book-outline",
  },
  {
    route: "/admin/reports",
    name: "reports",
    label: "Reports",
    icon: "bar-chart-outline",
  },
  {
    route: "/admin/settings",
    name: "settings",
    label: "Settings",
    icon: "settings-outline",
  },
] as const;

function AdminDrawerContent() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = () => {
    if (signingOut) return;

    Alert.alert(
      "Log Out",
      "Are you sure you want to log out of StudyMate AI?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);

            try {
              const { error } = await supabase.auth.signOut();

              if (error) throw error;

              router.replace("/login");
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : "Please try again.";

              Alert.alert("Logout failed", message);
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.drawerContainer}>
      <ScrollView
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.drawerHeader}>
          <View style={styles.logoContainer}>
            <Ionicons name="school" size={27} color="#FFFFFF" />
          </View>

          <View style={styles.brandTextContainer}>
            <Text style={styles.brandName}>StudyMate AI</Text>
            <Text style={styles.brandSubtitle}>ADMIN PANEL</Text>
          </View>
        </View>

        <View style={styles.menuLabelContainer}>
          <Text style={styles.menuLabel}>MAIN MENU</Text>
        </View>

        {MENU_ITEMS.map((item) => {
          const active =
            pathname === item.route || pathname.startsWith(`${item.route}/`);

          return (
            <Pressable
              key={item.name}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(item.route)}
              style={({ pressed }) => [
                styles.menuItem,
                active && styles.menuItemActive,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={21}
                color={active ? GREEN : "#425348"}
              />

              <Text
                style={[
                  styles.menuItemLabel,
                  active && styles.menuItemLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.drawerFooter}>
        <View style={styles.adminInfo}>
          <View style={styles.adminAvatar}>
            <Ionicons name="shield-checkmark" size={22} color={GREEN} />
          </View>

          <View style={styles.adminTextContainer}>
            <Text style={styles.adminName}>Administrator</Text>
            <Text style={styles.adminRole}>System Admin</Text>
          </View>

          <View style={styles.onlineIndicator} />
        </View>

        <View style={styles.footerDivider} />

        <Pressable
          accessibilityRole="button"
          disabled={signingOut}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.menuItemPressed,
            signingOut && styles.disabledButton,
          ]}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color="#D64545" />
          ) : (
            <Ionicons name="log-out-outline" size={21} color="#D64545" />
          )}

          <Text style={styles.logoutLabel}>
            {signingOut ? "Logging out..." : "Log Out"}
          </Text>
        </Pressable>

        <Text style={styles.footerCaption}>StudyMate AI · Administration</Text>
      </View>
    </View>
  );
}

export default function AdminLayout() {
  const [guard, setGuard] = useState<GuardState>("checking");

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (authError || !user) {
          setGuard("denied");
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError) {
          console.error("Admin verification failed:", {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
          });

          setGuard("denied");
          router.replace("/login");
          return;
        }

        const isAdmin =
          profile?.role === "admin" && profile?.approval_status === "approved";

        if (isAdmin) {
          setGuard("allowed");
          return;
        }

        setGuard("denied");
        await supabase.auth.signOut();

        if (active) {
          router.replace("/login");
        }
      } catch (error) {
        console.error("Admin access check failed:", error);

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

        <Text style={styles.checkingText}>
          Verifying administrator access...
        </Text>
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
      drawerContent={() => <AdminDrawerContent />}
      screenOptions={{
        headerStyle: {
          backgroundColor: GREEN,
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "800",
        },
        headerShadowVisible: false,
        drawerActiveTintColor: GREEN,
        drawerActiveBackgroundColor: "#E7F3EA",
        drawerInactiveTintColor: "#425348",
        drawerLabelStyle: {
          fontSize: 14,
          fontWeight: "600",
        },
        drawerItemStyle: {
          borderRadius: 12,
          marginHorizontal: 12,
          marginVertical: 3,
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
  drawerContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTextContainer: {
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#173D2A",
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: "#7B8B80",
    marginTop: 4,
  },
  menuLabelContainer: {
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  menuLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#94A198",
  },
  menuItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 12,
  },
  menuItemActive: {
    backgroundColor: "#E7F3EA",
  },
  menuItemPressed: {
    opacity: 0.72,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#425348",
  },
  menuItemLabelActive: {
    color: GREEN,
    fontWeight: "800",
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: "#E8EEE9",
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    backgroundColor: "#FFFFFF",
  },
  adminInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 14,
    gap: 10,
  },
  adminAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  adminTextContainer: {
    flex: 1,
  },
  adminName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#20392B",
  },
  adminRole: {
    fontSize: 11,
    color: "#7A897F",
    marginTop: 3,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#20A05A",
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#E8EEE9",
    marginHorizontal: 8,
    marginBottom: 8,
  },
  logoutButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  logoutLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#D64545",
  },
  footerCaption: {
    textAlign: "center",
    color: "#A0AAA3",
    fontSize: 10,
    marginTop: 6,
  },
});
