import { supabase } from "@/lib/supabase";
import { AI_ENABLED } from "@/utils/aiFlags";
import { confirmAction, showNotice } from "@/utils/notify";
import { generateTeacherAi } from "@/utils/teacherAi";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ScreenTitle } from "@/components/ui/section-header";
import { StateView } from "@/components/ui/state-view";
import { colors, radius, spacing } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type QuizStatus = "draft" | "published";
type Difficulty = "easy" | "medium" | "hard";

type QuizRow = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  description: string;
  status: QuizStatus;
  created_at: string;
  updated_at: string;
};

type QuestionDraft = {
  // Client-only key so React lists stay stable while editing.
  key: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  aiGenerated?: boolean;
};

type MaterialOption = {
  id: string;
  title: string;
  subject: string;
  topic: string;
};

type QuizForm = {
  title: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  description: string;
};

type LoadMode = "initial" | "refresh";
type FilterValue = "all" | QuizStatus;

const EMPTY_FORM: QuizForm = {
  title: "",
  subject: "",
  topic: "",
  difficulty: "medium",
  description: "",
};

const DIFFICULTIES: { label: string; value: Difficulty }[] = [
  { label: "Easy", value: "easy" },
  { label: "Medium", value: "medium" },
  { label: "Hard", value: "hard" },
];

const FILTERS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Published", value: "published" },
];

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

let keyCounter = 0;
function makeKey(): string {
  keyCounter += 1;
  return `q-${Date.now()}-${keyCounter}`;
}

function makeEmptyQuestion(): QuestionDraft {
  return {
    key: makeKey(),
    prompt: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    explanation: "",
  };
}

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

function difficultyLabel(value: Difficulty) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function TeacherQuizzesScreen() {
  const [items, setItems] = useState<QuizRow[] | null>(null);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<QuizStatus>("draft");
  const [form, setForm] = useState<QuizForm>(EMPTY_FORM);
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    makeEmptyQuestion(),
  ]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  // Editing must not be writable until the existing question set has loaded,
  // otherwise an early Save would replace the quiz with an empty question list.
  const [questionsReady, setQuestionsReady] = useState(true);
  const [existingQuestionIds, setExistingQuestionIds] = useState<string[]>([]);
  const questionLoadRef = useRef(0);

  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [aiMaterialId, setAiMaterialId] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);

  const loadQuizzes = useCallback(async (mode: LoadMode) => {
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
        .from("quizzes")
        .select(
          "id, title, subject, topic, difficulty, description, status, created_at, updated_at",
        )
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (isMissingRelation(error)) {
        setTableMissing(true);
        setItems([]);
        setQuestionCounts({});
        setLoadError(null);
        return;
      }

      if (error) throw new Error(error.message);

      setTableMissing(false);

      const rows = (data ?? []) as QuizRow[];
      setItems(rows);
      setLoadError(null);

      // Count questions per quiz in one query for the whole list.
      if (rows.length > 0) {
        const { data: questionRows, error: questionError } = await supabase
          .from("quiz_questions")
          .select("quiz_id")
          .in(
            "quiz_id",
            rows.map((row) => row.id),
          );

        if (questionError) {
          console.warn(
            "Could not load question counts:",
            questionError.message,
          );
          setQuestionCounts({});
        } else {
          const counts: Record<string, number> = {};
          for (const row of questionRows ?? []) {
            counts[row.quiz_id] = (counts[row.quiz_id] ?? 0) + 1;
          }
          setQuestionCounts(counts);
        }
      } else {
        setQuestionCounts({});
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Teacher quizzes error:", err);

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
      await loadQuizzes("initial");
    };

    void run();
  }, [loadQuizzes]);

  useEffect(() => {
    let active = true;

    const loadMaterialOptions = async () => {
      try {
        const { data, error } = await supabase
          .from("materials")
          .select("id, title, subject, topic")
          .order("created_at", { ascending: false })
          .limit(30);

        if (!error && active) {
          setMaterials((data ?? []) as MaterialOption[]);
        }
      } catch {
        // Materials are optional; the AI panel still works from the topic.
      }
    };

    void loadMaterialOptions();

    return () => {
      active = false;
    };
  }, []);

  const visibleItems = useMemo(() => {
    if (!items) return [];

    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const matchesSearch =
        !term ||
        [item.title, item.subject, item.topic, item.description].some((value) =>
          (value ?? "").toLowerCase().includes(term),
        );

      return matchesFilter && matchesSearch;
    });
  }, [items, search, filter]);

  const openCreate = () => {
    questionLoadRef.current += 1;
    setEditingId(null);
    setEditingStatus("draft");
    setForm(EMPTY_FORM);
    setQuestions([makeEmptyQuestion()]);
    setFormErrors({});
    setExistingQuestionIds([]);
    setQuestionsReady(true);
    setAiMaterialId("");
    setModalVisible(true);
  };

  const openEdit = async (item: QuizRow) => {
    const requestId = questionLoadRef.current + 1;
    questionLoadRef.current = requestId;

    setEditingId(item.id);
    setEditingStatus(item.status);
    setForm({
      title: item.title,
      subject: item.subject,
      topic: item.topic ?? "",
      difficulty: item.difficulty,
      description: item.description ?? "",
    });
    setFormErrors({});
    setQuestions([]);
    setExistingQuestionIds([]);
    setQuestionsReady(false);
    setAiMaterialId("");
    setModalVisible(true);

    // Load the existing questions for editing.
    try {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("id, position, prompt, options, correct_index, explanation")
        .eq("quiz_id", item.id)
        .order("position", { ascending: true });

      if (error) throw new Error(error.message);

      // The modal may have been closed or another quiz opened while this
      // request was in flight; ignore stale responses.
      if (questionLoadRef.current !== requestId) return;

      const rows = data ?? [];
      const loaded: QuestionDraft[] = rows.map((row) => ({
        key: makeKey(),
        prompt: row.prompt ?? "",
        options:
          Array.isArray(row.options) && row.options.length >= 2
            ? (row.options as string[])
            : ["", "", "", ""],
        correctIndex:
          typeof row.correct_index === "number" ? row.correct_index : 0,
        explanation: row.explanation ?? "",
      }));

      setExistingQuestionIds(rows.map((row) => row.id));
      setQuestions(loaded.length > 0 ? loaded : [makeEmptyQuestion()]);
      setQuestionsReady(true);
    } catch (err) {
      if (questionLoadRef.current !== requestId) return;

      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Load quiz questions error:", err);
      showNotice("Unable to Load Questions", message);
      // Keep saving blocked: replacing questions we failed to read would
      // destroy the existing set.
      setQuestions([makeEmptyQuestion()]);
      setExistingQuestionIds([]);
      setQuestionsReady(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
    setFormErrors({});
  };

  const updateQuestion = (
    key: string,
    updater: (question: QuestionDraft) => QuestionDraft,
  ) => {
    setQuestions((current) =>
      current.map((question) =>
        question.key === key
          ? { ...updater(question), aiGenerated: false }
          : question,
      ),
    );
  };

  const addQuestion = () => {
    setQuestions((current) => [...current, makeEmptyQuestion()]);
  };

  const removeQuestion = (key: string) => {
    setQuestions((current) => {
      if (current.length <= 1) return current;
      return current.filter((question) => question.key !== key);
    });
  };

  const selectAiMaterial = (material: MaterialOption | null) => {
    if (!material) {
      setAiMaterialId("");
      return;
    }

    setAiMaterialId(material.id);
    setForm((current) => ({
      ...current,
      subject: current.subject.trim() || material.subject,
      topic: current.topic.trim() || material.topic || material.title,
    }));
  };

  const resolveAiContext = () => {
    const subject = form.subject.trim();
    const topic = form.topic.trim() || form.title.trim();

    if (!subject || !topic) {
      setFormErrors((current) => ({
        ...current,
        ...(subject ? {} : { subject: "Add a subject before using AI." }),
        ...(topic ? {} : { topic: "Add a topic or title before using AI." }),
      }));
      showNotice(
        "Add quiz details first",
        "AI needs a subject and a topic (or title) to draft questions.",
      );
      return null;
    }

    return { subject, topic };
  };

  const handleAiGenerate = () => {
    if (generating || saving || regeneratingKey || !questionsReady) return;

    const context = resolveAiContext();
    if (!context) return;

    const run = async () => {
      setGenerating(true);

      const result = await generateTeacherAi({
        mode: "quiz",
        subject: context.subject,
        topic: context.topic,
        difficulty: form.difficulty,
        questionCount: aiCount,
        materialId: aiMaterialId || undefined,
      });

      setGenerating(false);

      if (result.status !== "ok") {
        showNotice("AI Draft Failed", result.message);
        return;
      }

      if (result.mode !== "quiz") {
        showNotice("AI Draft Failed", "The AI returned an unexpected draft.");
        return;
      }

      setQuestions(
        result.questions.map((question) => ({
          key: makeKey(),
          ...question,
          aiGenerated: true,
        })),
      );
      setFormErrors((current) => {
        const next = { ...current };
        for (const key of Object.keys(next)) {
          if (key.startsWith("question-")) delete next[key];
        }
        return next;
      });
    };

    const hasDrafts = questions.some(
      (question) =>
        question.prompt.trim() ||
        question.options.some((option) => option.trim()),
    );

    if (hasDrafts) {
      confirmAction(
        "Replace current questions?",
        "AI will replace the questions in this form. Nothing is saved until you tap Save.",
        run,
        { confirmLabel: "Replace", destructive: true },
      );
      return;
    }

    void run();
  };

  const handleRegenerateQuestion = async (key: string) => {
    if (generating || saving || regeneratingKey) return;

    const context = resolveAiContext();
    if (!context) return;

    setRegeneratingKey(key);

    const result = await generateTeacherAi({
      mode: "quiz",
      subject: context.subject,
      topic: context.topic,
      difficulty: form.difficulty,
      questionCount: 1,
      materialId: aiMaterialId || undefined,
    });

    setRegeneratingKey(null);

    if (result.status !== "ok") {
      showNotice("AI Draft Failed", result.message);
      return;
    }

    if (result.mode !== "quiz" || result.questions.length === 0) {
      showNotice("AI Draft Failed", "The AI returned an unexpected draft.");
      return;
    }

    const generated = result.questions[0];

    setQuestions((current) =>
      current.map((question) =>
        question.key === key
          ? { key: question.key, ...generated, aiGenerated: true }
          : question,
      ),
    );
  };

  const validate = (): Record<string, string> => {
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

    // Every question needs a prompt and at least two filled options.
    questions.forEach((question, index) => {
      const prompt = question.prompt.trim();
      const filledOptions = question.options
        .map((option) => option.trim())
        .filter(Boolean);

      if (!prompt) {
        errors[`question-${question.key}`] =
          `Question ${index + 1} needs a question text.`;
      } else if (prompt.length > 1000) {
        errors[`question-${question.key}`] =
          `Question ${index + 1} must be 1000 characters or fewer.`;
      } else if (filledOptions.length < 2) {
        errors[`question-${question.key}`] =
          `Question ${index + 1} needs at least two answers.`;
      } else if (!question.options[question.correctIndex]?.trim()) {
        errors[`question-${question.key}`] =
          `Question ${index + 1} needs a correct answer selected.`;
      }
    });

    return errors;
  };

  const handleSave = async (status: QuizStatus) => {
    if (saving) return;

    if (!questionsReady) {
      showNotice(
        "Questions Still Loading",
        "Wait for the existing questions to finish loading before saving.",
      );
      return;
    }

    const errors = validate();
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

      // "Publish" always publishes. The secondary button must never silently
      // unpublish an already-published quiz, so when editing we keep the
      // row's existing status unless the teacher chose to publish.
      const nextStatus: QuizStatus =
        status === "published"
          ? "published"
          : editingId
            ? editingStatus
            : "draft";

      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim(),
        topic: form.topic.trim(),
        difficulty: form.difficulty,
        description: form.description.trim(),
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };

      let quizId = editingId;

      if (editingId) {
        const { data, error } = await supabase
          .from("quizzes")
          .update(payload)
          .eq("id", editingId)
          .eq("teacher_id", user.id)
          .select("id");

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          throw new Error(
            "This quiz could not be updated. It may have been deleted.",
          );
        }

        setEditingStatus(nextStatus);
      } else {
        const { data, error } = await supabase
          .from("quizzes")
          .insert({
            ...payload,
            teacher_id: user.id,
            created_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        if (!data) throw new Error("The quiz could not be created.");

        quizId = data.id;
      }

      if (!quizId) throw new Error("The quiz could not be saved.");

      const questionPayload = questions.map((question, index) => ({
        quiz_id: quizId,
        position: index + 1,
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()),
        correct_index: question.correctIndex,
        explanation: question.explanation.trim(),
      }));

      // Insert the new set before removing the old rows so a failed insert
      // cannot leave the quiz with zero questions.
      const { data: insertedRows, error: insertError } = await supabase
        .from("quiz_questions")
        .insert(questionPayload)
        .select("id");

      if (insertError) throw new Error(insertError.message);

      if (existingQuestionIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("quiz_questions")
          .delete()
          .in("id", existingQuestionIds);

        if (deleteError) {
          // Roll the newly inserted rows back so the original set survives.
          const insertedIds = (insertedRows ?? []).map((row) => row.id);
          if (insertedIds.length > 0) {
            await supabase.from("quiz_questions").delete().in("id", insertedIds);
          }
          throw new Error(deleteError.message);
        }
      }

      setModalVisible(false);
      setFormErrors({});
      await loadQuizzes("refresh");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Quiz save error:", err);
      showNotice("Save Failed", message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: QuizRow) => {
    if (actionId) return;

    const nextStatus: QuizStatus =
      item.status === "published" ? "draft" : "published";

    setActionId(item.id);

    try {
      const { data, error } = await supabase
        .from("quizzes")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .select("id");

      if (error) throw new Error(error.message);

      if (!data || data.length === 0) {
        showNotice(
          "Update Failed",
          "This quiz no longer exists. Pull to refresh.",
        );
        void loadQuizzes("refresh");
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
      console.error("Quiz status error:", err);
      showNotice("Update Failed", message);
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = (item: QuizRow) => {
    confirmAction(
      "Delete Quiz",
      `Delete "${item.title}" and all of its questions? This cannot be undone.`,
      async () => {
        setActionId(item.id);

        try {
          const { data, error } = await supabase
            .from("quizzes")
            .delete()
            .eq("id", item.id)
            .select("id");

          if (error) throw new Error(error.message);

          if (!data || data.length === 0) {
            showNotice(
              "Delete Failed",
              "This quiz no longer exists. Pull to refresh.",
            );
            void loadQuizzes("refresh");
            return;
          }

          setItems((current) =>
            (current ?? []).filter((row) => row.id !== item.id),
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Something went wrong.";
          console.error("Quiz delete error:", err);
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
    void loadQuizzes("initial");
  };

  if (loading && items === null) {
    return <StateView variant="loading" title="Loading your quizzes..." />;
  }

  if (loadError && items === null) {
    return (
      <StateView
        variant="error"
        title="Unable to load quizzes"
        message={loadError}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScreenTitle
        title="Quizzes"
        subtitle="Create, review, and publish quizzes for your students"
        right={
          <Pressable
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="Create a new quiz"
            style={({ pressed }) => [
              styles.newButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.newButtonText}>New</Text>
          </Pressable>
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
              void loadQuizzes("refresh");
            }}
            tintColor={GREEN}
            colors={[GREEN]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
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
                accessibilityLabel="Search quizzes"
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

            <View style={styles.filterRow}>
              {FILTERS.map((option) => {
                const active = filter === option.value;

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
              <Ionicons name="clipboard-outline" size={26} color={GREEN} />
            </View>

            <Text style={styles.emptyTitle}>
              {tableMissing
                ? "Quizzes are not available yet"
                : search.trim() || filter !== "all"
                  ? "No matching quizzes"
                  : "No quizzes yet"}
            </Text>

            <Text style={styles.emptyText}>
              {tableMissing
                ? "Run supabase/quizzes.sql in the Supabase SQL editor to activate quizzes."
                : search.trim() || filter !== "all"
                  ? "Try a different search term or filter."
                  : "Tap New to create your first quiz, then add multiple-choice questions."}
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          const published = item.status === "published";
          const count = questionCounts[item.id] ?? 0;
          const busy = actionId === item.id;

          return (
            <Card style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Ionicons name="clipboard-outline" size={20} color={GREEN} />
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

                <Chip
                  label={published ? "Published" : "Draft"}
                  tone={published ? "success" : "warning"}
                />
              </View>

              <View style={styles.tagRow}>
                <Chip
                  icon="speedometer-outline"
                  label={difficultyLabel(item.difficulty)}
                />
                <Chip
                  icon="list-outline"
                  label={`${count} ${count === 1 ? "question" : "questions"}`}
                />
                <Chip
                  icon="calendar-outline"
                  label={formatDate(item.created_at)}
                />
              </View>

              {item.description ? (
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}

              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => void openEdit(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.title}`}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Ionicons name="pencil-outline" size={17} color={GREEN} />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </Pressable>

                <Pressable
                  onPress={() => void handleToggleStatus(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    published
                      ? `Unpublish ${item.title}`
                      : `Publish ${item.title}`
                  }
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : (
                    <>
                      <Ionicons
                        name={published ? "eye-off-outline" : "eye-outline"}
                        size={17}
                        color={GREEN}
                      />
                      <Text style={styles.actionButtonText}>
                        {published ? "Unpublish" : "Publish"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => handleDelete(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.title}`}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.deleteButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Ionicons name="trash-outline" size={17} color="#C53030" />
                  <Text style={[styles.actionButtonText, styles.deleteText]}>
                    Delete
                  </Text>
                </Pressable>
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
                {editingId ? "Edit Quiz" : "New Quiz"}
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
                placeholder="e.g. Cell Structure Basics"
                placeholderTextColor="#9AA69E"
                style={[styles.input, formErrors.title && styles.inputError]}
                accessibilityLabel="Quiz title"
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
                accessibilityLabel="Quiz subject"
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
                placeholder="e.g. The Cell"
                placeholderTextColor="#9AA69E"
                style={[styles.input, formErrors.topic && styles.inputError]}
                accessibilityLabel="Quiz topic"
              />
              {formErrors.topic && (
                <Text style={styles.errorText}>{formErrors.topic}</Text>
              )}

              <Text style={styles.label}>Difficulty</Text>
              <View style={styles.difficultyRow}>
                {DIFFICULTIES.map((option) => {
                  const active = form.difficulty === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() =>
                        setForm((current) => ({
                          ...current,
                          difficulty: option.value,
                        }))
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.difficultyChip,
                        active && styles.difficultyChipActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.difficultyChipText,
                          active && styles.difficultyChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={form.description}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, description: value }))
                }
                placeholder="What should students know before taking this quiz?"
                placeholderTextColor="#9AA69E"
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.textarea,
                  formErrors.description && styles.inputError,
                ]}
                accessibilityLabel="Quiz description"
              />
              {formErrors.description && (
                <Text style={styles.errorText}>{formErrors.description}</Text>
              )}

              {AI_ENABLED ? (
                <View style={styles.aiPanel}>
                  <View style={styles.aiPanelHeader}>
                    <View style={styles.aiPanelTitleRow}>
                      <Ionicons name="sparkles" size={15} color={GREEN} />
                      <Text style={styles.aiPanelTitle}>AI quiz draft</Text>
                    </View>

                    {generating ? (
                      <ActivityIndicator size="small" color={GREEN} />
                    ) : null}
                  </View>

                  <Text style={styles.aiHint}>
                    Generate draft questions from the topic or one of your
                    materials. Review every answer before publishing.
                  </Text>

                  <Text style={styles.aiLabel}>Questions</Text>
                  <View style={styles.aiChipRow}>
                    {[3, 5, 10].map((count) => {
                      const active = aiCount === count;

                      return (
                        <Pressable
                          key={count}
                          onPress={() => setAiCount(count)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            styles.aiChip,
                            active && styles.aiChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.aiChipText,
                              active && styles.aiChipTextActive,
                            ]}
                          >
                            {count}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.aiLabel}>Source material</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.aiMaterialRow}
                  >
                    <Pressable
                      onPress={() => selectAiMaterial(null)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: !aiMaterialId }}
                      style={[
                        styles.aiChip,
                        styles.aiMaterialChip,
                        !aiMaterialId && styles.aiChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.aiChipText,
                          !aiMaterialId && styles.aiChipTextActive,
                        ]}
                      >
                        Topic only
                      </Text>
                    </Pressable>

                    {materials.map((material) => {
                      const active = aiMaterialId === material.id;

                      return (
                        <Pressable
                          key={material.id}
                          onPress={() => selectAiMaterial(material)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[
                            styles.aiChip,
                            styles.aiMaterialChip,
                            active && styles.aiChipActive,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.aiChipText,
                              active && styles.aiChipTextActive,
                            ]}
                          >
                            {material.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Pressable
                    onPress={handleAiGenerate}
                    disabled={
                      generating ||
                      saving ||
                      !!regeneratingKey ||
                      !questionsReady
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Generate quiz questions with AI"
                    style={({ pressed }) => [
                      styles.aiGenerateButton,
                      (generating ||
                        saving ||
                        !!regeneratingKey ||
                        !questionsReady) &&
                        styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {generating ? (
                      <Text style={styles.aiGenerateText}>
                        Drafting questions...
                      </Text>
                    ) : (
                      <>
                        <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.aiGenerateText}>
                          Generate {aiCount} questions
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.questionsHeader}>
                <Text style={styles.questionsTitle}>Questions</Text>
                <Text style={styles.questionsCount}>
                  {questions.length}{" "}
                  {questions.length === 1 ? "question" : "questions"}
                </Text>
              </View>

              {questions.map((question, index) => (
                <View key={question.key} style={styles.questionCard}>
                  <View style={styles.questionTop}>
                    <View style={styles.questionTopLeft}>
                      <Text style={styles.questionNumber}>
                        Question {index + 1}
                      </Text>

                      {question.aiGenerated ? (
                        <View style={styles.aiBadge}>
                          <Ionicons name="sparkles" size={10} color={GREEN} />
                          <Text style={styles.aiBadgeText}>AI draft</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.questionTopActions}>
                      {AI_ENABLED ? (
                        <Pressable
                          onPress={() =>
                            void handleRegenerateQuestion(question.key)
                          }
                          disabled={
                            generating || saving || !!regeneratingKey
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Regenerate question ${index + 1} with AI`}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.regenerateButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          {regeneratingKey === question.key ? (
                            <ActivityIndicator size="small" color={GREEN} />
                          ) : (
                            <Ionicons
                              name="refresh"
                              size={15}
                              color={GREEN}
                            />
                          )}
                        </Pressable>
                      ) : null}

                      {questions.length > 1 && (
                        <Pressable
                          onPress={() => removeQuestion(question.key)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove question ${index + 1}`}
                          hitSlop={6}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color="#C53030"
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <TextInput
                    value={question.prompt}
                    onChangeText={(value) =>
                      updateQuestion(question.key, (current) => ({
                        ...current,
                        prompt: value,
                      }))
                    }
                    placeholder="Type the question"
                    placeholderTextColor="#9AA69E"
                    multiline
                    textAlignVertical="top"
                    style={[styles.input, styles.questionInput]}
                    accessibilityLabel={`Question ${index + 1} text`}
                  />

                  <Text style={styles.optionsLabel}>
                    Answers (tap the circle to mark the correct one)
                  </Text>

                  {question.options.map((option, optionIndex) => {
                    const isCorrect = question.correctIndex === optionIndex;

                    return (
                      <View key={optionIndex} style={styles.optionRow}>
                        <Pressable
                          onPress={() =>
                            updateQuestion(question.key, (current) => ({
                              ...current,
                              correctIndex: optionIndex,
                            }))
                          }
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isCorrect }}
                          accessibilityLabel={`Mark answer ${OPTION_LABELS[optionIndex]} as correct`}
                          hitSlop={6}
                        >
                          <Ionicons
                            name={
                              isCorrect
                                ? "radio-button-on"
                                : "radio-button-off"
                            }
                            size={20}
                            color={isCorrect ? GREEN : "#9AA69E"}
                          />
                        </Pressable>

                        <Text style={styles.optionLetter}>
                          {OPTION_LABELS[optionIndex]}
                        </Text>

                        <TextInput
                          value={option}
                          onChangeText={(value) =>
                            updateQuestion(question.key, (current) => {
                              const nextOptions = [...current.options];
                              nextOptions[optionIndex] = value;
                              return { ...current, options: nextOptions };
                            })
                          }
                          placeholder={`Answer ${OPTION_LABELS[optionIndex]}`}
                          placeholderTextColor="#9AA69E"
                          style={styles.optionInput}
                          accessibilityLabel={`Answer ${OPTION_LABELS[optionIndex]}`}
                        />

                        {question.options.length > 2 && (
                          <Pressable
                            onPress={() =>
                              updateQuestion(question.key, (current) => {
                                const nextOptions = current.options.filter(
                                  (_, i) => i !== optionIndex,
                                );
                                const nextCorrect =
                                  current.correctIndex > optionIndex
                                    ? current.correctIndex - 1
                                    : current.correctIndex === optionIndex
                                      ? 0
                                      : current.correctIndex;
                                return {
                                  ...current,
                                  options: nextOptions,
                                  correctIndex: Math.min(
                                    nextCorrect,
                                    nextOptions.length - 1,
                                  ),
                                };
                              })
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`Remove answer ${OPTION_LABELS[optionIndex]}`}
                            hitSlop={6}
                          >
                            <Ionicons
                              name="close"
                              size={18}
                              color="#9AA69E"
                            />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}

                  {question.options.length < OPTION_LABELS.length && (
                    <Pressable
                      onPress={() =>
                        updateQuestion(question.key, (current) => ({
                          ...current,
                          options: [...current.options, ""],
                        }))
                      }
                      accessibilityRole="button"
                      style={styles.addOption}
                    >
                      <Ionicons name="add" size={16} color={GREEN} />
                      <Text style={styles.addOptionText}>Add answer</Text>
                    </Pressable>
                  )}

                  <Text style={styles.optionsLabel}>Explanation (optional)</Text>
                  <TextInput
                    value={question.explanation}
                    onChangeText={(value) =>
                      updateQuestion(question.key, (current) => ({
                        ...current,
                        explanation: value,
                      }))
                    }
                    placeholder="Why is this the correct answer?"
                    placeholderTextColor="#9AA69E"
                    multiline
                    textAlignVertical="top"
                    style={[styles.input, styles.questionInput]}
                    accessibilityLabel={`Question ${index + 1} explanation`}
                  />

                  {formErrors[`question-${question.key}`] && (
                    <Text style={styles.errorText}>
                      {formErrors[`question-${question.key}`]}
                    </Text>
                  )}
                </View>
              ))}

              <Pressable
                onPress={addQuestion}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.addQuestionButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add-circle-outline" size={18} color={GREEN} />
                <Text style={styles.addQuestionText}>Add another question</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => void handleSave("draft")}
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
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
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
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
  disabled: { opacity: 0.5 },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: GREEN,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg - 2,
    minHeight: 42,
  },
  newButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + 8,
    gap: spacing.md,
  },
  headerBlock: { gap: spacing.md },
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
  filterRow: { flexDirection: "row", gap: spacing.sm + 1 },
  filterChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 38,
    justifyContent: "center",
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText: { fontSize: 12, fontWeight: "700", color: "#4A5F52" },
  filterChipTextActive: { color: "#FFFFFF" },
  emptyBox: {
    padding: spacing.xxxl - 4,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK_GREEN,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
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
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: DARK_GREEN },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cardDescription: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F7F3",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md + 1,
    minHeight: 40,
    justifyContent: "center",
  },
  actionButtonText: { fontSize: 12, fontWeight: "700", color: GREEN },
  deleteButton: { backgroundColor: "#FBECEC" },
  deleteText: { color: colors.danger },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 43, 30, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md + 2,
  },
  modalTitle: { fontSize: 19, fontWeight: "800", color: DARK_GREEN },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#263D2E",
    marginTop: spacing.md + 2,
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#F7FAF8",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: spacing.md - 1,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 48,
  },
  textarea: { minHeight: 88, paddingTop: spacing.md },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 6 },
  difficultyRow: { flexDirection: "row", gap: spacing.sm + 1 },
  difficultyChip: {
    flex: 1,
    backgroundColor: "#F7FAF8",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 1,
    alignItems: "center",
  },
  difficultyChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  difficultyChipText: { fontSize: 13, fontWeight: "700", color: "#4A5F52" },
  difficultyChipTextActive: { color: "#FFFFFF" },
  aiPanel: {
    marginTop: spacing.md + 2,
    backgroundColor: "#F3F9F5",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#D9EADF",
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  aiPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aiPanelTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiPanelTitle: { fontSize: 13, fontWeight: "800", color: DARK_GREEN },
  aiHint: { fontSize: 11, lineHeight: 16, color: "#5B7163" },
  aiLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6B7F72",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  aiChipRow: { flexDirection: "row", gap: 7 },
  aiMaterialRow: { flexDirection: "row", gap: 7, paddingRight: 4 },
  aiChip: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#CFE2D6",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  aiMaterialChip: { maxWidth: 170 },
  aiChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  aiChipText: { fontSize: 12, fontWeight: "700", color: "#43584A" },
  aiChipTextActive: { color: "#FFFFFF" },
  aiGenerateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: GREEN,
    borderRadius: radius.md,
    minHeight: 46,
    marginTop: 4,
  },
  aiGenerateText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  questionTopLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  questionTopActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E6F2EA",
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  aiBadgeText: { fontSize: 9, fontWeight: "800", color: GREEN },
  regenerateButton: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "#EAF4ED",
    alignItems: "center",
    justifyContent: "center",
  },
  questionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: spacing.sm + 2,
  },
  questionsTitle: { fontSize: 16, fontWeight: "800", color: DARK_GREEN },
  questionsCount: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  questionCard: {
    backgroundColor: "#F7FAF8",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#E1EAE4",
    padding: spacing.lg - 2,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  questionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questionNumber: { fontSize: 13, fontWeight: "800", color: GREEN },
  questionInput: {
    minHeight: 56,
    paddingTop: spacing.md - 1,
    backgroundColor: "#FFFFFF",
  },
  optionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionLetter: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4A5F52",
    width: 14,
    textAlign: "center",
  },
  optionInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    fontSize: 13,
    color: colors.textPrimary,
  },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  addOptionText: { fontSize: 12, fontWeight: "700", color: GREEN },
  addQuestionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: GREEN,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  addQuestionText: { fontSize: 13, fontWeight: "800", color: GREEN },
  modalActions: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.md + 2 },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  secondaryButtonText: {
    color: GREEN,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
});
