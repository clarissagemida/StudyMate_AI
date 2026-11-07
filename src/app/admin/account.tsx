import { Redirect } from "expo-router";

// Keep old deep links working after Account was folded into Settings.
export default function AdminAccountRedirect() {
  return <Redirect href="/admin/settings" />;
}
