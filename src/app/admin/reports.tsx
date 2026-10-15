import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

type Stat = { label: string; value: number; icon: keyof typeof Ionicons.glyphMap };

export default function AdminReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [
          { count: total },
          { count: pending },
          { count: students },
          { count: teachers },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .or("(role.neq.admin,role.is.null)")
            .or("(requested_role.neq.admin,requested_role.is.null)"),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("approval_status", "pending")
            .or("(role.neq.admin,role.is.null)")
            .or("(requested_role.neq.admin,requested_role.is.null)"),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("role", "student"),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("role", "teacher"),
        ]);

        if (!active) return;

        setStats([
          { label: "Total accounts", value: total ?? 0, icon: "people-outline" },
          { label: "Pending review", value: pending ?? 0, icon: "time-outline" },
          { label: "Students", value: students ?? 0, icon: "school-outline" },
          { label: "Teachers", value: teachers ?? 0, icon: "easel-outline" },
        ]);
      } catch (error) {
        console.error("Reports error:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="bar-chart" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Reports</Text>
          <Text style={styles.heroText}>
            A quick snapshot of the StudyMate AI learning community.
          </Text>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.centerText}>Gathering statistics...</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Ionicons name={stat.icon} size={22} color={GREEN} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={GREEN} />
          <Text style={styles.noticeText}>
            Detailed charts and exportable reports will be available in a future
            update.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  hero: { backgroundColor: GREEN, borderRadius: 24, padding: 24 },
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
  centerBox: { alignItems: "center", paddingVertical: 50, gap: 10 },
  centerText: { fontSize: 13, color: "#758479" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  statValue: { fontSize: 28, fontWeight: "800", color: DARK_GREEN },
  statLabel: {
    fontSize: 12,
    color: "#65776B",
    fontWeight: "600",
    marginTop: 5,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E8F3EB",
    borderRadius: 15,
    padding: 15,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#3F5A49" },
});
