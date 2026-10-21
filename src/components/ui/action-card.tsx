import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, text } from "@/theme/tokens";
import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type ActionCardProps = {
  icon: IoniconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  description?: string;
  onPress: () => void;
  /** Show the trailing arrow affordance. */
  showArrow?: boolean;
  accessibilityLabel?: string;
};

/**
 * Tappable action tile with a tinted icon, title, and description. Used on
 * dashboards. Gives light press feedback (opacity + subtle scale).
 */
export function ActionCard({
  icon,
  iconColor = colors.primary,
  iconBg = colors.primarySoft,
  title,
  description,
  onPress,
  showArrow = true,
  accessibilityLabel,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {description ? (
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      ) : null}

      {showArrow ? (
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={17} color={colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 150,
    justifyContent: "flex-start",
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: text.cardTitle.fontSize,
    fontWeight: text.cardTitle.fontWeight,
    color: colors.textStrong,
  },
  description: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: spacing.xs + 1,
    flex: 1,
  },
  arrow: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
});
