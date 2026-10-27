import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";

type MaterialStatus = "draft" | "published";

type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  description: string;
  status: MaterialStatus;
  teacher_id: string;
  teacher_name: string;
  created_at: string;
  updated_at: string;
};

type FilterValue = "all" | MaterialStatus;

type LoadMode = "initial" | "refresh";

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Published", value: "published" },
];

// PostgREST reports a table that has not been created yet with these codes.
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminMaterialsScreen() {
  const [items, setItems] = useState<MaterialRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");

  const loadMaterials = useCallback(async (mode: LoadMode) => {
    if (mode === "refresh") setRefreshing(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      // Confirm the caller is still an approved administrator before showing
      // oversight data. RLS already enforces this; this keeps messaging clear.
      const { data: adminProfile, error: roleError } = await supabase
        .from("profiles")
        .select("role, approval_status")
        .eq("id", user.id)
        .maybeSingle();

      if (roleError) throw new Error(roleError.message);

      if (
        adminProfile?.role !== "admin" ||
        adminProfile.approval_status !== "approved"
      ) {
        showNotice(
          "Access Denied",
          "Only approved administrators can view all learning materials.",
        );
        router.replace("/admin/home");
        return;
      }

      const { data, error } = await supabase
        .from("materials")
        .select(
          "id, title, subject, topic, description, status, teacher_id, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (isMissingRelation(error)) {
        setTableMissing(true);
        setItems([]);
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      setTableMissing(false);

      const rows = (data ?? []) as Omit<MaterialRow, "teacher_name">[];

      // Resolve teacher display names once for the whole list. Admins are
      // allowed to read every profile row, so a single query is enough.
      const teacherIds = Array.from(
        new Set(rows.map((row) => row.teacher_id).filter(Boolean)),
      );

      let nameMap: Record<string, string> = {};

      if (teacherIds.length > 0) {
        const { data: teachers, error: teacherError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", teacherIds);

        if (teacherError) {
          // Not fatal: the list still renders with a fallback label.
          console.warn("Could not load teacher names:", teacherError.message);
        } else {
          nameMap = Object.fromEntries(
            (teachers ?? []).map((teacher) => [
              teacher.id,
              teacher.full_name?.trim() || "Unnamed teacher",
            ]),
          );
        }
      }

      setItems(
        rows.map((row) => ({
          ...row,
          teacher_name: nameMap[row.teacher_id] ?? "Unknown teacher",
        })),
      );
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Admin materials error:", err);

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
      await loadMaterials("initial");
    };

    void run();
  }, [loadMaterials]);

  const visibleItems = useMemo(() => {
    if (!items) return [];

    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch =
        !term ||
        [item.title, item.subject, item.topic, item.description, item.teacher_name].some(
          (value) => (value ?? "").toLowerCase().includes(term),
        );

      return matchesFilter && matchesSearch;
    });
  }, [items, search, filter]);

  const counts = useMemo(() => {
    const list = items ?? [];
    return {
      all: list.length,
      draft: list.filter((item) => item.status === "draft").length,
      published: list.filter((item) => item.status === "published").length,
    };
  }, [items]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    void loadMaterials("initial");
  };

  if (loading && items === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ProgressIndicator
          size="lg"
          color={GREEN}
          accessibilityLabel="Loading learning materials"
        />
        <Text style={styles.centerText}>Loading learning materials...</Text>
      </SafeAreaView>
    );
  }

  if (loadError && items === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <View style={[styles.bigIcon, styles.errorIcon]}>
          <Ionicons name="cloud-offline-outline" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.centerTitle}>Unable to load materials</Text>
        <Text style={styles.centerText}>{loadError}</Text>

        <Pressable
          onPress={handleRetry}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      {refreshing ? (
        <ProgressIndicator
          style={styles.refreshProgress}
          accessibilityLabel="Refreshing learning materials"
        />
      ) : null}
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadMaterials("refresh");
            }}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="book" size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.heroTitle}>Learning Materials</Text>
              <Text style={styles.heroText}>
                Oversight view of every material teachers have created across
                StudyMate AI. Read-only.
              </Text>

              {!tableMissing && (
                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{counts.all}</Text>
                    <Text style={styles.heroStatLabel}>Total</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{counts.published}</Text>
                    <Text style={styles.heroStatLabel}>Published</Text>
                  </View>
                  <View style={styles.heroStatDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{counts.draft}</Text>
                    <Text style={styles.heroStatLabel}>Drafts</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={19} color="#718078" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search title, subject, or teacher"
                placeholderTextColor="#9AA69E"
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search learning materials"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color="#9AA69E" />
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((option) => {
                const active = filter === option.value;
                const count = counts[option.value];

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setFilter(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.filterChip,
                      active && styles.filterChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {option.label}
                      {tableMissing ? "" : ` (${count})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.bigIcon}>
              <Ionicons name="book-outline" size={26} color={GREEN} />
            </View>

            <Text style={styles.emptyTitle}>
              {tableMissing
                ? "Learning materials are not available yet"
                : search.trim() || filter !== "all"
                  ? "No matching materials"
                  : "No materials have been created yet"}
            </Text>

            <Text style={styles.emptyText}>
              {tableMissing
                ? "Run supabase/materials.sql in the Supabase SQL editor to activate the study library."
                : search.trim() || filter !== "all"
                  ? "Try a different search term or filter."
                  : "Teacher materials will appear here once teachers start creating them."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const published = item.status === "published";

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color={GREEN}
                  />
                </View>

                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.subject}
                    {item.topic ? ` · ${item.topic}` : ""}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    published ? styles.pillPublished : styles.pillDraft,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      published
                        ? styles.pillTextPublished
                        : styles.pillTextDraft,
                    ]}
                  >
                    {published ? "Published" : "Draft"}
                  </Text>
                </View>
              </View>

              {item.description ? (
                <Text style={styles.cardDescription} numberOfLines={3}>
                  {item.description}
                </Text>
              ) : null}

              <View style={styles.cardFooter}>
                <View style={styles.footerItem}>
                  <Ionicons name="person-outline" size={14} color="#65776B" />
                  <Text style={styles.footerText} numberOfLines={1}>
                    {item.teacher_name}
                  </Text>
                </View>

                <View style={styles.footerItem}>
                  <Ionicons name="calendar-outline" size={14} color="#65776B" />
                  <Text style={styles.footerText}>
                    {formatDate(item.created_at)}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  refreshProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    borderRadius: 0,
    zIndex: 10,
  },
  center: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: DARK_GREEN,
    textAlign: "center",
  },
  centerText: {
    fontSize: 13,
    color: "#65776B",
    textAlign: "center",
    lineHeight: 19,
  },
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
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 22,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 6,
  },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  listContent: { padding: 20, paddingBottom: 40, gap: 12 },
  headerBlock: { gap: 14 },
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
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 18,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  heroStatValue: { fontSize: 22, fontWeight: "800", color: "#FFFFFF" },
  heroStatLabel: {
    fontSize: 11,
    color: "#D8F0DF",
    marginTop: 3,
    fontWeight: "600",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E8E2",
    borderRadius: 12,
    paddingHorizontal: 13,
    minHeight: 48,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: "#203C2D" },
  filterRow: { gap: 9, paddingVertical: 2 },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE6DE",
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: "center",
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText: { fontSize: 12, fontWeight: "700", color: "#4A5F52" },
  filterChipTextActive: { color: "#FFFFFF" },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK_GREEN,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#758479",
    textAlign: "center",
    lineHeight: 17,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 16,
    gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  cardMeta: { fontSize: 12, color: "#65776B", marginTop: 4 },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillPublished: { backgroundColor: "#E2F2E8" },
  pillDraft: { backgroundColor: "#F1EEE3" },
  statusPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  pillTextPublished: { color: "#176B45" },
  pillTextDraft: { color: "#8A6D1F" },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#758479",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF3EF",
    paddingTop: 10,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  footerText: { fontSize: 11, color: "#65776B", flexShrink: 1 },
});
