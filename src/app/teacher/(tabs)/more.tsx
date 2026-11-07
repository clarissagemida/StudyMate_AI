import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/theme/tokens";

type MenuItem = { title: string; description: string; icon: keyof typeof Ionicons.glyphMap; path: string };

const items: MenuItem[] = [
  { title: "Messages", description: "Continue conversations with students", icon: "chatbubbles-outline", path: "/teacher/messages" },
  { title: "Announcements", description: "Share class updates with students", icon: "megaphone-outline", path: "/teacher/announcements" },
  { title: "Profile", description: "Manage your account and teaching profile", icon: "person-outline", path: "/teacher/profile" },
];

export default function TeacherMoreScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>STUDYMATE AI</Text>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Communication and account tools.</Text>
        <Text style={styles.section}>COMMUNICATION</Text>
        <View style={styles.group}>{items.slice(0, 2).map((item) => <MenuRow key={item.path} item={item} />)}</View>
        <Text style={styles.section}>ACCOUNT</Text>
        <View style={styles.group}><MenuRow item={items[2]} /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <Pressable onPress={() => router.push(item.path as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.iconBox}><Ionicons name={item.icon} size={21} color={colors.primary} /></View>
      <View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowDescription}>{item.description}</Text></View>
      <Ionicons name="chevron-forward" size={19} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: spacing.xs },
  title: { color: colors.textStrong, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs, marginBottom: spacing.xl },
  section: { color: colors.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden" },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBox: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  rowDescription: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  pressed: { opacity: 0.82 },
});
