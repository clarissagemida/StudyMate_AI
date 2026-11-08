import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton";
import { useRequireRole } from "@/hooks/useRequireRole";
import { useUnreadChatMessageCount } from "@/hooks/useUnreadChatMessageCount";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GREEN = "#176B45";
const INACTIVE = "#8A978F";
const BORDER = "#E7EEE9";
const MENU_POSITION_KEY = "teacher-navigation-button-position-v1";
const MENU_BUTTON_SIZE = 48;
const TAB_BAR_HEIGHT = 62;

const drawerGroups = [
  { title: "COMMUNICATION", items: [
    { title: "Messages", icon: "chatbubbles-outline" as const, path: "/teacher/messages" },
    { title: "Notifications", icon: "notifications-outline" as const, path: "/teacher/notifications" },
  ] },
  { title: "CLASSROOM", items: [
    { title: "Announcements", icon: "megaphone-outline" as const, path: "/teacher/announcements" },
  ] },
  { title: "ACCOUNT", items: [
    { title: "Settings & profile", icon: "settings-outline" as const, path: "/teacher/profile" },
  ] },
];

function DraggableMenuButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const defaultPosition = { left: 16, top: insets.top + 12 };
  const [position, setPosition] = useState(defaultPosition);
  const [dragging, setDragging] = useState(false);
  const positionRef = useRef(defaultPosition);
  const dragOrigin = useRef(defaultPosition);
  const touchStart = useRef({ x: 0, y: 0 });
  const suppressTapUntil = useRef(0);

  const clampPosition = useCallback((point: { left: number; top: number }) => {
    const minTop = insets.top + 8;
    const maxLeft = Math.max(8, width - MENU_BUTTON_SIZE - 8);
    const screenMaxTop = Math.max(minTop, height - insets.bottom - TAB_BAR_HEIGHT - MENU_BUTTON_SIZE - 8);
    const maxTop = Math.max(minTop, Math.min(screenMaxTop, insets.top + 20));
    return {
      left: Math.min(maxLeft, Math.max(8, point.left)),
      top: Math.min(maxTop, Math.max(minTop, point.top)),
    };
  }, [height, insets.bottom, insets.top, width]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MENU_POSITION_KEY).then((saved) => {
      if (!active || !saved) return;
      try {
        const parsed = JSON.parse(saved) as { left?: unknown; top?: unknown };
        if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return;
        const next = clampPosition({ left: parsed.left, top: parsed.top });
        positionRef.current = next;
        setPosition(next);
      } catch {
        // Ignore a malformed preference and use the default position.
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [clampPosition]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = clampPosition(positionRef.current);
      positionRef.current = next;
      setPosition(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [clampPosition]);

  return (
    <View
      onStartShouldSetResponderCapture={(event) => {
        touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        return false;
      }}
      onMoveShouldSetResponderCapture={(event) =>
        Math.abs(event.nativeEvent.pageX - touchStart.current.x) + Math.abs(event.nativeEvent.pageY - touchStart.current.y) > 6
      }
      onResponderGrant={() => {
        dragOrigin.current = positionRef.current;
        setDragging(true);
      }}
      onResponderMove={(event) => {
        const dx = event.nativeEvent.pageX - touchStart.current.x;
        const dy = event.nativeEvent.pageY - touchStart.current.y;
        const next = clampPosition({ left: dragOrigin.current.left + dx, top: dragOrigin.current.top + dy });
        positionRef.current = next;
        setPosition(next);
      }}
      onResponderRelease={(event) => {
        setDragging(false);
        const dx = event.nativeEvent.pageX - touchStart.current.x;
        const dy = event.nativeEvent.pageY - touchStart.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) {
          suppressTapUntil.current = Date.now() + 300;
          void AsyncStorage.setItem(MENU_POSITION_KEY, JSON.stringify(positionRef.current)).catch(() => undefined);
        }
      }}
      onResponderTerminate={() => setDragging(false)}
      style={[styles.menuButton, position, dragging && styles.menuButtonDragging]}
    >
      <Pressable
        onPress={() => {
          if (Date.now() >= suppressTapUntil.current) onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open teacher navigation menu"
        accessibilityHint="Drag to move this button, or tap to open the navigation menu."
        style={({ pressed }) => [styles.menuTouch, pressed && styles.aiFabPressed]}
      >
        <Ionicons name="menu" size={24} color={GREEN} />
      </Pressable>
    </View>
  );
}

export default function TeacherTabLayout() {
  // Session + teacher role + approval + central lock, enforced before any
  // tab can mount (deep links included).
  const guard = useRequireRole("teacher");
  const pathname = usePathname();
  const router = useRouter();
  const dark = useColorScheme() === "dark";
  const { count: unreadMessages } = useUnreadChatMessageCount("teacher", guard === "allowed");
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
          title: "Dashboard",
          headerShown: true,
          headerStyle: { backgroundColor: dark ? "#10251A" : GREEN },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { color: "#FFFFFF", fontWeight: "800" },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => setDrawerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open teacher navigation menu"
              hitSlop={10}
              style={styles.headerMenuButton}
            >
              <Ionicons name="menu" size={25} color={GREEN} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push("/teacher/notifications" as never)} accessibilityRole="button" accessibilityLabel={unreadMessages ? `Notifications, ${unreadMessages} unread messages` : "Open notifications"} style={styles.headerNotificationButton}>
              <Ionicons name="notifications-outline" size={21} color="#FFFFFF" />
              {unreadMessages > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadMessages > 99 ? "99+" : unreadMessages}</Text></View> : null}
            </Pressable>
          ),
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
      {pathname !== "/teacher" && pathname !== "/teacher/ai-buddy" ? (
        <View pointerEvents="box-none" style={styles.menuOverlay}>
          <DraggableMenuButton onPress={() => setDrawerOpen(true)} />
        </View>
      ) : null}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerScrim} onPress={() => setDrawerOpen(false)} accessibilityLabel="Close navigation menu" />
          <SafeAreaView style={[styles.drawer, dark && styles.drawerDark]}>
            <View style={[styles.drawerHeader, dark && styles.drawerHeaderDark]}>
              <View style={styles.drawerBrandIcon}><Ionicons name="school" size={22} color="#FFFFFF" /></View>
              <View style={styles.drawerBrandCopy}><Text style={[styles.drawerBrand, dark && styles.drawerTextDark]}>StudyMate AI</Text><Text style={styles.drawerCaption}>TEACHER WORKSPACE</Text></View>
              <Pressable onPress={() => setDrawerOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu"><Ionicons name="close" size={23} color={dark ? "#C0CEC3" : "#65776B"} /></Pressable>
            </View>
            <Pressable onPress={backToDashboard} style={({ pressed, hovered }) => [styles.drawerItem, styles.dashboardItem, dark && styles.drawerItemDark, hovered && styles.drawerItemHovered, pressed && styles.drawerItemPressed]} accessibilityRole="button" accessibilityLabel="Back to teacher dashboard">
              <Ionicons name="arrow-back-circle-outline" size={20} color={dark ? "#B9E4C7" : GREEN} /><Text style={[styles.dashboardItemText, dark && styles.drawerTextDark]}>Back to Dashboard</Text><Ionicons name="chevron-forward" size={16} color="#A1AAA4" />
            </Pressable>
            {drawerGroups.map((group) => <View key={group.title} style={styles.drawerGroup}>
              <Text style={[styles.drawerSection, dark && styles.drawerMutedDark]}>{group.title}</Text>
              {group.items.map((item) => {
              const selected = pathname === item.path;
              return <Pressable key={item.path} onPress={() => navigateFromDrawer(item.path)} style={({ pressed, hovered }) => [styles.drawerItem, dark && styles.drawerItemDark, selected && styles.drawerItemSelected, dark && selected && styles.drawerItemSelectedDark, hovered && styles.drawerItemHovered, pressed && styles.drawerItemPressed]} accessibilityRole="button">
              <Ionicons name={item.icon} size={20} color={selected ? (dark ? "#B9E4C7" : GREEN) : dark ? "#AAB8AE" : "#738178"} /><Text style={[styles.drawerItemText, dark && styles.drawerTextDark, selected && styles.drawerItemTextSelected]}>{item.title}</Text>{item.path === "/teacher/messages" && unreadMessages > 0 ? <View style={styles.drawerUnreadBadge}><Text style={styles.drawerUnreadBadgeText}>{unreadMessages > 99 ? "99+" : unreadMessages}</Text></View> : null}<Ionicons name="chevron-forward" size={16} color={selected ? GREEN : "#A1AAA4"} />
              </Pressable>;
            })}</View>)}
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
  menuOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999 },
  headerMenuButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 2, borderWidth: 1.5, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF" },
  headerNotificationButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 5 },
  notificationBadge: { position: "absolute", top: 1, right: 0, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#D94B4B", borderColor: GREEN, borderWidth: 1.5 },
  notificationBadgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
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
  menuButton: { position: "absolute", width: MENU_BUTTON_SIZE, height: MENU_BUTTON_SIZE, borderRadius: 16, backgroundColor: "#FFFFFF", elevation: 10000, shadowColor: "#103D28", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, zIndex: 10000 },
  menuButtonDragging: { opacity: 0.9, elevation: 10000, shadowOpacity: 0.24 },
  menuTouch: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 16 },
  drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(13, 31, 21, 0.38)" },
  drawerScrim: { ...StyleSheet.absoluteFill },
  drawer: { width: "84%", maxWidth: 350, height: "100%", backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20, elevation: 16, shadowColor: "#000000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 4, height: 0 } },
  drawerDark: { backgroundColor: "#151F18" },
  drawerHeaderDark: { borderBottomColor: "#2B392F" },
  drawerTextDark: { color: "#EEF4EF" },
  drawerMutedDark: { color: "#AAB8AE" },
  drawerGroup: { marginTop: 12 },
  drawerItemDark: { backgroundColor: "transparent" },
  drawerItemSelectedDark: { backgroundColor: "#21352A" },
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
  drawerUnreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
  drawerUnreadBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
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
