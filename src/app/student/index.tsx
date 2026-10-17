import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const BACKGROUND = "#F4F8F5";
const MUTED = "#718078";

export default function StudentHomeScreen() {
  const openScreen = (path: string) => {
    router.push(path as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BACKGROUND} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text style={styles.eyebrow}>STUDYMATE AI</Text>
            <Text style={styles.welcome}>Hello, Student! 👋</Text>
            <Text style={styles.subtitle}>
              Ready to learn something new today?
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => openScreen("/student/profile")}
            accessibilityLabel="Open profile"
          >
            <Ionicons name="person-outline" size={25} color={GREEN} />
          </TouchableOpacity>
        </View>

        {/* Study Goal */}
        <View style={styles.goalCard}>
          <View style={styles.goalTop}>
            <View style={styles.goalText}>
              <Text style={styles.goalLabel}>YOUR DAILY STUDY GOAL</Text>
              <Text style={styles.goalTitle}>15 minutes a day</Text>
              <Text style={styles.goalSubtitle}>
                Keep learning, one step at a time.
              </Text>
            </View>

            <View style={styles.goalIcon}>
              <Ionicons name="book-outline" size={30} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Text style={styles.goalProgress}>
            Example progress · 5 of 15 minutes
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>What would you like to do?</Text>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openScreen("/student/study")}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E2F2E8" }]}>
              <Ionicons name="book-outline" size={25} color={GREEN} />
            </View>
            <Text style={styles.actionTitle}>Start Studying</Text>
            <Text style={styles.actionDescription}>Review your lessons</Text>
            <Ionicons name="arrow-forward" size={18} color={GREEN} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openScreen("/student/ai-buddy")}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E9E6FA" }]}>
              <Ionicons name="chatbubbles-outline" size={25} color="#6953B8" />
            </View>
            <Text style={styles.actionTitle}>AI Buddy</Text>
            <Text style={styles.actionDescription}>Ask study questions</Text>
            <Ionicons name="arrow-forward" size={18} color={GREEN} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openScreen("/student/quizzes")}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FFF0DA" }]}>
              <Ionicons name="clipboard-outline" size={25} color="#B87519" />
            </View>
            <Text style={styles.actionTitle}>Take a Quiz</Text>
            <Text style={styles.actionDescription}>Test your knowledge</Text>
            <Ionicons name="arrow-forward" size={18} color={GREEN} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => openScreen("/student/profile")}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#DFF1F3" }]}>
              <Ionicons name="stats-chart-outline" size={25} color="#267B83" />
            </View>
            <Text style={styles.actionTitle}>My Progress</Text>
            <Text style={styles.actionDescription}>Track your learning</Text>
            <Ionicons name="arrow-forward" size={18} color={GREEN} />
          </TouchableOpacity>
        </View>

        {/* Recent Activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Ionicons name="time-outline" size={21} color={GREEN} />
        </View>

        <View style={styles.activityCard}>
          <View style={styles.activityIcon}>
            <Ionicons name="document-text-outline" size={24} color={GREEN} />
          </View>

          <View style={styles.activityText}>
            <Text style={styles.activityTitle}>Your quiz history</Text>
            <Text style={styles.activityDescription}>
              Your completed quizzes and scores will appear here.
            </Text>
          </View>
        </View>

        {/* Study Tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeading}>
            <Ionicons name="bulb-outline" size={22} color={GREEN} />
            <Text style={styles.tipTitle}>Study Tip</Text>
          </View>
          <Text style={styles.tipDescription}>
            Study in short sessions, take breaks, and test yourself to help
            remember what you learn.
          </Text>
        </View>

        <Text style={styles.footer}>Learn smarter with StudyMate AI 💚</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  greeting: {
    flex: 1,
  },
  eyebrow: {
    color: GREEN,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 7,
  },
  welcome: {
    color: DARK_GREEN,
    fontSize: 25,
    fontWeight: "800",
  },
  subtitle: {
    color: MUTED,
    fontSize: 13,
    marginTop: 6,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#E2F0E6",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  goalCard: {
    backgroundColor: GREEN,
    borderRadius: 23,
    padding: 20,
    marginBottom: 28,
  },
  goalTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalText: {
    flex: 1,
  },
  goalLabel: {
    color: "#D6EBDD",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  goalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 9,
  },
  goalSubtitle: {
    color: "#E2F1E6",
    fontSize: 12,
    marginTop: 7,
  },
  goalIcon: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: "#FFFFFF25",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  progressTrack: {
    height: 7,
    borderRadius: 10,
    backgroundColor: "#FFFFFF40",
    marginTop: 22,
    overflow: "hidden",
  },
  progressFill: {
    width: "33.33%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  goalProgress: {
    color: "#E2F1E6",
    fontSize: 11,
    marginTop: 9,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: DARK_GREEN,
    fontSize: 17,
    fontWeight: "800",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  actionCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    padding: 15,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#E9F0EB",
    minHeight: 174,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  actionTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "800",
  },
  actionDescription: {
    color: MUTED,
    fontSize: 11,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 16,
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9F0EB",
    marginBottom: 20,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#E2F2E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "700",
  },
  activityDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  tipCard: {
    backgroundColor: "#E7F2E9",
    borderRadius: 18,
    padding: 17,
  },
  tipHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  tipTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 8,
  },
  tipDescription: {
    color: "#526C5B",
    fontSize: 12,
    lineHeight: 19,
  },
  footer: {
    textAlign: "center",
    color: MUTED,
    fontSize: 11,
    marginTop: 24,
  },
});
