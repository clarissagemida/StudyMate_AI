import { colors, radius, spacing } from "@/theme/tokens";
import { StyleSheet, View } from "react-native";

/** Placeholder shown while the signed-in user's dashboard access is checked. */
export function DashboardSkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your dashboard"
      accessibilityState={{ busy: true }}
      role="progressbar"
      aria-valuetext="Loading your dashboard"
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.greeting}>
          <View style={styles.eyebrow} />
          <View style={styles.title} />
          <View style={styles.subtitle} />
        </View>
        <View style={styles.avatar} />
      </View>

      <View style={styles.featureCard}>
        <View style={styles.featureText}>
          <View style={styles.featureLabel} />
          <View style={styles.featureTitle} />
          <View style={styles.featureSubtitle} />
        </View>
        <View style={styles.featureIcon} />
        <View style={styles.featureTrack} />
      </View>

      <View style={styles.sectionTitle} />
      <View style={styles.actions}>
        <View style={styles.actionCard}>
          <View style={styles.actionIcon} />
          <View style={styles.actionTitle} />
          <View style={styles.actionSubtitle} />
        </View>
        <View style={styles.actionCard}>
          <View style={styles.actionIcon} />
          <View style={styles.actionTitle} />
          <View style={styles.actionSubtitle} />
        </View>
      </View>

      <View style={styles.sectionTitle} />
      <View style={styles.activityCard}>
        <View style={styles.activityIcon} />
        <View style={styles.activityText}>
          <View style={styles.activityTitle} />
          <View style={styles.activitySubtitle} />
        </View>
      </View>
      <View style={styles.activityCard}>
        <View style={styles.activityIcon} />
        <View style={styles.activityText}>
          <View style={styles.activityTitle} />
          <View style={styles.activitySubtitle} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  greeting: { flex: 1, gap: 9 },
  eyebrow: { width: 105, height: 9, borderRadius: radius.pill, backgroundColor: "#DDE8DF" },
  title: { width: "62%", height: 23, borderRadius: radius.sm, backgroundColor: "#DDE8DF" },
  subtitle: { width: "76%", height: 11, borderRadius: radius.pill, backgroundColor: "#E5ECE6" },
  avatar: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: "#DDE8DF", marginLeft: spacing.md },
  featureCard: {
    minHeight: 158,
    padding: spacing.xl,
    borderRadius: radius.xxl,
    backgroundColor: "#DCE9DF",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  featureText: { gap: 10 },
  featureLabel: { width: 105, height: 9, borderRadius: radius.pill, backgroundColor: "#C5D8CA" },
  featureTitle: { width: "65%", height: 20, borderRadius: radius.sm, backgroundColor: "#C5D8CA" },
  featureSubtitle: { width: "82%", height: 11, borderRadius: radius.pill, backgroundColor: "#C5D8CA" },
  featureIcon: { position: "absolute", right: spacing.xl, top: spacing.xl, width: 48, height: 48, borderRadius: radius.lg, backgroundColor: "#C5D8CA" },
  featureTrack: { height: 7, borderRadius: radius.pill, backgroundColor: "#C5D8CA", marginTop: spacing.lg },
  sectionTitle: { width: "58%", height: 15, borderRadius: radius.sm, backgroundColor: "#DDE8DF", marginTop: spacing.sm, marginBottom: spacing.xs },
  actions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  actionCard: { flex: 1, minHeight: 125, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", gap: 10 },
  actionIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: "#E5EEE7" },
  actionTitle: { width: "82%", height: 12, borderRadius: radius.pill, backgroundColor: "#DDE8DF" },
  actionSubtitle: { width: "96%", height: 9, borderRadius: radius.pill, backgroundColor: "#E8EEE9" },
  activityCard: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  activityIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#E5EEE7" },
  activityText: { flex: 1, gap: 9 },
  activityTitle: { width: "64%", height: 11, borderRadius: radius.pill, backgroundColor: "#DDE8DF" },
  activitySubtitle: { width: "88%", height: 9, borderRadius: radius.pill, backgroundColor: "#E8EEE9" },
});
