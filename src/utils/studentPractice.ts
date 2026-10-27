export type PracticeDifficulty = "easy" | "medium" | "hard";
export type PracticeQuestionType = "multiple_choice" | "true_false" | "mixed";

export type PracticeQuestion = {
  id: string;
  prompt: string;
  type: "multiple_choice" | "true_false";
  options: string[];
  correctIndex: number;
  explanation: string;
  materialRef?: string | null;
};

export type PracticeConfig = {
  materialId: string;
  materialTitle: string;
  difficulty: PracticeDifficulty;
  questionCount: 5 | 10 | 15 | 20;
  questionType: PracticeQuestionType;
};

export type PracticeAttemptRow = {
  id: string;
  material_id: string;
  difficulty: PracticeDifficulty;
  question_type: PracticeQuestionType;
  question_count: number;
  correct_count: number;
  score_percentage: number;
  duration_seconds: number | null;
  created_at: string;
  questions: PracticeQuestion[];
  answers: Record<string, number>;
};

export function makePracticeQuestionId(index: number): string {
  return `pq_${Date.now().toString(36)}_${index}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function formatPracticeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
