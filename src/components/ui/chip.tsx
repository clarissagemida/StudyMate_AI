import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, text } from "@/theme/tokens";
import { ComponentProps } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const toneStyles: Record<
  Tone,
  { bg: string; fg: string }
> = {
  neutral: { bg: "#EEF4EF", fg: "#4C5E52" },
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  brand: { bg: colors.primarySoft, fg: colors.primary },
};

/** Small rounded label. Used for difficulty, question counts, status, etc. */
export function Chip({
  label,
  tone = "neutral",
  icon,
  style,
}: {
  label: string;
  tone?: Tone;
  icon?: IoniconName;
  style?: ViewStyle | ViewStyle[];
}) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Slightly larger standalone status pill (Published / Draft / Approved). */
export function StatusPill({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: IoniconName;
}) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs,
  },
  chipText: { fontSize: 11, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: text.caption.fontSize,
    fontWeight: "800",
  },
});
