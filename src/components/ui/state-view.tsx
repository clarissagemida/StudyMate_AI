import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/theme/tokens";
import { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type StateViewProps = {
  /** "loading" shows a spinner; "error"/"empty" show an icon badge. */
  variant: "loading" | "error" | "empty";
  title?: string;
  message?: string;
  icon?: IoniconName;
  /** Optional retry button (used by error + empty states). */
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
};

/**
 * Centered full-screen state used while a screen has no content to show:
 * loading, a load failure, or an empty list. Keeps every screen's
 * "nothing here" moment visually identical.
 */
export function StateView({
  variant,
  title,
  message,
  icon,
  onRetry,
  retryLabel = "Try Again",
  children,
}: StateViewProps) {
  if (variant === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {children}
      </View>
    );
  }

  const isError = variant === "error";

  return (
    <View style={styles.center}>
      <View style={[styles.badge, isError ? styles.errorBadge : styles.emptyBadge]}>
        <Ionicons
          name={icon ?? (isError ? "cloud-offline-outline" : "folder-open-outline")}
          size={28}
          color={isError ? "#FFFFFF" : colors.primary}
        />
      </View>

      {title ? <Text style={styles.title}>{title}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {children}

      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxxl,
    gap: spacing.md,
  },
  badge: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBadge: { backgroundColor: colors.primarySoft },
  errorBadge: { backgroundColor: colors.dangerIconBg },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: "center",
  },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 22,
    minHeight: 48,
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.85 },
});
