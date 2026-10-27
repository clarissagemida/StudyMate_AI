import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ScreenTitle } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { useRequireRole } from "@/hooks/useRequireRole";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDeep;
const BG = colors.background;

type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  description: string | null;
  file_name: string | null;
  file_mime: string | null;
  teacher_id: string | null;
};

type TeacherProfile = {
  id: string;
  full_name: string | null;
};

function isMissingRelation(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function fileTypeLabel(fileName: string | null, fileMime: string | null) {
  if (fileMime) {
    if (fileMime.includes("pdf")) return "PDF";
    if (fileMime.includes("word") || fileMime.includes("document")) return "DOCX";
    if (fileMime.includes("presentation") || fileMime.includes("powerpoint")) return "PPTX";
  }
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf")) return "PDF";
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "DOCX";
    if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "PPTX";
  }
  return "TEXT";
}

export default function PracticeSelectMaterialScreen() {
  const guardState = useRequireRole("student");
  const [items, setItems] = useState<MaterialRow[] | null>(null);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("materials")
        .select("id,title,subject,topic,description,file_name,file_mime,teacher_id")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (isMissingRelation(error)) {
        setItems([]);
        setTeachers({});
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as MaterialRow[];
      setItems(rows);

      const teacherIds = Array.from(
        new Set(rows.map((r) => r.teacher_id).filter((id): id is string => !!id)),
      );

      if (teacherIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", teacherIds);

        const map: Record<string, string> = {};
        for (const p of (profileRows ?? []) as TeacherProfile[]) {
          if (p.full_name && p.full_name.trim()) {
            map[p.id] = p.full_name.trim();
          }
        }
        setTeachers(map);
      } else {
        setTeachers({});
      }
    } catch (e: any) {
      setLoadError(e.message || "Failed to load materials");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (guardState === "allowed" && !loadedRef.current) {
      loadedRef.current = true;
      void loadData();
    }
  }, [guardState, loadData]);

  const visible = useMemo(() => {
    if (!items) return [];
    const t = search.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      [i.title, i.subject, i.topic, i.description].some((v) =>
        (v || "").toLowerCase().includes(t),
      ),
    );
  }, [items, search]);

  if (guardState === "checking" || guardState === "denied") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} />
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
        <ScreenTitle title="Select Material" subtitle="Pick a published material to generate practice from" />
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by title, subject, or topic"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} />
          <Text style={styles.loadingText}>Loading materials...</Text>
        </View>
      ) : loadError ? (
        <StateView
          variant="error"
          icon="alert-circle-outline"
          title="Something went wrong"
          message={loadError}
          onRetry={loadData}
          retryLabel="Try again"
        />
      ) : visible.length === 0 ? (
        <StateView
          variant="empty"
          icon="book-outline"
          title={items && items.length > 0 ? "No matches" : "No published materials"}
          message={
            items && items.length > 0
              ? "Try a different search term."
              : "There are no published materials available for practice yet."
          }
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const teacherName = item.teacher_id ? teachers[item.teacher_id] : null;
            const fType = fileTypeLabel(item.file_name, item.file_mime);
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/student/practice-config",
                    params: { materialId: item.id },
                  } as never)
                }
              >
                <Card style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="document-text-outline" size={22} color={GREEN} />
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {[item.subject, item.topic].filter(Boolean).join(" • ") || "General"}
                        {teacherName ? ` • ${teacherName}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                  {item.description ? (
                    <Text style={styles.cardDescription} numberOfLines={3}>
                      {item.description}
                    </Text>
                  ) : null}
                  <View style={styles.chipRow}>
                    <Chip label={fType} />
                    <Chip label="Published" tone="success" />
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
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
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 1,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: colors.textPrimary,
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
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.md,
  },
  card: {
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
