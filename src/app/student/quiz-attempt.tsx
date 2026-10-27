import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { supabase } from "@/lib/supabase";
import { AI_ENABLED } from "@/utils/aiFlags";
import { confirmAction, showNotice } from "@/utils/notify";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRequireRole } from "@/hooks/useRequireRole";

const GREEN = "#176B45";
const DARK_GREEN = "#123D2A";
const BG = "#F4F8F5";

type Difficulty = "easy" | "medium" | "hard";

type QuizMeta = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: Difficulty;
  description: string;
};

type Question = {
  id: string;
  position: number;
  prompt: string;
  options: string[];
};

type ReviewQuestion = Question & {
  correct_index: number;
  explanation: string;
};

type SubmitResult = {
  score: number;
  total: number;
  questions: ReviewQuestion[];
};

type Phase = "loading" | "taking" | "results";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

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

function isMissingFunction(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;

  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("could not find the function") ||
    message.includes("function public.") ||
    message.includes("does not exist")
  );
}

function difficultyLabel(value: Difficulty) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeReviewQuestion(value: unknown): ReviewQuestion | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const prompt = typeof row.prompt === "string" ? row.prompt : "";
  const options =
    Array.isArray(row.options) && row.options.length >= 2
      ? row.options.filter((option): option is string => typeof option === "string")
      : [];

  if (!id || options.length < 2) return null;

  return {
    id,
    position: typeof row.position === "number" ? row.position : 0,
    prompt,
    options,
    correct_index:
      typeof row.correctIndex === "number" ? row.correctIndex : 0,
    explanation: typeof row.explanation === "string" ? row.explanation : "",
  };
}

function parseSubmitResult(value: unknown): SubmitResult {
  if (!value || typeof value !== "object") {
    throw new Error("The server returned an invalid quiz result.");
  }

  const raw = value as Record<string, unknown>;
  const score = typeof raw.score === "number" ? raw.score : Number(raw.score);
  const total = typeof raw.total === "number" ? raw.total : Number(raw.total);
  const questions = Array.isArray(raw.questions)
    ? raw.questions
        .map(normalizeReviewQuestion)
        .filter((question): question is ReviewQuestion => question !== null)
    : [];

  if (
    !Number.isInteger(score) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    score < 0 ||
    score > total ||
    questions.length !== total
  ) {
    throw new Error("The server returned an incomplete quiz result.");
  }

  return { score, total, questions };
}

function buildMistakePrompt(
  quiz: QuizMeta,
  questions: ReviewQuestion[],
  selections: Record<string, number>,
  score: number,
  total: number,
): string {
  const missed = questions
    .filter((question) => selections[question.id] !== question.correct_index)
    .slice(0, 3);

  const lines = missed.map((question, index) => {
    const selected = selections[question.id];
    const chosen =
      selected === undefined
        ? "No answer"
        : question.options[selected] ?? "No answer";
    const correct = question.options[question.correct_index] ?? "";

    return `${index + 1}. ${question.prompt.slice(0, 180)}
My answer: ${chosen}
Correct answer: ${correct}`;
  });

  return `I scored ${score}/${total} on "${quiz.title}". Please explain these questions simply.

${lines.join("\n\n")}`.slice(0, 1900);
}

export default function QuizAttemptScreen() {
  const guardState = useRequireRole("student");
  const params = useLocalSearchParams<{ quizId?: string }>();
  const quizId = typeof params.quizId === "string" ? params.quizId : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(0);
  const [resultTotal, setResultTotal] = useState(0);

  const loadQuiz = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);

    try {
      if (!quizId) {
        throw new Error("No quiz was selected.");
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: quizData, error: quizError } = await supabase
        .from("quizzes")
        .select("id, title, subject, topic, difficulty, description")
        .eq("id", quizId)
        .eq("status", "published")
        .maybeSingle();

      if (isMissingRelation(quizError)) {
        throw new Error("Quizzes are not available yet.");
      }

      if (quizError) throw new Error(quizError.message);

      if (!quizData) {
        throw new Error("This quiz is no longer available.");
      }

      const { data: questionData, error: questionError } = await supabase.rpc(
        "get_quiz_questions",
        { p_quiz_id: quizId },
      );

      if (questionError) {
        if (isMissingFunction(questionError)) {
          throw new Error(
            "Secure quiz mode is not configured yet. Run teacher_features.sql in Supabase.",
          );
        }
        throw new Error(questionError.message);
      }

      const loaded: Question[] = (
        Array.isArray(questionData) ? questionData : []
      )
        .map((value) => {
          if (!value || typeof value !== "object") return null;

          const row = value as Record<string, unknown>;
          const options =
            Array.isArray(row.options) && row.options.length >= 2
              ? row.options.filter(
                  (option): option is string => typeof option === "string",
                )
              : [];

          if (typeof row.id !== "string" || options.length < 2) return null;

          return {
            id: row.id,
            position: typeof row.position === "number" ? row.position : 0,
            prompt: typeof row.prompt === "string" ? row.prompt : "",
            options,
          };
        })
        .filter((row): row is Question => row !== null);

      if (loaded.length === 0) {
        throw new Error("This quiz does not have any questions to answer.");
      }

      setQuiz(quizData as QuizMeta);
      setQuestions(loaded);
      setReviewQuestions([]);
      setCurrentIndex(0);
      setSelections({});
      setScore(0);
      setResultTotal(0);
      setPhase("taking");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      console.error("Quiz attempt load error:", err);
      setLoadError(message);
    }
  }, [quizId]);

  useEffect(() => {
    if (guardState === "allowed") {
      const run = async () => {
        await loadQuiz();
      };
      void run();
    }
  }, [guardState, loadQuiz]);

  const total = questions.length;
  const answeredCount = Object.keys(selections).length;
  const current = questions[currentIndex];

  const selectOption = (questionId: string, optionIndex: number) => {
    setSelections((currentSelections) => ({
      ...currentSelections,
      [questionId]: optionIndex,
    }));
  };

  const goNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((index) => index + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((index) => index - 1);
    }
  };

  const submit = useCallback(async () => {
    if (submitting) return;

    setSubmitting(true);

    try {
      const answers: Record<string, number> = {};

      for (const question of questions) {
        const selected = selections[question.id];
        if (selected !== undefined) answers[question.id] = selected;
      }

      const { data, error } = await supabase.rpc("submit_quiz_attempt", {
        p_quiz_id: quizId,
        p_answers: answers,
      });

      if (error) {
        if (isMissingRelation(error) || isMissingFunction(error)) {
          throw new Error(
            "Secure quiz grading is not configured yet. Run teacher_features.sql in Supabase.",
          );
        }
        throw new Error(error.message);
      }

      const result = parseSubmitResult(data);
      setScore(result.score);
      setResultTotal(result.total);
      setReviewQuestions(result.questions);
      setPhase("results");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not submit your quiz.";
      console.error("Quiz submit error:", err);
      showNotice("Could Not Submit Quiz", message);
    } finally {
      setSubmitting(false);
    }
  }, [questions, quizId, selections, submitting]);

  const handleSubmitPress = () => {
    const unanswered = total - answeredCount;

    if (unanswered > 0) {
      confirmAction(
        "Submit quiz?",
        `You have ${unanswered} unanswered ${
          unanswered === 1 ? "question" : "questions"
        }. Unanswered questions are marked incorrect.`,
        () => {
          void submit();
        },
        { confirmLabel: "Submit", destructive: true },
      );
      return;
    }

    void submit();
  };

  const handleExit = () => {
    if (phase === "taking" && answeredCount > 0) {
      confirmAction(
        "Leave quiz?",
        "Your answers will be lost and this attempt will not be saved.",
        () => {
          router.back();
        },
        { confirmLabel: "Leave", destructive: true },
      );
      return;
    }

    router.back();
  };

  if (phase === "loading" && !loadError) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "bottom"]}>
        <ProgressIndicator
          size="lg"
          color={GREEN}
          accessibilityLabel="Loading quiz"
        />
        <Text style={styles.centerText}>Loading quiz...</Text>
      </SafeAreaView>
    );
  }

  if (loadError || !quiz) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "bottom"]}>
        <View style={[styles.bigIcon, styles.errorIcon]}>
          <Ionicons name="cloud-offline-outline" size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.centerTitle}>Unable to start quiz</Text>
        <Text style={styles.centerText}>
          {loadError ?? "This quiz is unavailable."}
        </Text>

        <Pressable
          onPress={handleExit}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (phase === "results") {
    const gradedTotal = resultTotal || reviewQuestions.length || total;
    const percent =
      gradedTotal > 0 ? Math.round((score / gradedTotal) * 100) : 0;
    const passed = percent >= 50;
    const circleColor = passed ? GREEN : "#B33A3A";
    const wrongCount = reviewQuestions.filter(
      (question) => selections[question.id] !== question.correct_index,
    ).length;
    const mistakePrompt = buildMistakePrompt(
      quiz,
      reviewQuestions,
      selections,
      score,
      gradedTotal,
    );

    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.resultsContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.scoreCard}>
            <View style={[styles.scoreCircle, { borderColor: circleColor }]}>
              <Text style={[styles.scorePercent, { color: circleColor }]}>
                {percent}%
              </Text>
              <Text style={styles.scoreFraction}>
                {score}/{gradedTotal}
              </Text>
            </View>

            <Text style={styles.resultsTitle}>
              {passed ? "Well done!" : "Keep practicing"}
            </Text>
            <Text style={styles.resultsSubtitle}>
              {quiz.title}
              {quiz.subject ? ` · ${quiz.subject}` : ""}
            </Text>

            {AI_ENABLED && wrongCount > 0 ? (
              <Pressable
                onPress={() => {
                  router.push({
                    pathname: "/student/ai-buddy",
                    params: { prompt: mistakePrompt },
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="Ask AI Buddy to explain my mistakes"
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.fullWidth,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="sparkles-outline" size={18} color={GREEN} />
                <Text style={styles.secondaryButtonText}>
                  Explain my mistakes
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleExit}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                styles.fullWidth,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.reviewHeading}>Review answers</Text>

          {reviewQuestions.map((question, index) => {
            const selected = selections[question.id] ?? -1;
            const isCorrect = selected === question.correct_index;

            return (
              <View key={question.id} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <View
                    style={[
                      styles.reviewBadge,
                      isCorrect ? styles.badgeCorrect : styles.badgeWrong,
                    ]}
                  >
                    <Ionicons
                      name={isCorrect ? "checkmark" : "close"}
                      size={13}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.reviewPrompt}>
                    {index + 1}. {question.prompt}
                  </Text>
                </View>

                {question.options.map((option, optionIndex) => {
                  const isAnswer = optionIndex === question.correct_index;
                  const isChosen = optionIndex === selected;

                  return (
                    <View
                      key={`${question.id}-${optionIndex}`}
                      style={[
                        styles.reviewOption,
                        isAnswer && styles.reviewOptionCorrect,
                        isChosen && !isAnswer && styles.reviewOptionWrong,
                      ]}
                    >
                      <Text
                        style={[
                          styles.reviewOptionLabel,
                          isAnswer && styles.reviewOptionLabelCorrect,
                          isChosen && !isAnswer && styles.reviewOptionLabelWrong,
                        ]}
                      >
                        {OPTION_LABELS[optionIndex] ?? "•"}
                      </Text>
                      <Text style={styles.reviewOptionText}>{option}</Text>
                      {isAnswer ? (
                        <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                      ) : isChosen ? (
                        <Ionicons name="close-circle" size={16} color="#B33A3A" />
                      ) : null}
                    </View>
                  );
                })}

                {question.explanation ? (
                  <View style={styles.explanationBox}>
                    <Ionicons
                      name="bulb-outline"
                      size={14}
                      color="#8A6D1F"
                    />
                    <Text style={styles.explanationText}>
                      {question.explanation}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase === "taking"
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleExit}
          accessibilityRole="button"
          accessibilityLabel="Exit quiz"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={DARK_GREEN} />
        </Pressable>

        <Text style={styles.progressText}>
          Question {currentIndex + 1} of {total}
        </Text>

        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((currentIndex + 1) / total) * 100}%` },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.questionContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {difficultyLabel(quiz.difficulty)}
            </Text>
          </View>
          {quiz.subject ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{quiz.subject}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.questionPrompt}>{current.prompt}</Text>

        <View style={styles.options}>
          {current.options.map((option, optionIndex) => {
            const isSelected = selections[current.id] === optionIndex;

            return (
              <Pressable
                key={`${current.id}-${optionIndex}`}
                onPress={() => selectOption(current.id, optionIndex)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Option ${OPTION_LABELS[optionIndex] ?? ""}: ${option}`}
                style={({ pressed }) => [
                  styles.option,
                  isSelected && styles.optionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabelText,
                      isSelected && styles.optionLabelTextSelected,
                    ]}
                  >
                    {OPTION_LABELS[optionIndex] ?? "•"}
                  </Text>
                </View>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={goPrev}
          disabled={currentIndex === 0}
          accessibilityRole="button"
          accessibilityLabel="Previous question"
          style={({ pressed }) => [
            styles.secondaryButton,
            currentIndex === 0 && styles.buttonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={DARK_GREEN} />
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>

        {currentIndex < total - 1 ? (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next question"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubmitPress}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Submit quiz"
            style={({ pressed }) => [
              styles.primaryButton,
              submitting && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              {answeredCount < total
                ? `Submit (${answeredCount}/${total})`
                : "Submit"}
            </Text>
          </Pressable>
        )}
      </View>
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
  pressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.45 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingHorizontal: 20,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E3DB",
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryButtonText: { color: DARK_GREEN, fontSize: 14, fontWeight: "700" },
  fullWidth: { alignSelf: "stretch" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  progressText: { fontSize: 13, fontWeight: "700", color: DARK_GREEN },
  topBarSpacer: { width: 24 },
  progressTrack: {
    height: 6,
    backgroundColor: "#E2EAE3",
    borderRadius: 999,
    marginHorizontal: 20,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: GREEN,
    borderRadius: 999,
  },
  questionContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 14 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#EEF4EF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: "#4C5E52" },
  questionPrompt: {
    fontSize: 18,
    fontWeight: "800",
    color: DARK_GREEN,
    lineHeight: 26,
  },
  options: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E8E2",
    borderRadius: 14,
    padding: 14,
  },
  optionSelected: { borderColor: GREEN, backgroundColor: "#EEF7F0" },
  optionLabel: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#EEF4EF",
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabelSelected: { backgroundColor: GREEN },
  optionLabelText: { fontSize: 13, fontWeight: "800", color: "#4C5E52" },
  optionLabelTextSelected: { color: "#FFFFFF" },
  optionText: { flex: 1, fontSize: 14, color: "#203C2D", lineHeight: 20 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#E7EEE9",
    backgroundColor: "#FFFFFF",
  },
  resultsContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 16 },
  scoreCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  scoreCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  scorePercent: { fontSize: 28, fontWeight: "900" },
  scoreFraction: { fontSize: 13, fontWeight: "700", color: "#758479" },
  resultsTitle: { fontSize: 18, fontWeight: "800", color: DARK_GREEN },
  resultsSubtitle: {
    fontSize: 13,
    color: "#65776B",
    textAlign: "center",
  },
  reviewHeading: {
    fontSize: 15,
    fontWeight: "800",
    color: DARK_GREEN,
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    padding: 16,
    gap: 10,
  },
  reviewTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reviewBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  badgeCorrect: { backgroundColor: GREEN },
  badgeWrong: { backgroundColor: "#B33A3A" },
  reviewPrompt: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#203C2D",
    lineHeight: 20,
  },
  reviewOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#EDF2EE",
    borderRadius: 12,
    padding: 11,
  },
  reviewOptionCorrect: { borderColor: GREEN, backgroundColor: "#EEF7F0" },
  reviewOptionWrong: { borderColor: "#E4B4B4", backgroundColor: "#FBEFEF" },
  reviewOptionLabel: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#EEF4EF",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 12,
    fontWeight: "800",
    color: "#4C5E52",
    overflow: "hidden",
  },
  reviewOptionLabelCorrect: { backgroundColor: GREEN, color: "#FFFFFF" },
  reviewOptionLabelWrong: { backgroundColor: "#B33A3A", color: "#FFFFFF" },
  reviewOptionText: { flex: 1, fontSize: 13, color: "#33493C", lineHeight: 18 },
  explanationBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FBF3DA",
    borderRadius: 12,
    padding: 12,
  },
  explanationText: { flex: 1, fontSize: 12, color: "#8A6D1F", lineHeight: 17 },
});
