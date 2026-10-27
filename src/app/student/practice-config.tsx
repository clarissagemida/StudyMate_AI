import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { ScreenTitle } from "@/components/ui/section-header";
import { useRequireRole } from "@/hooks/useRequireRole";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { showNotice } from "@/utils/notify";
import type { PracticeConfig, PracticeDifficulty, PracticeQuestionType } from "@/utils/studentPractice";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDeep;
const BG = colors.background;

type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  description: string | null;
};

export default function PracticeConfigScreen() {
  const guardState = useRequireRole("student");
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const [material, setMaterial] = useState<MaterialRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>("medium");
  const [qcount, setQcount] = useState<5 | 10 | 15 | 20>(10);
  const [qtype, setQtype] = useState<PracticeQuestionType>("multiple_choice");

  const load = useCallback(async () => {
    if (!materialId) {
      showNotice("Error", "No material selected");
      router.replace("/student/practice-select-material" as any);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select("id,title,subject,topic,description")
        .eq("id", materialId)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        showNotice("Error", "Material not found or not published");
        router.replace("/student/practice-select-material" as never);
        return;
      }
      setMaterial(data as MaterialRow);
    } catch (e: any) {
      showNotice("Error", e.message || "Failed to load material");
      router.replace("/student/practice-select-material" as never);
    } finally {
      setLoading(false);
    }
  }, [materialId]);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (guardState === "allowed" && !loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  }, [guardState, load]);

  const goNext = () => {
    if (!material) return;
    const config: PracticeConfig = {
      materialId: material.id,
      materialTitle: material.title,
      difficulty,
      questionCount: qcount,
      questionType: qtype,
    };
    router.push({
      pathname: "/student/practice-take",
      params: { config: JSON.stringify(config) },
    } as never);
  };

  if (guardState === "checking" || guardState === "denied") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={GREEN} />
          </Pressable>
          <ScreenTitle title="Configure Quiz" subtitle="Set difficulty, count, and type" />
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} />
          <Text style={styles.loadingText}>Loading material...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={GREEN} />
        </Pressable>
        <ScreenTitle title="Configure Quiz" subtitle="Set difficulty, count, and type" />
        <View style={{ width: 36 }} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <Card style={styles.materialCard}>
          <View style={styles.cardTop}>
            <View style={styles.cardIcon}>
              <Ionicons name="document-text-outline" size={22} color={GREEN} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {material?.title}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {[material?.subject, material?.topic].filter(Boolean).join(" • ") || "General"}
              </Text>
            </View>
          </View>
          {material?.description ? (
            <Text style={styles.cardDescription} numberOfLines={3}>
              {material.description}
            </Text>
          ) : null}
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Difficulty</Text>
          <View style={styles.row}>
            {(["easy", "medium", "hard"] as PracticeDifficulty[]).map((d) => (
              <Pressable
                key={d}
                onPress={() => setDifficulty(d)}
                style={[styles.pill, difficulty === d && styles.pillActive]}
              >
                <Text style={[styles.pillText, difficulty === d && styles.pillTextActive]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Questions</Text>
          <View style={styles.row}>
            {([5, 10, 15, 20] as const).map((n) => (
              <Pressable
                key={n}
                onPress={() => setQcount(n)}
                style={[styles.pill, qcount === n && styles.pillActive]}
              >
                <Text style={[styles.pillText, qcount === n && styles.pillTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Question Type</Text>
          <View style={styles.rowWrap}>
            {(
              [
                { key: "multiple_choice", label: "Multiple Choice" },
                { key: "true_false", label: "True / False" },
                { key: "mixed", label: "Mixed" },
              ] as { key: PracticeQuestionType; label: string }[]
            ).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setQtype(t.key)}
                style={[styles.pill, qtype === t.key && styles.pillActive]}
              >
                <Text style={[styles.pillText, qtype === t.key && styles.pillTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={goNext} style={styles.cta}>
          <Text style={styles.ctaText}>Generate Practice Quiz</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  materialCard: {
    padding: spacing.lg,
    gap: spacing.sm + 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  cardDescription: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: DARK_GREEN },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  pillTextActive: { color: "#FFFFFF" },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: GREEN,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
