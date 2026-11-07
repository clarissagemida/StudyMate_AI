import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";

const drawerItems = [
  { title: "Messages", icon: "chatbubbles-outline" as const, path: "/teacher/messages" },
  { title: "Announcements", icon: "megaphone-outline" as const, path: "/teacher/announcements" },
  { title: "Settings & profile", icon: "settings-outline" as const, path: "/teacher/profile" },
];

export default function TeacherTabLayout() {
  // Session + teacher role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("teacher");
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateFromDrawer = (path: string) => {
    setDrawerOpen(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    // Wait for the modal to dismiss before changing the nested tab route.
    navigationTimer.current = setTimeout(() => {
      router.push(path as never);
      navigationTimer.current = null;
    }, 180);
  };

  const backToDashboard = () => {
    setDrawerOpen(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => {
      router.replace("/teacher");
      navigationTimer.current = null;
    }, 180);
  };

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

      <Tabs.Screen
        name="students"
        options={{
          title: "Students",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={size} color={color == null || typeof color === "number" ? undefined : color} />
          ),
        }}
      />

      <Tabs.Screen name="more" options={{ href: null }} />
      </Tabs>
      {pathname !== "/teacher/ai-buddy" ? (
        <Pressable
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open teacher navigation menu"
          style={({ pressed }) => [styles.menuButton, pressed && styles.aiFabPressed]}
        >
          <Ionicons name="menu" size={24} color={GREEN} />
        </Pressable>
      ) : null}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerScrim} onPress={() => setDrawerOpen(false)} accessibilityLabel="Close navigation menu" />
          <SafeAreaView style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandIcon}><Ionicons name="school" size={22} color="#FFFFFF" /></View>
              <View style={styles.drawerBrandCopy}><Text style={styles.drawerBrand}>StudyMate AI</Text><Text style={styles.drawerCaption}>TEACHER WORKSPACE</Text></View>
              <Pressable onPress={() => setDrawerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu"><Ionicons name="close" size={23} color="#65776B" /></Pressable>
            </View>
            <Text style={styles.drawerSection}>MORE TOOLS</Text>
            <Pressable onPress={backToDashboard} style={({ pressed, hovered }) => [styles.drawerItem, styles.dashboardItem, hovered && styles.drawerItemHovered, pressed && styles.drawerItemPressed]} accessibilityRole="button" accessibilityLabel="Back to teacher dashboard">
              <Ionicons name="arrow-back-circle-outline" size={20} color={GREEN} /><Text style={styles.dashboardItemText}>Back to Dashboard</Text><Ionicons name="chevron-forward" size={16} color="#A1AAA4" />
            </Pressable>
            {drawerItems.slice(0, 2).map((item) => {
              const selected = pathname === item.path;
              return <Pressable key={item.path} onPress={() => navigateFromDrawer(item.path)} style={({ pressed, hovered }) => [styles.drawerItem, selected && styles.drawerItemSelected, hovered && styles.drawerItemHovered, pressed && styles.drawerItemPressed]} accessibilityRole="button">
                <Ionicons name={item.icon} size={20} color={selected ? GREEN : "#738178"} /><Text style={[styles.drawerItemText, selected && styles.drawerItemTextSelected]}>{item.title}</Text><Ionicons name="chevron-forward" size={16} color={selected ? GREEN : "#A1AAA4"} />
              </Pressable>;
            })}
            <View style={styles.drawerDivider} />
            <Pressable onPress={() => navigateFromDrawer(drawerItems[2].path)} style={({ pressed, hovered }) => [styles.drawerItem, pathname === drawerItems[2].path && styles.drawerItemSelected, hovered && styles.drawerItemHovered, pressed && styles.drawerItemPressed]} accessibilityRole="button">
              <Ionicons name={drawerItems[2].icon} size={20} color={pathname === drawerItems[2].path ? GREEN : "#738178"} /><Text style={[styles.drawerItemText, pathname === drawerItems[2].path && styles.drawerItemTextSelected]}>{drawerItems[2].title}</Text><Ionicons name="chevron-forward" size={16} color="#A1AAA4" />
            </Pressable>
            <View style={styles.drawerFooter}><Ionicons name="shield-checkmark-outline" size={16} color={GREEN} /><Text style={styles.drawerFooterText}>Your teaching profile is saved to your account.</Text></View>
          </SafeAreaView>
        </View>
      </Modal>
      {pathname !== "/teacher/ai-buddy" ? (
        <Pressable
          onPress={() => router.push({ pathname: "/teacher/ai-buddy", params: { returnTo: pathname } })}
          accessibilityRole="button"
          accessibilityLabel="Open Teacher AI Buddy"
          style={({ pressed, hovered }) => [styles.aiFab, hovered && styles.aiFabHovered, pressed && styles.aiFabPressed]}
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
  menuButton: { position: "absolute", top: 12, left: 16, width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE0", elevation: 5, shadowColor: "#103D28", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 10 },
  drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(13, 31, 21, 0.38)" },
  drawerScrim: { ...StyleSheet.absoluteFill },
  drawer: { width: "84%", maxWidth: 350, height: "100%", backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20, elevation: 16, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 4, height: 0 } },
  drawerHeader: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 20 },
  drawerBrandIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  drawerBrandCopy: { flex: 1 },
  drawerBrand: { fontSize: 16, fontWeight: "800", color: "#123D2A" },
  drawerCaption: { fontSize: 9, fontWeight: "800", color: "#87948B", letterSpacing: 1.3, marginTop: 3 },
  drawerSection: { color: "#87948B", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  drawerItem: { minHeight: 50, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 3 },
  drawerItemSelected: { backgroundColor: "#EAF4EC" },
  drawerItemHovered: { backgroundColor: "#CDE8D3", borderWidth: 1, borderColor: "#75A984", transform: [{ scale: 1.01 }] },
  dashboardItem: { backgroundColor: "#F3F8F4", marginBottom: 10 },
  dashboardItemText: { flex: 1, color: GREEN, fontSize: 13, fontWeight: "800" },
  drawerItemPressed: { opacity: 0.72 },
  drawerItemText: { flex: 1, color: "#425348", fontSize: 13, fontWeight: "600" },
  drawerItemTextSelected: { color: GREEN, fontWeight: "800" },
  drawerDivider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  drawerFooter: { marginTop: "auto", borderRadius: 13, backgroundColor: "#F3F8F4", padding: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  drawerFooterText: { flex: 1, color: "#63766A", fontSize: 11, lineHeight: 16 },
  aiFabPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  aiFabHovered: { backgroundColor: "#E2F1E5", borderColor: "#75A984" },
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
