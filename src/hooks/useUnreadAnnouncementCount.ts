import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

let channelSequence = 0;

export function useUnreadAnnouncementCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return;

    const [announcementsResult, readsResult] = await Promise.all([
      supabase.from("announcements").select("id").order("created_at", { ascending: false }).limit(500),
      supabase.from("announcement_reads").select("announcement_id").eq("student_id", user.id),
    ]);

    if (announcementsResult.error) return;
    const seen = new Set(readsResult.error ? [] : (readsResult.data ?? []).map((row) => row.announcement_id));
    const unreadAnnouncements = (announcementsResult.data ?? []).reduce((total, item) => total + (seen.has(item.id) ? 0 : 1), 0);
    setCount(unreadAnnouncements);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const run = async () => { if (active) await refresh(); };
    void run();
    // Supabase returns an existing channel for a reused topic. In React
    // Strict Mode, cleanup may still be in flight when the effect mounts
    // again; a unique topic prevents trying to register callbacks on that
    // already-subscribed channel.
    channelSequence += 1;
    const channel = supabase.channel(`student-announcement-unread-count-${Date.now()}-${channelSequence}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => { void run(); });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads" }, () => { void run(); });
    channel.subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [enabled, refresh]);

  return { count, refresh };
}
