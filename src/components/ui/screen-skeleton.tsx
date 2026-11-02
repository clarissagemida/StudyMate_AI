import { colors, radius, spacing } from "@/theme/tokens";
import { StyleSheet, View } from "react-native";

/** Content-shaped placeholder for a screen while its initial data is loading. */
export function ScreenSkeleton() {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading screen"
      accessibilityState={{ busy: true }}
      role="progressbar"
      aria-valuetext="Loading screen"
      style={styles.container}
    >
      <View style={styles.heading} />
      <View style={styles.subheading} />
      <View style={styles.feature}>
        <View style={styles.lineWide} />
        <View style={styles.lineMedium} />
      </View>
      <View style={styles.lineTitle} />
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={styles.row}>
          <View style={styles.icon} />
          <View style={styles.rowText}>
            <View style={styles.lineMedium} />
            <View style={styles.lineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  heading: { width: "58%", height: 24, borderRadius: radius.sm, backgroundColor: "#DDE8DF", marginBottom: 2 },
  subheading: { width: "82%", height: 11, borderRadius: radius.pill, backgroundColor: "#E5ECE6", marginBottom: spacing.md },
  feature: { minHeight: 112, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: "#DCE9DF", justifyContent: "center", gap: spacing.md, marginBottom: spacing.sm },
  lineWide: { width: "72%", height: 13, borderRadius: radius.pill, backgroundColor: "#C5D8CA" },
  lineMedium: { width: "62%", height: 11, borderRadius: radius.pill, backgroundColor: "#DDE8DF" },
  lineShort: { width: "42%", height: 9, borderRadius: radius.pill, backgroundColor: "#E8EEE9" },
  lineTitle: { width: "44%", height: 15, borderRadius: radius.sm, backgroundColor: "#DDE8DF", marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: "#E5EEE7" },
  rowText: { flex: 1, gap: spacing.sm },
});
