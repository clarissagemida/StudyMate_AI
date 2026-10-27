import { supabase } from "@/lib/supabase";

export type ChangePasswordResult = {
  ok: boolean;
  message: string;
};

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ChangePasswordResult> {
  const { data, error } = await supabase.functions.invoke("change-password", {
    body: input,
  });

  if (error) {
    let message = "Failed to change password. Please try again.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: string; message?: string };
        if (parsed?.error) message = parsed.error;
        else if (parsed?.message) message = parsed.message;
      } catch {
        // ignore
      }
    }
    return { ok: false, message };
  }

  const result = (data ?? {}) as { status?: string; message?: string; error?: string };
  if (result?.error) {
    return { ok: false, message: result.error };
  }
  return { ok: true, message: result?.message || "Password updated successfully." };
}
