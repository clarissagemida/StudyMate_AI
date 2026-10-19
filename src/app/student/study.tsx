import { supabase } from "@/lib/supabase";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const BG = "#F4F8F5";

type Material = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  description: string;
  created_at: string;
};

type LoadMode = "initial" | "refresh";

// PostgREST error codes for a table that has not been created yet.
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

export default function StudentStudyScreen() {
  const [items, setItems] = useState<Material[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
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

      const { data, error } = await supabase
        .from("materials")
        .select("id, title, subject, topic, description, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (isMissingRelation(error)) {
        setTableMissing(true);
        setItems([]);
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      setTableMissing(false);
      setItems((data ?? []) as Material[]);
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Study materials error:", err);

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

  // Loader lives inside the effect so no state is applied synchronously
  // while the effect itself runs.
  useEffect(() => {
    const run = async () => {
      await loadMaterials("initial");
    };

    void run();
  }, [loadMaterials]);

  const visibleItems = useMemo(() => {
    if (!items) return [];

    const term = search.trim().toLowerCase();

    if (!term) return items;

    return items.filter((item) =>
      [item.title, item.subject, item.topic, item.description].some((value) =>
        (value ?? "").toLowerCase().includes(term),
      ),
    );
  }, [items, search]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    void loadMaterials("initial");
  };

  if (loading && items === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.centerText}>Loading study materials...</Text>
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
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Study</Text>
        <Text style={styles.headerSubtitle}>
          Learning materials published by your teachers
        </Text>
      </View>

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
            tintColor={GREEN}
            colors={[GREEN]}
          />
        }
        ListHeaderComponent={
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#718078" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search subject, topic, or title"
              placeholderTextColor="#9AA69E"
              style={styles.searchInput}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search study materials"
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
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.bigIcon}>
              <Ionicons name="book-outline" size={26} color={GREEN} />
            </View>

            <Text style={styles.emptyTitle}>
              {tableMissing
                ? "Study materials are not available yet"
                : search.trim()
                  ? "No matching materials"
                  : "No published materials yet"}
            </Text>

            <Text style={styles.emptyText}>
              {tableMissing
                ? "Your teacher's learning materials will appear here once the study library is activated."
                : search.trim()
                  ? "Try a different search term."
                  : "Check back soon — your teachers are preparing study materials."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}>
                <Ionicons name="document-text-outline" size={20} color={GREEN} />
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
            </View>

            {item.description ? (
              <Text style={styles.cardDescription}>{item.description}</Text>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: DARK_GREEN },
  headerSubtitle: { fontSize: 12, color: "#718078", marginTop: 4 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
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
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
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
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  cardMeta: { fontSize: 12, color: "#65776B", marginTop: 4 },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#758479",
  },
});
