import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

export default function AdminMaterialsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="book" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Learning Materials</Text>
          <Text style={styles.heroText}>
            Organize and publish the study resources available to students and
            teachers across StudyMate AI.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name="cloud-upload-outline" size={24} color={GREEN} />
          </View>
          <Text style={styles.cardTitle}>Upload materials</Text>
          <Text style={styles.cardText}>
            Materials you upload will appear in the student learning hub.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name="folder-open-outline" size={24} color={GREEN} />
          </View>
          <Text style={styles.cardTitle}>Browse library</Text>
          <Text style={styles.cardText}>
            Review existing materials, organised by subject and grade level.
          </Text>
        </View>

        <View style={styles.notice}>
          <Ionicons name="construct-outline" size={18} color={GREEN} />
          <Text style={styles.noticeText}>
            Material management tools are coming soon. This space is ready for the
            next update.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  hero: {
    backgroundColor: GREEN,
    borderRadius: 24,
    padding: 24,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  heroTitle: { fontSize: 23, fontWeight: "800", color: "#FFFFFF" },
  heroText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#E0F0E5",
    marginTop: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: DARK_GREEN },
  cardText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#758479",
    marginTop: 6,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E8F3EB",
    borderRadius: 15,
    padding: 15,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#3F5A49",
  },
});
