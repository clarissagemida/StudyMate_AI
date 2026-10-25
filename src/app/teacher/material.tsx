import { supabase } from "@/lib/supabase";
import { AI_ENABLED } from "@/utils/aiFlags";
import { indexMaterial } from "@/utils/materialsIndex";
import { confirmAction, showNotice } from "@/utils/notify";
import { generateTeacherAi } from "@/utils/teacherAi";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ScreenTitle } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GREEN = colors.primary;
const DARK_GREEN = colors.primaryDark;
const BG = colors.background;

type MaterialStatus = "draft" | "published";

type Material = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  description: string;
  content: string;
  status: MaterialStatus;
  created_at: string;
  updated_at: string;
};

type LoadMode = "initial" | "refresh";

type FormState = {
  title: string;
  subject: string;
  topic: string;
  description: string;
  content: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  subject: "",
  topic: "",
  description: "",
  content: "",
};

type FilterValue = "all" | MaterialStatus;

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Published", value: "published" },
];

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
  return message.includes("column") && message.includes("does not exist");
}

function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = form.title.trim();
  const subject = form.subject.trim();

  if (title.length < 2) {
    errors.title = "Enter a title with at least 2 characters.";
  } else if (title.length > 150) {
    errors.title = "Title must be 150 characters or fewer.";
  }

  if (!subject) {
    errors.subject = "Subject is required.";
  } else if (subject.length > 80) {
    errors.subject = "Subject must be 80 characters or fewer.";
  }

  if (form.topic.trim().length > 120) {
    errors.topic = "Topic must be 120 characters or fewer.";
  }

  if (form.description.trim().length > 2000) {
    errors.description = "Description must be 2000 characters or fewer.";
  }

  if (form.content.trim().length > 20000) {
    errors.content = "Lesson content must be 20,000 characters or fewer.";
  }

  return errors;
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

export default function TeacherMaterialsScreen() {
  const [items, setItems] = useState<Material[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [groundingMissing, setGroundingMissing] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<MaterialStatus>("draft");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

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

      const primary = await supabase
        .from("materials")
        .select(
          "id, title, subject, topic, description, content, status, created_at, updated_at",
        )
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      let data: unknown[] | null = primary.data;
      let error = primary.error;
      let missingGrounding = false;

      // ai_grounding.sql adds materials.content. Until it runs, keep the
      // materials screen usable without the AI content field.
      if (isMissingColumn(error)) {
        missingGrounding = true;

        const fallback = await supabase
          .from("materials")
          .select(
            "id, title, subject, topic, description, status, created_at, updated_at",
          )
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false });

        data = fallback.data as unknown[] | null;
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
      setGroundingMissing(missingGrounding);

      const rows = (data ?? []) as unknown as Record<string, unknown>[];

      setItems(
        rows.map((row) => ({
          id: String(row.id ?? ""),
          title: String(row.title ?? ""),
          subject: String(row.subject ?? ""),
          topic: typeof row.topic === "string" ? row.topic : "",
          description:
            typeof row.description === "string" ? row.description : "",
          content: typeof row.content === "string" ? row.content : "",
          status: row.status === "published" ? "published" : "draft",
          created_at: String(row.created_at ?? ""),
          updated_at: String(row.updated_at ?? ""),
        })),
      );
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Teacher materials error:", err);

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

    return items.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch =
        !term ||
        [item.title, item.subject, item.topic, item.description].some(
          (value) => (value ?? "").toLowerCase().includes(term),
        );

      return matchesFilter && matchesSearch;
    });
  }, [items, search, filter]);

  const openCreate = () => {
    setEditingId(null);
    setEditingStatus("draft");
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalVisible(true);
  };

  const openEdit = (item: Material) => {
    setEditingId(item.id);
    setEditingStatus(item.status);
    setForm({
      title: item.title,
      subject: item.subject,
      topic: item.topic ?? "",
      description: item.description ?? "",
      content: typeof item.content === "string" ? item.content : "",
    });
    setFormErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving || drafting) return;
    setModalVisible(false);
    setFormErrors({});
  };

  const handleAiDraft = async () => {
    if (drafting || saving) return;

    const subject = form.subject.trim();
    const topic = form.topic.trim() || form.title.trim();

    if (!subject || !topic) {
      setFormErrors((current) => ({
        ...current,
        ...(subject ? {} : { subject: "Add a subject before drafting." }),
        ...(topic ? {} : { topic: "Add a topic or title before drafting." }),
      }));
      return;
    }

    setDrafting(true);

    const result = await generateTeacherAi({
      mode: "topic",
      subject,
      topic,
      difficulty: "medium",
    });

    setDrafting(false);

    if (result.status !== "ok") {
      showNotice("AI Draft Failed", result.message);
      return;
    }

    if (result.mode !== "topic") {
      showNotice("AI Draft Failed", "The AI returned an unexpected draft.");
      return;
    }

    setForm((current) => ({ ...current, content: result.content }));
  };

  const handleSave = async (status: MaterialStatus) => {
    if (saving || drafting) return;

    const errors = validateForm(form);
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      // "Save & Publish" always publishes. The secondary button must never
      // silently unpublish an already-published material, so when editing we
      // keep the row's existing status unless the user chose to publish.
      const nextStatus: MaterialStatus =
        status === "published"
          ? "published"
          : editingId
            ? editingStatus
            : "draft";

      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim(),
        topic: form.topic.trim(),
        description: form.description.trim(),
        status: nextStatus,
        updated_at: new Date().toISOString(),
        ...(groundingMissing ? {} : { content: form.content.trim() }),
      };

      let savedId = editingId;

      if (editingId) {
        const { data, error } = await supabase
          .from("materials")
          .update(payload)
          .eq("id", editingId)
          .eq("teacher_id", user.id)
          .select("id");

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          throw new Error(
            "This material could not be updated. It may have been deleted.",
          );
        }

        setEditingStatus(nextStatus);
      } else {
        const { data, error } = await supabase
          .from("materials")
          .insert({
            ...payload,
            teacher_id: user.id,
            created_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();

        if (error) throw new Error(error.message);

        savedId = typeof data?.id === "string" ? data.id : null;
      }

      setModalVisible(false);
      setFormErrors({});
      await loadMaterials("refresh");

      // Grounding is a background best effort: a failed index must never make
      // a saved material look unsaved. Indexing an empty material clears stale
      // chunks so AI Buddy cannot quote content the teacher removed.
      if (savedId && !groundingMissing) {
        void indexMaterial(savedId).then((result) => {
          if (!result.ok) {
            console.warn("Material indexing skipped:", result.message);
          }
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Material save error:", err);
      showNotice("Save Failed", message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: Material) => {
    if (actionId) return;

    const nextStatus: MaterialStatus =
      item.status === "published" ? "draft" : "published";

    setActionId(item.id);

    try {
      const { data, error } = await supabase
        .from("materials")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .select("id");

      if (error) throw new Error(error.message);

      // RLS-filtered writes return zero rows without an error; treat that as
      // a failure so the list never diverges from the database.
      if (!data || data.length === 0) {
        showNotice(
          "Update Failed",
          "This material no longer exists. Pull to refresh.",
        );
        void loadMaterials("refresh");
        return;
      }

      setItems((current) =>
        (current ?? []).map((row) =>
          row.id === item.id ? { ...row, status: nextStatus } : row,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Material status error:", err);
      showNotice("Update Failed", message);
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = (item: Material) => {
    confirmAction(
      "Delete Material",
      `Delete "${item.title}"? This cannot be undone.`,
      async () => {
        setActionId(item.id);

        try {
          const { data, error } = await supabase
            .from("materials")
            .delete()
            .eq("id", item.id)
            .select("id");

          if (error) throw new Error(error.message);

          if (!data || data.length === 0) {
            showNotice(
              "Delete Failed",
              "This material no longer exists. Pull to refresh.",
            );
            void loadMaterials("refresh");
            return;
          }

          setItems((current) =>
            (current ?? []).filter((row) => row.id !== item.id),
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Something went wrong.";
          console.error("Material delete error:", err);
          showNotice("Delete Failed", message);
        } finally {
          setActionId(null);
        }
      },
      { confirmLabel: "Delete", destructive: true },
    );
  };

  const handleRetry = () => {
    setLoading(true);
    setLoadError(null);
    void loadMaterials("initial");
  };

  if (loading && items === null) {
    return <StateView variant="loading" title="Loading your materials..." />;
  }

  if (loadError && items === null) {
    return (
      <StateView
        variant="error"
        title="Unable to load materials"
        message={loadError}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <ScreenTitle
        title="Learning Materials"
        subtitle={
          items && items.length > 0
            ? `${items.length} material${items.length === 1 ? "" : "s"} in your library`
            : "Draft, publish, and organize your content"
        }
        right={
          !tableMissing ? (
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Create learning material"
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={26} color="#FFFFFF" />
            </Pressable>
          ) : undefined
        }
      />

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
          <View>
            {tableMissing && (
              <View style={styles.notice}>
                <Ionicons
                  name="construct-outline"
                  size={18}
                  color={GREEN}
                />
                <Text style={styles.noticeText}>
                  The materials table has not been created yet. Run{" "}
                  <Text style={styles.noticeStrong}>supabase/materials.sql</Text>{" "}
                  in the Supabase SQL editor, then pull to refresh. This screen
                  will start working with no further changes.
                </Text>
              </View>
            )}

            {/* Search */}
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={19} color="#718078" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search title, subject, or topic"
                placeholderTextColor="#9AA69E"
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search materials"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color="#9AA69E"
                  />
                </Pressable>
              )}
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
              {FILTERS.map((option) => {
                const selected = filter === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setFilter(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.filterChip,
                      selected && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selected && styles.filterChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Card style={styles.emptyBox}>
            <View style={styles.bigIcon}>
              <Ionicons name="document-text-outline" size={26} color={GREEN} />
            </View>

            <Text style={styles.emptyTitle}>
              {tableMissing
                ? "Materials table not configured"
                : search.trim() || filter !== "all"
                  ? "No matching materials"
                  : "No materials yet"}
            </Text>

            <Text style={styles.emptyText}>
              {tableMissing
                ? "Run supabase/materials.sql in Supabase to enable this screen."
                : search.trim() || filter !== "all"
                  ? "Try a different search term or filter."
                  : "Tap the + button to create your first learning material."}
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          const busy = actionId === item.id;

          return (
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.subject}
                    {item.topic ? ` · ${item.topic}` : ""}
                  </Text>
                </View>

                <Chip
                  label={item.status === "published" ? "Published" : "Draft"}
                  tone={item.status === "published" ? "success" : "warning"}
                />
              </View>

              {item.description ? (
                <Text style={styles.cardDescription} numberOfLines={3}>
                  {item.description}
                </Text>
              ) : null}

              <Text style={styles.cardDate}>
                Created {formatDate(item.created_at)}
              </Text>

              <View style={styles.cardActions}>
                {busy ? (
                  <ActivityIndicator size="small" color={GREEN} />
                ) : (
                  <>
                    <Pressable
                      onPress={() => openEdit(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.title}`}
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="pencil-outline" size={17} color={GREEN} />
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void handleToggleStatus(item)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.status === "published"
                          ? `Unpublish ${item.title}`
                          : `Publish ${item.title}`
                      }
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={
                          item.status === "published"
                            ? "eye-off-outline"
                            : "eye-outline"
                        }
                        size={17}
                        color={GREEN}
                      />
                      <Text style={styles.actionButtonText}>
                        {item.status === "published" ? "Unpublish" : "Publish"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.title}`}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.deleteButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="trash-outline" size={17} color="#C53030" />
                      <Text style={[styles.actionButtonText, styles.deleteText]}>
                        Delete
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Create / edit form */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit Material" : "New Material"}
              </Text>

              <Pressable
                onPress={closeModal}
                accessibilityRole="button"
                accessibilityLabel="Close form"
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color="#425348" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>Title *</Text>
              <TextInput
                value={form.title}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, title: value }))
                }
                placeholder="e.g. Introduction to Photosynthesis"
                placeholderTextColor="#9AA69E"
                style={[styles.input, formErrors.title && styles.inputError]}
                accessibilityLabel="Material title"
              />
              {formErrors.title && (
                <Text style={styles.errorText}>{formErrors.title}</Text>
              )}

              <Text style={styles.label}>Subject *</Text>
              <TextInput
                value={form.subject}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, subject: value }))
                }
                placeholder="e.g. Biology"
                placeholderTextColor="#9AA69E"
                style={[styles.input, formErrors.subject && styles.inputError]}
                accessibilityLabel="Material subject"
              />
              {formErrors.subject && (
                <Text style={styles.errorText}>{formErrors.subject}</Text>
              )}

              <Text style={styles.label}>Topic</Text>
              <TextInput
                value={form.topic}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, topic: value }))
                }
                placeholder="e.g. Plant Cells"
                placeholderTextColor="#9AA69E"
                style={[styles.input, formErrors.topic && styles.inputError]}
                accessibilityLabel="Material topic"
              />
              {formErrors.topic && (
                <Text style={styles.errorText}>{formErrors.topic}</Text>
              )}

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={form.description}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, description: value }))
                }
                placeholder="What will students learn from this material?"
                placeholderTextColor="#9AA69E"
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.textarea,
                  formErrors.description && styles.inputError,
                ]}
                accessibilityLabel="Material description"
              />
              {formErrors.description && (
                <Text style={styles.errorText}>{formErrors.description}</Text>
              )}

              <View style={styles.contentLabelRow}>
                <Text style={styles.label}>Lesson Content</Text>

                {AI_ENABLED && !groundingMissing ? (
                  <Pressable
                    onPress={() => void handleAiDraft()}
                    disabled={drafting || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Draft lesson content with AI"
                    style={({ pressed }) => [
                      styles.aiDraftButton,
                      pressed && styles.pressed,
                      (drafting || saving) && styles.disabled,
                    ]}
                  >
                    {drafting ? (
                      <ActivityIndicator size="small" color={GREEN} />
                    ) : (
                      <>
                        <Ionicons name="sparkles-outline" size={13} color={GREEN} />
                        <Text style={styles.aiDraftText}>Draft with AI</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>

              {groundingMissing ? (
                <Text style={styles.hintText}>
                  Run supabase/ai_grounding.sql to enable lesson content and AI
                  grounding. Your existing materials keep working.
                </Text>
              ) : (
                <>
                  <TextInput
                    value={form.content}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, content: value }))
                    }
                    placeholder="Paste or write the full lesson students will study..."
                    placeholderTextColor="#9AA69E"
                    multiline
                    textAlignVertical="top"
                    maxLength={20000}
                    style={[
                      styles.input,
                      styles.contentInput,
                      formErrors.content && styles.inputError,
                    ]}
                    accessibilityLabel="Material lesson content"
                  />
                  {formErrors.content && (
                    <Text style={styles.errorText}>{formErrors.content}</Text>
                  )}
                  <Text style={styles.hintText}>
                    Published lesson content is used by AI Buddy to ground
                    answers in your material. AI drafts are suggestions; review
                    before publishing.
                  </Text>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => void handleSave("draft")}
                disabled={saving || drafting}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                  (saving || drafting) && styles.disabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={GREEN} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {editingId ? "Save Changes" : "Save as Draft"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => void handleSave("published")}
                disabled={saving || drafting}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  (saving || drafting) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {editingId ? "Save & Publish" : "Publish"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  bigIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.6 },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.md,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#3F5A49" },
  noticeStrong: { fontWeight: "800", color: DARK_GREEN },
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
  filterRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.lg - 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText: { fontSize: 12, fontWeight: "700", color: "#5A6B61" },
  filterChipTextActive: { color: "#FFFFFF" },
  emptyBox: {
    padding: spacing.xxxl - 4,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm + 2,
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  cardDate: { fontSize: 11, color: colors.textFaint },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  actionButtonText: { fontSize: 12, fontWeight: "700", color: GREEN },
  deleteButton: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  deleteText: { color: colors.danger },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 36, 23, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    maxHeight: "90%",
    gap: spacing.xs,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: 19, fontWeight: "800", color: DARK_GREEN },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#354C3C",
    marginTop: spacing.md,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
  },
  textarea: { minHeight: 110 },
  contentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  aiDraftButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: "#CDE3D4",
  },
  aiDraftText: { fontSize: 11, fontWeight: "800", color: GREEN },
  contentInput: { minHeight: 160 },
  hintText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 6,
  },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 11, color: colors.danger, marginTop: 5 },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5FAF6",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "800", color: GREEN },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
