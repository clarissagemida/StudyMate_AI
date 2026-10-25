import { ActionCard } from "@/components/ui/action-card";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { colors, radius, spacing } from "@/theme/tokens";
import { AI_ENABLED } from "@/utils/aiFlags";
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

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDeep;
const BACKGROUND = colors.background;
const MUTED = colors.textMuted;

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
            <Text style={styles.welcome}>Hello, Student!</Text>
            <Text style={styles.subtitle}>
              Ready to learn something new today?
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => openScreen("/student/profile")}
            accessibilityLabel="Open profile"
          >
            <Ionicons name="person-outline" size={24} color={GREEN} />
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
              <Ionicons name="book-outline" size={28} color="#FFFFFF" />
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
        <SectionHeader title="What would you like to do?" />

        <View style={styles.actionGrid}>
          <View style={styles.gridCell}>
            <ActionCard
              icon="book-outline"
              title="Start Studying"
              description="Review your lessons"
              onPress={() => openScreen("/student/study")}
            />
          </View>

          {AI_ENABLED ? (
            <View style={styles.gridCell}>
              <ActionCard
                icon="chatbubbles-outline"
                iconColor="#6953B8"
                iconBg="#E9E6FA"
                title="AI Buddy"
                description="Ask study questions"
                onPress={() => openScreen("/student/ai-buddy")}
              />
            </View>
          ) : null}

          <View style={styles.gridCell}>
            <ActionCard
              icon="clipboard-outline"
              iconColor="#B87519"
              iconBg="#FFF0DA"
              title="Take a Quiz"
              description="Test your knowledge"
              onPress={() => openScreen("/student/quizzes")}
            />
          </View>

          <View style={styles.gridCell}>
            <ActionCard
              icon="stats-chart-outline"
              iconColor="#267B83"
              iconBg="#DFF1F3"
              title="My Progress"
              description="Track your learning"
              onPress={() => openScreen("/student/profile")}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <SectionHeader
          title="Recent Activity"
          actionLabel="View"
          onAction={() => openScreen("/student/quizzes")}
        />

        <Card style={styles.activityCard}>
          <View style={styles.activityIcon}>
            <Ionicons name="document-text-outline" size={24} color={GREEN} />
          </View>

          <View style={styles.activityText}>
            <Text style={styles.activityTitle}>Your quiz history</Text>
            <Text style={styles.activityDescription}>
              Your completed quizzes and scores will appear here.
            </Text>
          </View>
        </Card>

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

        <Text style={styles.footer}>Learn smarter with StudyMate AI</Text>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xxl,
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
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoftAlt,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  goalCard: {
    backgroundColor: GREEN,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
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
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  progressTrack: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 22,
    overflow: "hidden",
  },
  progressFill: {
    width: "33.33%",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
  },
  goalProgress: {
    color: "#E2F1E6",
    fontSize: 11,
    marginTop: 9,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },
  gridCell: {
    width: "48%",
    marginBottom: spacing.md,
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoftAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
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
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  tipHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  tipTitle: {
    color: DARK_GREEN,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: spacing.sm,
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
    marginTop: spacing.xxl,
  },
});
