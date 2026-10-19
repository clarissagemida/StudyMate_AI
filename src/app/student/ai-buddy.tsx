import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const BG = "#F4F8F5";

export default function StudentAiBuddyScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Buddy</Text>
        <Text style={styles.headerSubtitle}>Your study companion</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="sparkles-outline" size={30} color={GREEN} />
          </View>

          <Text style={styles.title}>AI Buddy is not connected yet</Text>

          <Text style={styles.text}>
            This version of StudyMate has no AI integration. There is no chat,
            no tutor, and no model running — so there is nothing to wait for on
            this screen. A real assistant will be announced in a future update.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#758479" />
          <Text style={styles.infoText}>
            We will only enable an assistant once it is wired to a real,
            privacy-reviewed service.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: DARK_GREEN },
  headerSubtitle: { fontSize: 12, color: "#718078", marginTop: 4 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: DARK_GREEN,
    textAlign: "center",
  },
  text: {
    fontSize: 13,
    lineHeight: 20,
    color: "#758479",
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 8,
  },
  infoText: { flex: 1, fontSize: 11, color: "#758479", lineHeight: 16 },
});
