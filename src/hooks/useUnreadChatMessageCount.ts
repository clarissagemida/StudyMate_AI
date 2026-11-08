import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

let channelSequence = 0;

type ChatRole = "student" | "teacher";

export function useUnreadChatMessageCount(role: ChatRole, enabled: boolean) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return;
    const recipientColumn = role === "teacher" ? "teacher_id" : "student_id";
    const [messagesResult, reactionsResult] = await Promise.all([
      supabase.from("teacher_student_messages")
      .select("id", { count: "exact", head: true })
      .eq(recipientColumn, user.id)
      .neq("sender_id", user.id)
      .is("read_at", null),
      supabase.from("teacher_student_message_reactions")
        .select("message_id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .is("read_at", null),
    ]);
    if (!messagesResult.error && !reactionsResult.error) {
      setCount((messagesResult.count ?? 0) + (reactionsResult.count ?? 0));
    }
  }, [enabled, role]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const run = () => { if (active) void refresh(); };
    run();
    channelSequence += 1;
    const channel = supabase.channel(`unread-chat-${role}-${Date.now()}-${channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_messages" }, run)
      .on("postgres_changes", { event: "*", schema: "public", table: "teacher_student_message_reactions" }, run)
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [enabled, refresh, role]);

  return { count, refresh };
}
