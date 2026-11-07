import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { useUnreadAnnouncementCount } from "@/hooks/useUnreadAnnouncementCount";
import { AI_ENABLED } from "@/utils/aiFlags";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";
const SIDEBAR_ITEMS = [
  { title: "Announcements", description: "Teacher updates and notices", icon: "megaphone-outline" as const, path: "/student/announcements" },
  { title: "Practice history", description: "Review your practice results", icon: "time-outline" as const, path: "/student/practice-history" },
  { title: "Profile & Settings", description: "Manage your account and password", icon: "person-outline" as const, path: "/student/profile" },
];

export default function StudentTabLayout() {
  // Session + student role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("student");
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { count: unreadAnnouncements } = useUnreadAnnouncementCount(guard === "allowed");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainTabPaths = ["/student", "/student/study", "/student/quizzes", "/student/messages"];
  const isMainTab = mainTabPaths.includes(pathname);

  const navigateFromDrawer = (path: string, replace = false) => {
    setDrawerOpen(false);
    if (routeTimer.current) clearTimeout(routeTimer.current);
    routeTimer.current = setTimeout(() => {
      if (replace) router.replace(path as never);
      else router.push(path as never);
      routeTimer.current = null;
    }, 160);
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
          This area is restricted to approved student accounts.
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
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color == null || typeof color === "number" ? undefined : color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="study"
        options={{
          title: "Study",
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
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color == null || typeof color === "number" ? undefined : color} />
          ),
        }}
      />
    </Tabs>
    {isMainTab ? <Pressable
      onPress={() => setDrawerOpen(true)}
      accessibilityRole="button"
      accessibilityLabel="Open student navigation menu"
      style={({ pressed, hovered }) => [styles.menuButton, { top: insets.top + 8 }, hovered && styles.iconHover, pressed && styles.iconPressed]}
    ><Ionicons name="menu" size={23} color={GREEN} /></Pressable> : null}
    {isMainTab ? <Pressable
      onPress={() => router.push("/student/announcements" as never)}
      accessibilityRole="button"
      accessibilityLabel={unreadAnnouncements ? `Announcements, ${unreadAnnouncements} unread` : "Open announcements"}
      style={({ pressed, hovered }) => [styles.bellButton, { top: insets.top + 8 }, hovered && styles.iconHover, pressed && styles.iconPressed]}
    ><Ionicons name="notifications-outline" size={21} color={GREEN} />{unreadAnnouncements > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadAnnouncements > 99 ? "99+" : unreadAnnouncements}</Text></View> : null}</Pressable> : null}
    <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
      <View style={styles.drawerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} accessibilityLabel="Close student menu" />
        <SafeAreaView style={styles.drawer} edges={["top", "bottom", "left"]}>
          <View style={styles.drawerHeader}><View style={styles.drawerLogo}><Ionicons name="school" size={22} color="#FFFFFF" /></View><View style={styles.drawerBrandCopy}><Text style={styles.drawerBrand}>StudyMate AI</Text><Text style={styles.drawerCaption}>STUDENT SPACE</Text></View><Pressable onPress={() => setDrawerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu"><Ionicons name="close" size={23} color="#65776B" /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerItems}>
            <Text style={styles.drawerSection}>NAVIGATION</Text>
            <Pressable onPress={() => navigateFromDrawer("/student", true)} style={({ pressed, hovered }) => [styles.drawerItem, hovered && styles.drawerItemHover, pressed && styles.drawerItemPressed]} accessibilityRole="button"><Ionicons name="home-outline" size={20} color={GREEN} /><Text style={styles.drawerItemText}>Back to Dashboard</Text><Ionicons name="chevron-forward" size={16} color="#9AA69D" /></Pressable>
            {SIDEBAR_ITEMS.map((item) => <Pressable key={item.path} onPress={() => navigateFromDrawer(item.path)} style={({ pressed, hovered }) => [styles.drawerItem, pathname === item.path && styles.drawerItemSelected, hovered && styles.drawerItemHover, pressed && styles.drawerItemPressed]} accessibilityRole="button">
              <Ionicons name={item.icon} size={20} color={pathname === item.path ? GREEN : "#68786E"} /><View style={styles.drawerItemCopy}><Text style={[styles.drawerItemText, pathname === item.path && styles.drawerItemTextActive]}>{item.title}</Text><Text style={styles.drawerItemDescription}>{item.description}</Text></View><Ionicons name="chevron-forward" size={16} color="#9AA69D" />
            </Pressable>)}
            <View style={styles.drawerDivider} />
            <Text style={styles.drawerHint}>Messages with teachers are available from the Messages tab after a quiz connects you to that teacher.</Text>
          </ScrollView>
          <View style={styles.drawerFooter}><Ionicons name="shield-checkmark-outline" size={16} color={GREEN} /><Text style={styles.drawerFooterText}>Your learning progress and profile are saved to your account.</Text></View>
        </SafeAreaView>
      </View>
    </Modal>
    {AI_ENABLED && isMainTab ? (
      <Pressable
        onPress={() => router.push({ pathname: "/student/ai-buddy", params: { returnTo: pathname } })}
        accessibilityRole="button"
        accessibilityLabel="Open StudyMate AI Buddy"
        accessibilityHint="Opens your study assistant and returns to this screen when you go back."
        style={({ pressed, hovered }) => [styles.aiFab, hovered && styles.aiFabHovered, pressed && styles.aiFabPressed]}
      >
        <View style={styles.aiFabIcon}><Ionicons name="sparkles" size={18} color="#FFFFFF" /></View>
        <Text style={styles.aiFabLabel}>AI Buddy</Text>
        <View style={styles.aiFabArrow}><Ionicons name="arrow-up" size={13} color={GREEN} /></View>
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
  menuButton: { position: "absolute", left: 16, width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE0", elevation: 5, shadowColor: "#103D28", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 10 },
  bellButton: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE0", elevation: 5, shadowColor: "#103D28", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 10 },
  bellBadge: { position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#D94B4B", borderColor: "#FFFFFF", borderWidth: 1.5 },
  bellBadgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  iconHover: { backgroundColor: "#CDE8D3", borderColor: "#75A984" },
  iconPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  drawerOverlay: { flex: 1, backgroundColor: "rgba(13, 31, 21, 0.4)" },
  drawer: { width: "84%", maxWidth: 350, height: "100%", backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18, elevation: 16, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 4, height: 0 } },
  drawerHeader: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 20 },
  drawerLogo: { width: 42, height: 42, borderRadius: 14, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  drawerBrandCopy: { flex: 1 }, drawerBrand: { fontSize: 16, fontWeight: "800", color: "#123D2A" }, drawerCaption: { fontSize: 9, fontWeight: "800", color: "#87948B", letterSpacing: 1.3, marginTop: 3 },
  drawerItems: { gap: 3 }, drawerSection: { color: "#87948B", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
  drawerItem: { minHeight: 54, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 3 },
  drawerItemSelected: { backgroundColor: "#EAF4EC" }, drawerItemHover: { backgroundColor: "#CDE8D3", borderWidth: 1, borderColor: "#75A984" }, drawerItemPressed: { opacity: 0.72 },
  drawerItemCopy: { flex: 1 }, drawerItemText: { flex: 1, color: "#425348", fontSize: 13, fontWeight: "700" }, drawerItemTextActive: { color: GREEN, fontWeight: "800" }, drawerItemDescription: { color: "#829087", fontSize: 10, marginTop: 3 },
  drawerDivider: { height: 1, backgroundColor: BORDER, marginVertical: 14 }, drawerHint: { color: "#718078", fontSize: 11, lineHeight: 17, paddingHorizontal: 4 },
  drawerFooter: { marginTop: "auto", borderRadius: 13, backgroundColor: "#F3F8F4", padding: 13, flexDirection: "row", alignItems: "center", gap: 8 }, drawerFooterText: { flex: 1, color: "#63766A", fontSize: 11, lineHeight: 16 },
  aiFab: {
    position: "absolute", right: 16, bottom: 76, minHeight: 54,
    paddingLeft: 7, paddingRight: 14, borderRadius: 28, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#DCEAE0", flexDirection: "row", alignItems: "center",
    gap: 9, elevation: 8, shadowColor: "#103D28", shadowOpacity: 0.18,
    shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  aiFabPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  aiFabHovered: { backgroundColor: "#E2F1E5", borderColor: "#75A984" },
  aiFabIcon: { width: 40, height: 40, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
  aiFabLabel: { color: "#123D2A", fontSize: 13, fontWeight: "800" },
  aiFabArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#E8F3EB", alignItems: "center", justifyContent: "center" },
});
