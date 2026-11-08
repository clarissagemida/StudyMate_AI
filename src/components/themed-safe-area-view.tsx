import { colors } from "@/theme/tokens";
import { SafeAreaView, type SafeAreaViewProps } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";

/** Applies the active app surface while preserving each screen's safe-area edges. */
export function ThemedSafeAreaView({ style, ...props }: SafeAreaViewProps) {
  const dark = useColorScheme() === "dark";
  return <SafeAreaView {...props} style={[style, { backgroundColor: dark ? "#101A14" : colors.background }]} />;
}
