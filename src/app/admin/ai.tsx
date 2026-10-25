import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

type UsageRow = {
  id: string;
  role: string;
  feature: string;
  prompt_tokens: number;
  output_tokens: number;
  created_at: string;
};

type ReportRow = {
  id: string;
  feature: string;
  excerpt: string;
  reason: string;
  status: string;
  created_at: string;
};

type SettingsState = {
  enabled: boolean;
  studentEnabled: boolean;
  teacherEnabled: boolean;
  model: string;
  embeddingModel: string;
};

const DEFAULT_SETTINGS: SettingsState = {
  enabled: true,
  studentEnabled: true,
  teacherEnabled: true,
  model: "gemini-3.8-flash",
  embeddingModel: "gemini-embedding-2",
};

const FEATURE_LABELS: Record<string, string> = {
  study_buddy: "AI Buddy",
  teacher_generator: "Teacher AI",
  materials_index: "Material indexing",
};

function isMissingTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204"
  ) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export default function AdminAiScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [modelDraft, setModelDraft] = useState(DEFAULT_SETTINGS.model);
  const [embeddingDraft, setEmbeddingDraft] = useState(
    DEFAULT_SETTINGS.embeddingModel,
  );
  const [savingModels, setSavingModels] = useState(false);
  const [busySetting, setBusySetting] = useState<string | null>(null);
  const [busyReport, setBusyReport] = useState<string | null>(null);
  const [adminId, setAdminId] = useState("");

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      setAdminId(user.id);

      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);

      const [usageResult, reportsResult, settingsResult] = await Promise.all([
        supabase
          .from("ai_usage")
          .select("id, role, feature, prompt_tokens, output_tokens, created_at")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("ai_reports")
          .select("id, feature, excerpt, reason, status, created_at")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("app_settings").select("key, value"),
      ]);

      const errors = [
        usageResult.error,
        reportsResult.error,
        settingsResult.error,
      ].filter(Boolean);

      const hardError = errors.find((error) => !isMissingTable(error ?? null));

      if (hardError) {
        throw new Error(hardError.message);
      }

      const missing = errors.some((error) => isMissingTable(error ?? null));
      setSetupMissing(missing);

      setUsage((usageResult.data ?? []) as UsageRow[]);
      setReports((reportsResult.data ?? []) as ReportRow[]);

      if (!settingsResult.error) {
        const values = new Map<string, unknown>();
        for (const row of settingsResult.data ?? []) {
          values.set(String((row as { key: unknown }).key), (row as { value: unknown }).value);
        }

        const next: SettingsState = {
          enabled: asBoolean(values.get("ai_enabled"), DEFAULT_SETTINGS.enabled),
          studentEnabled: asBoolean(
            values.get("ai_student_enabled"),
            DEFAULT_SETTINGS.studentEnabled,
          ),
          teacherEnabled: asBoolean(
            values.get("ai_teacher_enabled"),
            DEFAULT_SETTINGS.teacherEnabled,
          ),
          model:
            typeof values.get("ai_model") === "string" &&
            (values.get("ai_model") as string).trim()
              ? (values.get("ai_model") as string).trim()
              : DEFAULT_SETTINGS.model,
          embeddingModel:
            typeof values.get("ai_embedding_model") === "string" &&
            (values.get("ai_embedding_model") as string).trim()
              ? (values.get("ai_embedding_model") as string).trim()
              : DEFAULT_SETTINGS.embeddingModel,
        };

        setSettings(next);
        setModelDraft(next.model);
        setEmbeddingDraft(next.embeddingModel);
      }

      setLoadError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI settings could not load.";
      console.error("Admin AI load error:", error);

      if (mode === "refresh") {
        showNotice("Refresh Failed", message);
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load("initial");
    };

    void run();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    void load("initial");
  };

  const persistBoolean = async (
    key: "ai_enabled" | "ai_student_enabled" | "ai_teacher_enabled",
    value: boolean,
    stateKey: keyof SettingsState,
  ) => {
    if (busySetting || setupMissing) return;

    const previous = settings;
    setBusySetting(key);
    setSettings((current) => ({ ...current, [stateKey]: value }));

    const { error } = await supabase.from("app_settings").upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: adminId || null,
      },
      { onConflict: "key" },
    );

    setBusySetting(null);

    if (error) {
      setSettings(previous);
      showNotice("Setting Not Saved", error.message);
    }
  };

  const saveModels = async () => {
    if (savingModels || setupMissing) return;

    const model = modelDraft.trim();
    const embeddingModel = embeddingDraft.trim();

    if (!model || !embeddingModel) {
      showNotice(
        "Model Names Required",
        "Enter both a chat model and an embedding model.",
      );
      return;
    }

    setSavingModels(true);

    const now = new Date().toISOString();
    const { error } = await supabase.from("app_settings").upsert(
      [
        { key: "ai_model", value: model, updated_at: now, updated_by: adminId || null },
        {
          key: "ai_embedding_model",
          value: embeddingModel,
          updated_at: now,
          updated_by: adminId || null,
        },
      ],
      { onConflict: "key" },
    );

    setSavingModels(false);

    if (error) {
      showNotice("Models Not Saved", error.message);
      return;
    }

    setSettings((current) => ({ ...current, model, embeddingModel }));
    showNotice("Models Saved", "New AI requests will use these models.");
  };

  const reviewReport = async (
    report: ReportRow,
    status: "reviewed" | "dismissed",
  ) => {
    if (busyReport) return;

    setBusyReport(report.id);

    const { error } = await supabase
      .from("ai_reports")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId || null,
      })
      .eq("id", report.id);

    setBusyReport(null);

    if (error) {
      showNotice("Report Not Updated", error.message);
      return;
    }

    setReports((current) => current.filter((row) => row.id !== report.id));
  };

  const requestCount = usage.length;
  const tokenCount = usage.reduce(
    (total, row) =>
      total +
      (Number.isFinite(row.prompt_tokens) ? row.prompt_tokens : 0) +
      (Number.isFinite(row.output_tokens) ? row.output_tokens : 0),
    0,
  );

  const byFeature = usage.reduce<Record<string, number>>((counts, row) => {
    counts[row.feature] = (counts[row.feature] ?? 0) + 1;
    return counts;
  }, {});

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.centerText}>Loading AI controls...</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <View style={[styles.bigIcon, styles.errorIcon]}>
          <Ionicons name="cloud-offline-outline" size={26} color="#FFFFFF" />
        </View>
        <Text style={styles.centerTitle}>Unable to load AI controls</Text>
        <Text style={styles.centerText}>{loadError}</Text>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={17} color="#FFFFFF" />
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load("refresh");
            }}
            tintColor={GREEN}
            colors={[GREEN]}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>AI Controls</Text>
          <Text style={styles.heroText}>
            Monitor usage, review flagged answers, and control which AI tools
            students and teachers can use. Quotas are enforced on the server
            every day.
          </Text>
        </View>

        {setupMissing ? (
          <View style={styles.setupBox}>
            <Ionicons name="construct-outline" size={18} color="#8A6D1F" />
            <Text style={styles.setupText}>
              Some AI tables are missing. Run supabase/ai_usage.sql,
              supabase/ai_reports.sql, and supabase/ai_settings.sql in the
              Supabase SQL editor.
            </Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="chatbubbles-outline" size={21} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{requestCount}</Text>
            <Text style={styles.statLabel}>Requests today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="analytics-outline" size={21} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{tokenCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Tokens today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="flag-outline" size={21} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{reports.length}</Text>
            <Text style={styles.statLabel}>Open reports</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons
                name={settings.enabled ? "checkmark-circle-outline" : "pause-outline"}
                size={21}
                color={settings.enabled ? GREEN : "#B33A3A"}
              />
            </View>
            <Text
              style={[
                styles.statValue,
                !settings.enabled && styles.statValueOff,
              ]}
            >
              {settings.enabled ? "On" : "Off"}
            </Text>
            <Text style={styles.statLabel}>AI globally</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Access</Text>
          <Text style={styles.cardHint}>
            Turn features off instantly without redeploying. Changes apply to
            the next request.
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>All AI features</Text>
              <Text style={styles.toggleHint}>Master switch for every AI tool</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(value) =>
                void persistBoolean("ai_enabled", value, "enabled")
              }
              disabled={!!busySetting || setupMissing}
              trackColor={{ false: "#CBD5CE", true: "#9BCFB0" }}
              thumbColor={settings.enabled ? GREEN : "#F4F4F4"}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Student AI Buddy</Text>
              <Text style={styles.toggleHint}>
                30 requests per student per day
              </Text>
            </View>
            <Switch
              value={settings.studentEnabled}
              onValueChange={(value) =>
                void persistBoolean(
                  "ai_student_enabled",
                  value,
                  "studentEnabled",
                )
              }
              disabled={!!busySetting || setupMissing || !settings.enabled}
              trackColor={{ false: "#CBD5CE", true: "#9BCFB0" }}
              thumbColor={settings.studentEnabled ? GREEN : "#F4F4F4"}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>Teacher AI tools</Text>
              <Text style={styles.toggleHint}>
                20 requests per teacher per day
              </Text>
            </View>
            <Switch
              value={settings.teacherEnabled}
              onValueChange={(value) =>
                void persistBoolean(
                  "ai_teacher_enabled",
                  value,
                  "teacherEnabled",
                )
              }
              disabled={!!busySetting || setupMissing || !settings.enabled}
              trackColor={{ false: "#CBD5CE", true: "#9BCFB0" }}
              thumbColor={settings.teacherEnabled ? GREEN : "#F4F4F4"}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Models</Text>
          <Text style={styles.cardHint}>
            Use Gemini model ids without a models/ prefix. Save only after the
            new model is available to your API key.
          </Text>

          <Text style={styles.inputLabel}>Chat model</Text>
          <TextInput
            value={modelDraft}
            onChangeText={setModelDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_SETTINGS.model}
            placeholderTextColor="#9AA69E"
            style={styles.input}
            accessibilityLabel="AI chat model"
          />

          <Text style={styles.inputLabel}>Embedding model</Text>
          <TextInput
            value={embeddingDraft}
            onChangeText={setEmbeddingDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_SETTINGS.embeddingModel}
            placeholderTextColor="#9AA69E"
            style={styles.input}
            accessibilityLabel="AI embedding model"
          />

          <Pressable
            onPress={() => void saveModels()}
            disabled={savingModels || setupMissing}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              (savingModels || setupMissing) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {savingModels ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Save models</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today by feature</Text>

          {Object.keys(byFeature).length === 0 ? (
            <Text style={styles.emptyText}>No AI requests recorded today.</Text>
          ) : (
            Object.entries(byFeature).map(([feature, count]) => (
              <View key={feature} style={styles.featureRow}>
                <Text style={styles.featureName}>
                  {FEATURE_LABELS[feature] ?? feature}
                </Text>
                <Text style={styles.featureCount}>{count}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Flagged answers</Text>
            <Text style={styles.cardCount}>{reports.length}</Text>
          </View>

          {reports.length === 0 ? (
            <Text style={styles.emptyText}>
              No open reports. Student reports will appear here for review.
            </Text>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.reportCard}>
                <View style={styles.reportTop}>
                  <Text style={styles.reportMeta}>
                    {FEATURE_LABELS[report.feature] ?? report.feature} ·{" "}
                    {report.reason} · {formatDate(report.created_at)}
                  </Text>
                </View>

                <Text style={styles.reportExcerpt} numberOfLines={4}>
                  {report.excerpt}
                </Text>

                <View style={styles.reportActions}>
                  <Pressable
                    onPress={() => void reviewReport(report, "reviewed")}
                    disabled={busyReport === report.id}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.smallButton,
                      pressed && styles.pressed,
                      busyReport === report.id && styles.disabled,
                    ]}
                  >
                    <Ionicons name="checkmark" size={14} color={GREEN} />
                    <Text style={styles.smallButtonText}>Reviewed</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void reviewReport(report, "dismissed")}
                    disabled={busyReport === report.id}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.smallButton,
                      styles.dismissButton,
                      pressed && styles.pressed,
                      busyReport === report.id && styles.disabled,
                    ]}
                  >
                    <Ionicons name="close" size={14} color="#6B7C71" />
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={18} color={GREEN} />
          <Text style={styles.noticeText}>
            Prompts and answers are never stored in the usage log. Only token
            counts and feature names are recorded, and reports contain only the
            excerpt a student chose to flag.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  center: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    color: "#65776B",
    textAlign: "center",
    lineHeight: 19,
  },
  centerTitle: { fontSize: 18, fontWeight: "800", color: DARK_GREEN },
  bigIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  errorIcon: { backgroundColor: "#B33A3A" },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 20,
    minHeight: 46,
    marginTop: 6,
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
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
  setupBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#FBF3DA",
    borderRadius: 15,
    padding: 14,
  },
  setupText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#8A6D1F" },
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
  statValue: { fontSize: 26, fontWeight: "800", color: DARK_GREEN },
  statValueOff: { color: "#B33A3A" },
  statLabel: {
    fontSize: 12,
    color: "#65776B",
    fontWeight: "600",
    marginTop: 5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 18,
    gap: 10,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: DARK_GREEN },
  cardCount: {
    fontSize: 12,
    fontWeight: "800",
    color: GREEN,
    backgroundColor: "#E8F3EB",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  cardHint: { fontSize: 12, lineHeight: 18, color: "#758479" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 14, fontWeight: "700", color: "#20392B" },
  toggleHint: { fontSize: 11, color: "#7A897F", marginTop: 3 },
  divider: { height: 1, backgroundColor: "#EDF2EE", marginVertical: 4 },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6B7F72",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#DDE7E0",
    backgroundColor: "#F7FAF8",
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 14,
    color: "#20392B",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: GREEN,
    marginTop: 4,
  },
  primaryButtonText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  emptyText: { fontSize: 12, color: "#7A897F", lineHeight: 18 },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  featureName: { fontSize: 13, color: "#3F5A49", fontWeight: "600" },
  featureCount: { fontSize: 13, fontWeight: "800", color: GREEN },
  reportCard: {
    backgroundColor: "#F7FAF8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EBE5",
    padding: 13,
    gap: 8,
    marginTop: 2,
  },
  reportTop: { flexDirection: "row", alignItems: "center" },
  reportMeta: { fontSize: 10, fontWeight: "700", color: "#7A897F" },
  reportExcerpt: { fontSize: 12, lineHeight: 18, color: "#30483A" },
  reportActions: { flexDirection: "row", gap: 8 },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F3EB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallButtonText: { fontSize: 11, fontWeight: "800", color: GREEN },
  dismissButton: { backgroundColor: "#EEF1EF" },
  dismissText: { fontSize: 11, fontWeight: "800", color: "#6B7C71" },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#E8F3EB",
    borderRadius: 15,
    padding: 15,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#3F5A49" },
});
