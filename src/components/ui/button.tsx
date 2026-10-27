import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { colors, radius, spacing, text } from "@/theme/tokens";
import { ReactNode } from "react";
import {
  ColorValue,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Replace the label with a progress bar while an action is running. */
  loading?: boolean;
  left?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
};

// Plain data (not a StyleSheet) so the progress colour stays a ColorValue.
const variants: Record<
  Variant,
  { container: ViewStyle; labelColor: ColorValue; progressColor: ColorValue }
> = {
  primary: {
    container: { backgroundColor: colors.primary },
    labelColor: "#FFFFFF",
    progressColor: "#FFFFFF",
  },
  secondary: {
    container: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    labelColor: colors.primary,
    progressColor: colors.primary,
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    labelColor: colors.primary,
    progressColor: colors.primary,
  },
  danger: {
    container: { backgroundColor: colors.danger },
    labelColor: "#FFFFFF",
    progressColor: "#FFFFFF",
  },
};

/** Primary call-to-action button with consistent size and press feedback. */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  left,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const v = variants[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        v.container,
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ProgressIndicator
          size="sm"
          color={v.progressColor}
          accessibilityLabel={`${label} in progress`}
        />
      ) : (
        <>
          {left}
          <Text style={[styles.label, { color: v.labelColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  label: {
    fontSize: text.body.fontSize,
    fontWeight: "800",
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
