import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, text } from "@/theme/tokens";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type SectionHeaderProps = {
  title: string;
  /** Optional trailing link (e.g. "See all"). */
  actionLabel?: string;
  onAction?: () => void;
  style?: object;
};

/** Consistent section title row with an optional right-aligned action. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

type ScreenTitleProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

/** Large screen title block used at the top of list/detail screens. */
export function ScreenTitle({ title, subtitle, right }: ScreenTitleProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: text.heading.fontSize,
    fontWeight: text.heading.fontWeight,
    color: colors.textStrong,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: text.display.fontSize,
    fontWeight: "800",
    color: colors.primaryDeep,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
