import { colors, radius, spacing } from "@/theme/tokens";
import { StyleSheet, useColorScheme, View } from "react-native";

/** Content-shaped placeholder for a screen while its initial data is loading. */
export function ScreenSkeleton() {
  const dark = useColorScheme() === "dark";
  const styles = createStyles(dark);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Preparing screen"
      accessibilityState={{ busy: true }}
      role="progressbar"
      aria-valuetext="Preparing screen"
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

function createStyles(dark: boolean) {
return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark ? "#101A14" : colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  heading: { width: "58%", height: 24, borderRadius: radius.sm, backgroundColor: dark ? "#2B3A30" : "#DDE8DF", marginBottom: 2 },
  subheading: { width: "82%", height: 11, borderRadius: radius.pill, backgroundColor: dark ? "#26342A" : "#E5ECE6", marginBottom: spacing.md },
  feature: { minHeight: 112, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: dark ? "#223328" : "#DCE9DF", justifyContent: "center", gap: spacing.md, marginBottom: spacing.sm },
  lineWide: { width: "72%", height: 13, borderRadius: radius.pill, backgroundColor: dark ? "#34483A" : "#C5D8CA" },
  lineMedium: { width: "62%", height: 11, borderRadius: radius.pill, backgroundColor: dark ? "#2B3A30" : "#DDE8DF" },
  lineShort: { width: "42%", height: 9, borderRadius: radius.pill, backgroundColor: dark ? "#334238" : "#E8EEE9" },
  lineTitle: { width: "44%", height: 15, borderRadius: radius.sm, backgroundColor: dark ? "#2B3A30" : "#DDE8DF", marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: dark ? "#19251D" : colors.surface, borderWidth: 1, borderColor: dark ? "#2B3A30" : colors.border },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: dark ? "#2B3A30" : "#E5EEE7" },
  rowText: { flex: 1, gap: spacing.sm },
});
}
