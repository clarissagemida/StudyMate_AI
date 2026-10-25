import { AI_ENABLED } from "@/utils/aiFlags";
import { invokeAi } from "@/utils/aiClient";

export type IndexMaterialResult =
  | { ok: true; indexed: number }
  | { ok: false; message: string };

type IndexResponse = {
  status?: string;
  indexed?: number;
  message?: string;
};

// Rebuilds the embedding chunks for one material. Called after the teacher
// saves content; failure never blocks saving.
export async function indexMaterial(
  materialId: string,
): Promise<IndexMaterialResult> {
  if (!AI_ENABLED) {
    return { ok: false, message: "AI is turned off in this build." };
  }

  const result = await invokeAi<IndexResponse>(
    "materials-index",
    { materialId },
    { timeoutMs: 120000 },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  const indexed =
    typeof result.data.indexed === "number" ? result.data.indexed : 0;

  return { ok: true, indexed };
}
