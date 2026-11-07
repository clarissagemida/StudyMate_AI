import { ScreenSkeleton } from "@/components/ui/screen-skeleton";
import { Href, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

const ADMIN_DESTINATIONS = new Set([
  "home",
  "users",
  "notifications",
  "materials",
  "reports",
  "ai",
  "settings",
]);

export default function AdminNavigationLoadingScreen() {
  const { destination } = useLocalSearchParams<{ destination?: string }>();
  const route = ADMIN_DESTINATIONS.has(destination ?? "") ? destination : "home";

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(`/admin/${route}` as Href);
    }, 650);
    return () => clearTimeout(timer);
  }, [route]);

  return <ScreenSkeleton />;
}
