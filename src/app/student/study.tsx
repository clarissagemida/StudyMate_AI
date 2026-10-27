import { MaterialReader } from "@/components/material-reader";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { supabase } from "@/lib/supabase";
import {
  downloadMaterialFile,
  formatMaterialFileSize,
  materialFileKind,
  openMaterialFile,
} from "@/utils/materialFiles";
import { showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  topic: string | null;
  description: string | null;
  created_at: string;
  content?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
};

type LoadMode = "initial" | "refresh";
type FileAction = "open" | "download";

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

function isMissingColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("column") &&
    (message.includes("does not exist") || message.includes("could not find"))
  );
}

export default function StudentStudyScreen() {
  const [items, setItems] = useState<Material[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [readerMaterial, setReaderMaterial] = useState<Material | null>(null);
  const [readerVisible, setReaderVisible] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState<FileAction | null>(null);

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

      const baseColumns = "id, title, subject, topic, description, created_at";
      let data: unknown = null;
      let error: { code?: string; message?: string } | null = null;

      const withFiles = await supabase
        .from("materials")
        .select(`${baseColumns}, file_path, file_name, file_mime, file_size`)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      data = withFiles.data;
      error = withFiles.error;

      if (isMissingColumn(withFiles.error)) {
        const fallback = await supabase
          .from("materials")
          .select(baseColumns)
          .eq("status", "published")
          .order("created_at", { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (isMissingRelation(error)) {
        setTableMissing(true);
        setItems([]);
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      setTableMissing(false);
      setItems((Array.isArray(data) ? data : []) as Material[]);
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

  const closeReader = useCallback(() => {
    setReaderVisible(false);
    setReaderLoading(false);
    setFileBusy(null);
  }, []);

  // The list only carries summary fields, so the full lesson text is fetched
  // when a student opens a material.
  const openMaterial = useCallback(
    async (item: Material) => {
      setReaderMaterial({ ...item, content: "" });
      setReaderVisible(true);
      setReaderLoading(true);

      try {
        const baseColumns = "id, title, subject, topic, description, created_at";
        const variants = [
          `${baseColumns}, content, file_path, file_name, file_mime, file_size`,
          `${baseColumns}, content`,
          `${baseColumns}, file_path, file_name, file_mime, file_size`,
          baseColumns,
        ];

        let row: Record<string, unknown> | null = null;
        let lastError: { code?: string; message?: string } | null = null;

        for (const columns of variants) {
          const { data, error } = await supabase
            .from("materials")
            .select(columns)
            .eq("id", item.id)
            .eq("status", "published")
            .maybeSingle();

          if (!error) {
            row = data as Record<string, unknown> | null;
            lastError = null;
            break;
          }

          lastError = error;

          if (!isMissingColumn(error)) {
            throw new Error(error.message);
          }
        }

        if (lastError) throw new Error(lastError.message);

        if (!row) {
          closeReader();
          showNotice(
            "Material unavailable",
            "This material is no longer published. Pull down to refresh the library.",
          );
          return;
        }

        setReaderMaterial({
          id: String(row.id),
          title: String(row.title ?? ""),
          subject: String(row.subject ?? ""),
          topic: typeof row.topic === "string" ? row.topic : null,
          description:
            typeof row.description === "string" ? row.description : null,
          created_at: String(row.created_at ?? ""),
          content: typeof row.content === "string" ? row.content : "",
          file_path:
            typeof row.file_path === "string" ? row.file_path : null,
          file_name:
            typeof row.file_name === "string" ? row.file_name : null,
          file_mime:
            typeof row.file_mime === "string" ? row.file_mime : null,
          file_size:
            typeof row.file_size === "number" ? row.file_size : null,
        });
      } catch (err) {
        closeReader();
        showNotice(
          "Unable to open material",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setReaderLoading(false);
      }
    },
    [closeReader],
  );

  const handleOpenFile = useCallback(async () => {
    const filePath = readerMaterial?.file_path;

    if (!filePath || fileBusy) return;

    setFileBusy("open");

    try {
      await openMaterialFile(filePath);
    } catch (err) {
      showNotice(
        "Unable to open file",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setFileBusy(null);
    }
  }, [readerMaterial, fileBusy]);

  const handleDownloadFile = useCallback(async () => {
    const filePath = readerMaterial?.file_path;

    if (!filePath || fileBusy) return;

    setFileBusy("download");

    try {
      await downloadMaterialFile({
        filePath,
        fileName: readerMaterial?.file_name || "material",
        mimeType: readerMaterial?.file_mime || "application/octet-stream",
      });
    } catch (err) {
      showNotice(
        "Download failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setFileBusy(null);
    }
  }, [readerMaterial, fileBusy]);

  if (loading && items === null) {
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <ProgressIndicator
          size="lg"
          color={GREEN}
          accessibilityLabel="Loading study materials"
        />
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

      {refreshing ? (
        <ProgressIndicator
          style={styles.refreshProgress}
          accessibilityLabel="Refreshing study materials"
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
          <Pressable
            onPress={() => {
              void openMaterial(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open lesson: ${item.title}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}>
                <Ionicons
                  name={item.file_path ? "document-attach-outline" : "document-text-outline"}
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
                {item.file_mime ? (
                  <Text style={styles.cardFileMeta} numberOfLines={1}>
                    {materialFileKind(item.file_mime)} ·{" "}
                    {formatMaterialFileSize(item.file_size ?? 0)}
                  </Text>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={18} color="#9AA69E" />
            </View>

            {item.description ? (
              <Text style={styles.cardDescription} numberOfLines={3}>
                {item.description}
              </Text>
            ) : null}

            <View style={styles.cardAction}>
              <Text style={styles.cardActionText}>Read lesson</Text>
              <Ionicons name="book-outline" size={14} color={GREEN} />
            </View>
          </Pressable>
        )}
      />

      <MaterialReader
        material={readerMaterial}
        visible={readerVisible}
        loading={readerLoading}
        onClose={closeReader}
        file={
          readerMaterial?.file_path
            ? {
                name: readerMaterial.file_name || "Attached file",
                meta: `${materialFileKind(readerMaterial.file_mime ?? "")} · ${formatMaterialFileSize(readerMaterial.file_size ?? 0)}`,
              }
            : null
        }
        onOpenFile={readerMaterial?.file_path ? handleOpenFile : undefined}
        onDownloadFile={
          readerMaterial?.file_path ? handleDownloadFile : undefined
        }
        fileAction={fileBusy}
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
  cardFileMeta: { fontSize: 11, color: GREEN, marginTop: 3, fontWeight: "700" },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: "#758479",
  },
  cardAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  cardActionText: { fontSize: 12, fontWeight: "700", color: GREEN },
});
