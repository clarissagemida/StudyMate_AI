import { useRequireRole } from "@/hooks/useRequireRole";
import { supabase } from "@/lib/supabase";
import { setAppLocked } from "@/utils/appLock";
import { confirmAction, showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const GREEN = "#176B45";
const PHOTO_BUCKET = "profile-photos";

type WorkingState = "locking" | "signingOut" | null;

type AdminProfile = {
  full_name: string | null;
  avatar_path: string | null;
};

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
    route: "/admin/ai",
    name: "ai",
    label: "AI Controls",
    icon: "sparkles-outline",
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

  const [working, setWorking] = useState<WorkingState>(null);
  const [adminName, setAdminName] = useState("Administrator");
  const [adminAvatarUrl, setAdminAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const isWorking = working !== null;
  const signingOut = working === "signingOut";

  const loadAdminProfile = useCallback(async (isActive?: () => boolean) => {
    const active = () => isActive?.() ?? true;

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!active()) return;

      if (!user) {
        setAdminName("Administrator");
        setAdminAvatarUrl(null);
        setAvatarFailed(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_path")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!active()) return;

      const profile = data as AdminProfile | null;

      setAdminName(profile?.full_name?.trim() || "Administrator");
      setAvatarFailed(false);

      if (!profile?.avatar_path) {
        setAdminAvatarUrl(null);
        return;
      }

      const { data: signedImage, error: imageError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(profile.avatar_path, 60 * 60);

      if (imageError) throw imageError;

      if (!active()) return;

      setAdminAvatarUrl(signedImage?.signedUrl ?? null);
    } catch (error) {
      if (!active()) return;
      console.error("Unable to load sidebar admin profile:", error);
      setAdminAvatarUrl(null);
    }
  }, []);

  // Refresh the profile when navigating between admin screens. The loader is
  // awaited inside an effect-local runner so state is never applied
  // synchronously while the effect executes.
  useEffect(() => {
    let active = true;

    const run = async () => {
      await loadAdminProfile(() => active);
    };

    void run();

    return () => {
      active = false;
    };
  }, [loadAdminProfile, pathname]);

  // Refresh profile information when the authentication session changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAdminProfile();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadAdminProfile]);

  const accountActive =
    pathname === "/admin/account" || pathname.startsWith("/admin/account/");

  const handleLockApp = () => {
    if (isWorking) return;

    confirmAction(
      "Lock StudyMate AI",
      "Return to the login screen? Your saved session will be preserved.",
      () => {
        // The lock is central state: every protected layout re-checks it, so
        // a deep link cannot open an admin screen before a fresh unlock.
        setAppLocked(true);
        router.replace("/login");
      },
      { confirmLabel: "Lock App" },
    );
  };

  const handleLogout = () => {
    if (isWorking) return;

    confirmAction(
      "Log Out",
      "Are you sure you want to log out of StudyMate AI?",
      async () => {
        setWorking("signingOut");

        try {
          const { error } = await supabase.auth.signOut();

          if (error) throw error;

          setAppLocked(false);
          router.replace("/login");
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : "Please try again.";

          showNotice("Logout Failed", message);
        } finally {
          setWorking(null);
        }
      },
      { confirmLabel: "Log Out", destructive: true },
    );
  };

  const handleAvatarError = () => {
    setAvatarFailed(true);
  };

  return (
    <View style={styles.drawerContainer}>
      <ScrollView
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Sidebar branding */}
        <View style={styles.drawerHeader}>
          <View style={styles.logoContainer}>
            <Ionicons name="school" size={27} color="#FFFFFF" />
          </View>

          <View style={styles.brandTextContainer}>
            <Text style={styles.brandName}>StudyMate AI</Text>
            <Text style={styles.brandSubtitle}>ADMIN PANEL</Text>
          </View>
        </View>

        {/* Main navigation */}
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

              {active && <View style={styles.activeIndicator} />}
            </Pressable>
          );
        })}

        {/* Account navigation: vector icon, not profile photo */}
        <View style={[styles.menuLabelContainer, styles.accountSectionLabel]}>
          <Text style={styles.menuLabel}>ACCOUNT</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: accountActive }}
          accessibilityLabel="Open My Account"
          onPress={() => router.navigate("/admin/account")}
          style={({ pressed }) => [
            styles.menuItem,
            accountActive && styles.menuItemActive,
            pressed && styles.menuItemPressed,
          ]}
        >
          <View
            style={[
              styles.accountAvatar,
              accountActive && styles.accountAvatarActive,
            ]}
          >
            <Ionicons
              name="person-circle-outline"
              size={25}
              color={accountActive ? GREEN : "#425348"}
            />
          </View>

          <View style={styles.accountMenuText}>
            <Text
              style={[
                styles.menuItemLabel,
                accountActive && styles.menuItemLabelActive,
              ]}
            >
              My Account
            </Text>

            <Text style={styles.accountMenuSubtitle}>
              Profile and account details
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={17}
            color={accountActive ? GREEN : "#9AA69D"}
          />
        </Pressable>
      </ScrollView>

      {/* Sidebar footer: show the admin profile photo only here */}
      <View style={styles.drawerFooter}>
        <View style={styles.adminInfo}>
          <View style={styles.adminAvatar}>
            {adminAvatarUrl && !avatarFailed ? (
              <Image
                source={{ uri: adminAvatarUrl }}
                style={styles.footerAvatarImage}
                resizeMode="cover"
                onError={handleAvatarError}
              />
            ) : (
              <Ionicons name="person-circle-outline" size={29} color={GREEN} />
            )}
          </View>

          <View style={styles.adminTextContainer}>
            <Text style={styles.adminName} numberOfLines={1}>
              {adminName}
            </Text>

            <Text style={styles.adminRole}>System Administrator</Text>
          </View>

          <View style={styles.onlineIndicator} />
        </View>

        <View style={styles.footerDivider} />

        {/* Lock App */}
        <Pressable
          accessibilityRole="button"
          disabled={isWorking}
          onPress={handleLockApp}
          style={({ pressed }) => [
            styles.lockButton,
            pressed && styles.menuItemPressed,
            isWorking && styles.disabledButton,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={21} color={GREEN} />
          <Text style={styles.lockLabel}>Lock App</Text>
        </Pressable>

        {/* Log Out */}
        <Pressable
          accessibilityRole="button"
          disabled={isWorking}
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.menuItemPressed,
            isWorking && styles.disabledButton,
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
  // Shared guard: session + role + approval + central lock state.
  const guard = useRequireRole("admin");

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
        headerStyle: { backgroundColor: GREEN },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "800" },
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
            <Ionicons name="grid-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="users"
        options={{
          title: "User Management",
          drawerLabel: "User Management",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="materials"
        options={{
          title: "Learning Materials",
          drawerLabel: "Learning Materials",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="reports"
        options={{
          title: "Reports",
          drawerLabel: "Reports",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="ai"
        options={{
          title: "AI Controls",
          drawerLabel: "AI Controls",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="settings"
        options={{
          title: "Settings",
          drawerLabel: "Settings",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color == null || typeof color === "number" ? undefined : color} size={size} />
          ),
        }}
      />

      <Drawer.Screen
        name="account"
        options={{
          title: "My Account",
          drawerItemStyle: { display: "none" },
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
  accountSectionLabel: {
    marginTop: 22,
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
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  accountMenuText: {
    flex: 1,
    gap: 3,
  },
  accountMenuSubtitle: {
    fontSize: 10,
    color: "#829087",
  },
  accountAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F4E9",
  },
  accountAvatarActive: {
    backgroundColor: "#D6EBDD",
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
    overflow: "hidden",
    backgroundColor: "#E5F4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  footerAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
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
  lockButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: "#E7F3EA",
  },
  lockLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
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
