import { useRequireRole } from "@/hooks/useRequireRole";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useEffect } from "react";
import { colors } from "@/theme/tokens";

const GREEN = colors.primary;
const BG = colors.background;

export default function PracticeGenerateScreen() {
  const guardState = useRequireRole("student");

  useEffect(() => {
    if (guardState === "allowed") {
      router.replace("/student/practice-select-material" as never);
    }
  }, [guardState]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator color={GREEN} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
