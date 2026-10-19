import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const BG = "#F4F8F5";

export default function StudentQuizzesScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Quizzes</Text>
        <Text style={styles.headerSubtitle}>Test what you have learned</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="help-circle-outline" size={30} color={GREEN} />
          </View>

          <Text style={styles.title}>No quizzes yet</Text>

          <Text style={styles.text}>
            Quizzes will appear here when they become available. This build of
            StudyMate does not generate or serve quiz questions yet — nothing is
            being loaded in the background.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={16} color="#758479" />
          <Text style={styles.infoText}>
            Quiz creation is part of a future AI Quiz Studio release.
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
  title: { fontSize: 17, fontWeight: "800", color: DARK_GREEN },
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
