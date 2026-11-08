import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { useUnreadAnnouncementCount } from "@/hooks/useUnreadAnnouncementCount";
import { useUnreadChatMessageCount } from "@/hooks/useUnreadChatMessageCount";
import { AI_ENABLED } from "@/utils/aiFlags";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";
const SIDEBAR_GROUPS = [
  { title: "LEARNING", items: [
    { title: "Analytics", description: "Study and quiz progress", icon: "analytics-outline" as const, path: "/student/analytics" },
    { title: "Practice history", description: "Your AI practice results", icon: "time-outline" as const, path: "/student/practice-history" },
  ] },
  { title: "UPDATES", items: [
    { title: "Announcements", description: "Browse class announcements", icon: "megaphone-outline" as const, path: "/student/announcements" },
  ] },
  { title: "ACCOUNT", items: [
    { title: "Profile & settings", description: "Account and preferences", icon: "person-outline" as const, path: "/student/profile" },
  ] },
];

export default function StudentTabLayout() {
  // Session + student role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("student");
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const { count: unreadAnnouncements } = useUnreadAnnouncementCount(guard === "allowed");
  const { count: unreadMessageCount } = useUnreadChatMessageCount("student", guard === "allowed");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showFloatingNavigation = pathname === "/student/study" || pathname === "/student/quizzes";
  const showAiBuddy = AI_ENABLED && ["/student", "/student/study", "/student/quizzes"].includes(pathname);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        tabBarActiveTintColor: dark ? "#B9E4C7" : GREEN,
        tabBarInactiveTintColor: dark ? "#9EADA3" : INACTIVE,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [styles.tabBar, dark && styles.tabBarDark],
        sceneStyle: { backgroundColor: dark ? "#101A14" : "#F4F8F5" },
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerShown: true,
          headerTitle: "Dashboard",
          headerStyle: [styles.dashboardNavigationHeader, dark && styles.dashboardNavigationHeaderDark],
          headerTintColor: "#FFFFFF",
          headerTitleStyle: styles.headerTitle,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => setDrawerOpen(true)} accessibilityRole="button" accessibilityLabel="Open student navigation menu" hitSlop={10} style={styles.headerMenuButton}>
              <Ionicons name="menu" size={24} color={GREEN} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push("/student/announcements" as never)} accessibilityRole="button" accessibilityLabel={unreadAnnouncements ? `Announcements, ${unreadAnnouncements} unread` : "Open announcements"} style={styles.headerActionButton}>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              {unreadAnnouncements > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadAnnouncements > 99 ? "99+" : unreadAnnouncements}</Text></View> : null}
            </Pressable>
          ),
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
          tabBarBadge: unreadMessageCount > 0 ? (unreadMessageCount > 99 ? "99+" : unreadMessageCount) : undefined,
          tabBarBadgeStyle: styles.messageTabBadge,
          tabBarAccessibilityLabel: unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : "Messages",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color == null || typeof color === "number" ? undefined : color} />
          ),
        }}
      />
    </Tabs>
    {showFloatingNavigation ? (
      <>
        <Pressable onPress={() => setDrawerOpen(true)} accessibilityRole="button" accessibilityLabel="Open student navigation menu" style={({ pressed }) => [styles.floatingControl, styles.floatingMenu, { top: insets.top + 10 }, pressed && styles.controlPressed]}>
          <Ionicons name="menu" size={23} color={GREEN} />
        </Pressable>
        <Pressable onPress={() => router.push("/student/announcements" as never)} accessibilityRole="button" accessibilityLabel={unreadAnnouncements ? `Announcements, ${unreadAnnouncements} unread` : "Open announcements"} style={({ pressed }) => [styles.floatingControl, styles.floatingBell, { top: insets.top + 10 }, pressed && styles.controlPressed]}>
          <Ionicons name="notifications-outline" size={21} color={GREEN} />
          {unreadAnnouncements > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadAnnouncements > 99 ? "99+" : unreadAnnouncements}</Text></View> : null}
        </Pressable>
      </>
    ) : null}
    {showAiBuddy ? (
      <Pressable
        onPress={() => router.push({ pathname: "/student/ai-buddy", params: { returnTo: pathname } })}
        accessibilityRole="button"
        accessibilityLabel="Open StudyMate AI Buddy"
        accessibilityHint="Opens your study assistant and returns to this screen when you go back."
        style={({ pressed, hovered }) => [styles.aiFab, { bottom: Math.max(76, insets.bottom + 74) }, hovered && styles.aiFabHovered, pressed && styles.aiFabPressed]}
      >
        <View style={styles.aiFabIcon}><Ionicons name="sparkles" size={18} color="#FFFFFF" /></View>
        <Text style={styles.aiFabLabel}>AI Buddy</Text>
        <View style={styles.aiFabArrow}><Ionicons name="arrow-up" size={13} color={GREEN} /></View>
      </Pressable>
    ) : null}
    <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
      <View style={styles.drawerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setDrawerOpen(false)} accessibilityLabel="Close student menu" />
        <SafeAreaView style={[styles.drawer, dark && styles.drawerDark]} edges={["top", "bottom", "left"]}>
          <View style={[styles.drawerHeader, dark && styles.drawerHeaderDark]}><View style={styles.drawerLogo}><Ionicons name="school" size={21} color="#FFFFFF" /></View><View style={styles.drawerBrandCopy}><Text style={[styles.drawerBrand, dark && styles.drawerTextDark]}>StudyMate AI</Text><Text style={styles.drawerCaption}>STUDENT SPACE</Text></View><Pressable onPress={() => setDrawerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu" style={[styles.drawerClose, dark && styles.drawerControlDark]}><Ionicons name="close" size={20} color={dark ? "#C0CEC3" : "#65776B"} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerItems}>
            <Pressable onPress={() => navigateFromDrawer("/student", true)} style={({ pressed }) => [styles.drawerHome, dark && styles.drawerItemDark, pathname === "/student" && styles.drawerHomeActive, dark && pathname === "/student" && styles.drawerItemSelectedDark, pressed && styles.drawerItemPressed]} accessibilityRole="button" accessibilityLabel="Go to dashboard"><View style={[styles.drawerHomeIcon, dark && styles.drawerIconDark]}><Ionicons name="home" size={17} color={dark ? "#B9E4C7" : GREEN} /></View><Text style={[styles.drawerHomeText, dark && styles.drawerTextDark]}>Dashboard</Text>{pathname === "/student" ? <View style={styles.currentPage}><Text style={styles.currentPageText}>CURRENT</Text></View> : null}</Pressable>
            {SIDEBAR_GROUPS.map((group) => <View key={group.title} style={styles.drawerGroup}><Text style={styles.drawerSection}>{group.title}</Text>{group.items.map((item) => {
              const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
              return <Pressable key={item.path} onPress={() => navigateFromDrawer(item.path)} style={({ pressed, hovered }) => [styles.drawerItem, dark && styles.drawerItemDark, active && styles.drawerItemSelected, dark && active && styles.drawerItemSelectedDark, hovered && styles.drawerItemHover, pressed && styles.drawerItemPressed]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <View style={[styles.drawerItemIcon, dark && styles.drawerIconDark, active && styles.drawerItemIconActive]}><Ionicons name={item.icon} size={18} color={active ? (dark ? "#B9E4C7" : GREEN) : dark ? "#AAB8AE" : "#68786E"} /></View><View style={styles.drawerItemCopy}><Text style={[styles.drawerItemText, dark && styles.drawerTextDark, active && styles.drawerItemTextActive]}>{item.title}</Text><Text style={[styles.drawerItemDescription, dark && styles.drawerMutedDark]}>{item.description}</Text></View>{active ? <View style={styles.activeMark} /> : null}
              </Pressable>;
            })}</View>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
  dashboardNavigationHeader: { backgroundColor: GREEN },
  dashboardNavigationHeaderDark: { backgroundColor: "#10251A" },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  headerMenuButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 2, backgroundColor: "#FFFFFF" },
  headerActionButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 4 },
  floatingControl: { position: "absolute", width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE0", elevation: 5, shadowColor: "#103D28", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 20 },
  floatingMenu: { left: 16 },
  floatingBell: { right: 16 },
  controlPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
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
  tabBarDark: { backgroundColor: "#151F18", borderTopColor: "#2B392F" },
  tabItem: {
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
  messageTabBadge: { color: "#FFFFFF", backgroundColor: "#D94B4B", fontSize: 9, fontWeight: "800", minWidth: 17, height: 17, lineHeight: 17, textAlign: "center", paddingHorizontal: 4 },
  bellBadge: { position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#D94B4B", borderColor: "#FFFFFF", borderWidth: 1.5 },
  bellBadgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  aiFab: { position: "absolute", right: 16, minHeight: 54, paddingLeft: 7, paddingRight: 14, borderRadius: 28, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE0", flexDirection: "row", alignItems: "center", gap: 9, elevation: 8, shadowColor: "#103D28", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, zIndex: 20 },
  aiFabPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  aiFabHovered: { backgroundColor: "#E2F1E5", borderColor: "#75A984" },
  aiFabIcon: { width: 40, height: 40, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
  aiFabLabel: { color: "#123D2A", fontSize: 13, fontWeight: "800" },
  aiFabArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#E8F3EB", alignItems: "center", justifyContent: "center" },
  drawerOverlay: { flex: 1, backgroundColor: "rgba(13, 31, 21, 0.4)" },
  drawer: { width: "84%", maxWidth: 350, height: "100%", backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18, elevation: 16, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 4, height: 0 } },
  drawerDark: { backgroundColor: "#151F18" },
  drawerHeaderDark: { borderBottomColor: "#2B392F" },
  drawerControlDark: { backgroundColor: "#202D24" },
  drawerTextDark: { color: "#EEF4EF" },
  drawerMutedDark: { color: "#AAB8AE" },
  drawerItemDark: { backgroundColor: "transparent" },
  drawerItemSelectedDark: { backgroundColor: "#21352A" },
  drawerIconDark: { backgroundColor: "#202D24" },
  drawerHeader: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 16 },
  drawerLogo: { width: 39, height: 39, borderRadius: 13, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  drawerBrandCopy: { flex: 1 }, drawerBrand: { fontSize: 15, fontWeight: "800", color: "#123D2A" }, drawerCaption: { fontSize: 9, fontWeight: "800", color: "#87948B", letterSpacing: 1.2, marginTop: 3 },
  drawerClose: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F3F7F4", alignItems: "center", justifyContent: "center" },
  drawerItems: { gap: 4, paddingBottom: 12 }, drawerHome: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, borderRadius: 12, marginBottom: 12 }, drawerHomeActive: { backgroundColor: "#EAF4EC" }, drawerHomeIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#F0F6F1", alignItems: "center", justifyContent: "center" }, drawerHomeText: { flex: 1, color: "#31483A", fontSize: 12, fontWeight: "800" }, currentPage: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: "#D8EBDD" }, currentPageText: { color: GREEN, fontSize: 8, fontWeight: "900", letterSpacing: 0.4 },
  drawerGroup: { marginBottom: 12 }, drawerSection: { color: "#88968D", fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginLeft: 10, marginBottom: 6 },
  drawerItem: { minHeight: 53, borderRadius: 12, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 3 },
  drawerItemSelected: { backgroundColor: "#EFF6F0" }, drawerItemHover: { backgroundColor: "#E5F1E7" }, drawerItemPressed: { opacity: 0.72 }, drawerItemIcon: { width: 33, height: 33, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F7F5" }, drawerItemIconActive: { backgroundColor: "#DDEEE0" }, activeMark: { width: 4, height: 24, borderRadius: 2, backgroundColor: GREEN },
  drawerItemCopy: { flex: 1 }, drawerItemText: { color: "#425348", fontSize: 12, fontWeight: "700" }, drawerItemTextActive: { color: GREEN, fontWeight: "800" }, drawerItemDescription: { color: "#829087", fontSize: 10, marginTop: 3 },
});
