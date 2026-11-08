import { colors, radius, shadow, spacing } from "@/theme/tokens";
import { ReactNode } from "react";
import { StyleSheet, useColorScheme, View, ViewStyle } from "react-native";

type CardProps = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
  /** Slightly stronger elevation for emphasis cards. */
  raised?: boolean;
};

/**
 * Surface container used for nearly every content block. White, softly
 * rounded, hairline border, and a very light shadow so it reads as "lifted"
 * without looking heavy.
 */
export function Card({ children, style, padded = true, raised }: CardProps) {
  const dark = useColorScheme() === "dark";
  return (
    <View
      style={[
        styles.card,
        dark && styles.cardDark,
        raised && shadow.raised,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
  cardDark: { backgroundColor: "#19241C", borderColor: "#2C3A30", shadowColor: "#000000" },
});
