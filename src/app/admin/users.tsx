import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const GREEN = "#176B45";
const DARK_GREEN = "#104D33";
const BG = "#F4F8F5";
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

type ApprovalStatus = "pending" | "approved" | "rejected";
type UserRole = "student" | "teacher" | "admin";

type Profile = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  role: UserRole | null;
  requested_role: UserRole | null;
  approval_status: ApprovalStatus | null;
  created_at: string | null;
};

type FilterKey = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_META: Record<
  ApprovalStatus,
  { bg: string; text: string; label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: {
    bg: "#FFF0D8",
    text: "#A9670D",
    label: "PENDING",
    icon: "time-outline",
  },
  approved: {
    bg: "#E2F1E7",
    text: GREEN,
    label: "APPROVED",
    icon: "checkmark-circle-outline",
  },
  rejected: {
    bg: "#FBE3E3",
    text: "#B33A3A",
    label: "REJECTED",
    icon: "close-circle-outline",
  },
};

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, student_id, role, requested_role, approval_status, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Profile[]) ?? [];
}

export default function AdminUsersScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<{
    id: string;
    action: ApprovalStatus;
  } | null>(null);
  const [reviewing, setReviewing] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;

    fetchProfiles()
      .then((data) => {
        if (!active) return;
        setProfiles(data);
      })
      .catch((error) => {
        console.error("Load profiles error:", error);
        if (!active) return;
        Alert.alert(
          "Unable to load accounts",
          "Please check your connection and try again.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      setProfiles(await fetchProfiles());
    } catch (error) {
      console.error("Refresh profiles error:", error);
      Alert.alert(
        "Unable to refresh accounts",
        "Please check your connection and try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  // Administrators are managed at the database level, never through this screen.
  const managedProfiles = useMemo(
    () =>
      profiles.filter(
        (p) => p.role !== "admin" && p.requested_role !== "admin",
      ),
    [profiles],
  );

  const counts = useMemo(
    () => ({
      pending: managedProfiles.filter((p) => p.approval_status === "pending")
        .length,
      approved: managedProfiles.filter((p) => p.approval_status === "approved")
        .length,
      rejected: managedProfiles.filter((p) => p.approval_status === "rejected")
        .length,
      all: managedProfiles.length,
    }),
    [managedProfiles],
  );

  const visibleProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    return managedProfiles.filter((profile) => {
      const matchesFilter =
        filter === "all" || profile.approval_status === filter;

      if (!matchesFilter) return false;
      if (!query) return true;

      return (
        (profile.full_name ?? "").toLowerCase().includes(query) ||
        (profile.student_id ?? "").toLowerCase().includes(query)
      );
    });
  }, [managedProfiles, filter, search]);

  async function applyStatus(profile: Profile, status: ApprovalStatus) {
    setProcessing({ id: profile.id, action: status });

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ approval_status: status })
        .eq("id", profile.id);

      if (error) throw error;

      setProfiles((current) =>
        current.map((item) =>
          item.id === profile.id ? { ...item, approval_status: status } : item,
        ),
      );
      setReviewing((current) =>
        current && current.id === profile.id
          ? { ...current, approval_status: status }
          : current,
      );
    } catch (error) {
      console.error("Update status error:", error);
      Alert.alert("Update failed", "We couldn't update this account.");
    } finally {
      setProcessing(null);
    }
  }

  function confirmStatus(profile: Profile, status: ApprovalStatus) {
    const isVerify = status === "approved";
    const isReject = status === "rejected";

    const title = isVerify
      ? "Approve this account?"
      : isReject
        ? "Reject this account?"
        : "Move account back to pending?";

    const message = isVerify
      ? `Confirm that the details (including the Student / School ID) are correct before granting access to ${
          profile.full_name ?? "this account"
        }.`
      : isReject
        ? `${profile.full_name ?? "This account"} will not be able to sign in until it is approved.`
        : `${profile.full_name ?? "This account"} will return to the pending queue.`;

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isVerify ? "Approve" : isReject ? "Reject" : "Set to pending",
        style: isReject ? "destructive" : "default",
        onPress: () => void applyStatus(profile, status),
      },
    ]);
  }

  const renderStatusPill = (status: ApprovalStatus | null) => {
    const meta = STATUS_META[status ?? "pending"] ?? STATUS_META.pending;
    return (
      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={11} color={meta.text} />
        <Text style={[styles.statusPillText, { color: meta.text }]}>
          {meta.label}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={GREEN}
          />
        }
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{counts.all}</Text>
            <Text style={styles.summaryLabel}>Total accounts</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: "#A9670D" }]}>
              {counts.pending}
            </Text>
            <Text style={styles.summaryLabel}>Awaiting review</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: GREEN }]}>
              {counts.approved}
            </Text>
            <Text style={styles.summaryLabel}>Approved</Text>
          </View>
        </View>

        <View style={styles.adminNote}>
          <Ionicons name="shield-checkmark" size={15} color={GREEN} />
          <Text style={styles.adminNoteText}>
            Only student and teacher accounts appear here. Administrator accounts
            are secured and managed separately.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#829187" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or Student ID"
            placeholderTextColor="#9BA69F"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#9BA69F" />
            </Pressable>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((option) => {
            const selected = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                style={[styles.filterChip, selected && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selected && styles.filterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.filterBadge,
                    selected && styles.filterBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      selected && styles.filterBadgeTextActive,
                    ]}
                  >
                    {counts[option.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.centerText}>Loading accounts...</Text>
          </View>
        ) : visibleProfiles.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={30} color={GREEN} />
            </View>
            <Text style={styles.emptyTitle}>No accounts found</Text>
            <Text style={styles.centerText}>
              {search
                ? "Try a different name or Student ID."
                : `There are no ${filter === "all" ? "" : filter} accounts to display.`}
            </Text>
          </View>
        ) : (
          visibleProfiles.map((profile) => (
            <Pressable
              key={profile.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => setReviewing(profile)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(profile.full_name ?? "?").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.name} numberOfLines={1}>
                    {profile.full_name ?? "Unnamed account"}
                  </Text>
                  <Text style={styles.subText} numberOfLines={1}>
                    Registered {formatDate(profile.created_at)}
                  </Text>
                </View>

                {renderStatusPill(profile.approval_status)}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.idChip}>
                  <Ionicons name="id-card-outline" size={14} color={DARK_GREEN} />
                  <Text style={styles.idChipText} numberOfLines={1}>
                    {profile.student_id ? profile.student_id : "No ID on record"}
                  </Text>
                </View>
                <View style={styles.roleChip}>
                  <Ionicons
                    name={
                      profile.requested_role === "teacher"
                        ? "easel-outline"
                        : "school-outline"
                    }
                    size={13}
                    color="#65776B"
                  />
                  <Text style={styles.roleChipText}>
                    {profile.requested_role
                      ? profile.requested_role.charAt(0).toUpperCase() +
                        profile.requested_role.slice(1)
                      : "Student"}
                  </Text>
                </View>
              </View>

              <View style={styles.reviewHint}>
                <Text style={styles.reviewHintText}>Tap to review details</Text>
                <Ionicons name="chevron-forward" size={16} color="#829187" />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal
        visible={reviewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewing(null)}
      >
        <View style={styles.modalBackdrop}>
          {reviewing && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Account review</Text>
                <Pressable
                  onPress={() => setReviewing(null)}
                  hitSlop={12}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color="#65776B" />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalIdentity}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {(reviewing.full_name ?? "?")
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.modalName}>
                    {reviewing.full_name ?? "Unnamed account"}
                  </Text>
                  {renderStatusPill(reviewing.approval_status)}
                </View>

                <Text style={styles.detailLabel}>STUDENT / SCHOOL ID</Text>
                <View style={styles.idBox}>
                  <Ionicons
                    name="id-card-outline"
                    size={20}
                    color={DARK_GREEN}
                  />
                  <Text style={styles.idBoxText}>
                    {reviewing.student_id
                      ? reviewing.student_id
                      : "Not provided"}
                  </Text>
                </View>
                <Text style={styles.idNote}>
                  Verify this ID against your official student or faculty records
                  before approving.
                </Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>Requested role</Text>
                  <Text style={styles.detailRowValue}>
                    {reviewing.requested_role
                      ? reviewing.requested_role.charAt(0).toUpperCase() +
                        reviewing.requested_role.slice(1)
                      : "Student"}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>Registered</Text>
                  <Text style={styles.detailRowValue}>
                    {formatDate(reviewing.created_at)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>Account ID</Text>
                  <Text style={styles.detailRowValue} numberOfLines={1}>
                    {reviewing.id}
                  </Text>
                </View>

                <View style={styles.securityNote}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color={GREEN}
                  />
                  <Text style={styles.securityNoteText}>
                    Only approved accounts can sign in to StudyMate AI.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, styles.approveBtn]}
                  onPress={() => confirmStatus(reviewing, "approved")}
                  disabled={
                    processing?.id === reviewing.id ||
                    reviewing.approval_status === "approved"
                  }
                >
                  {processing?.id === reviewing.id &&
                  processing.action === "approved" ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color={GREEN} />
                      <Text style={styles.approveText}>Approve</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.modalBtn, styles.rejectBtn]}
                  onPress={() => confirmStatus(reviewing, "rejected")}
                  disabled={
                    processing?.id === reviewing.id ||
                    reviewing.approval_status === "rejected"
                  }
                >
                  {processing?.id === reviewing.id &&
                  processing.action === "rejected" ? (
                    <ActivityIndicator size="small" color="#B33A3A" />
                  ) : (
                    <>
                      <Ionicons name="close" size={18} color="#B33A3A" />
                      <Text style={styles.rejectText}>Reject</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {reviewing.approval_status !== "pending" && (
                <Pressable
                  style={styles.resetButton}
                  onPress={() => confirmStatus(reviewing, "pending")}
                  disabled={processing?.id === reviewing.id}
                >
                  {processing?.id === reviewing.id &&
                  processing.action === "pending" ? (
                    <ActivityIndicator size="small" color="#65776B" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={15} color="#65776B" />
                      <Text style={styles.resetText}>Move back to pending</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    padding: 20,
    paddingBottom: 44,
    gap: 14,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  summaryLabel: {
    fontSize: 10,
    color: "#758479",
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  adminNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8F3EB",
    borderRadius: 12,
    padding: 12,
  },
  adminNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#3F5A49",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#203C2D",
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EDE7",
  },
  filterChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#52665A",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#EEF4EF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
  },
  filterBadgeTextActive: {
    color: "#FFFFFF",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  centerText: {
    fontSize: 13,
    color: "#758479",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5EDE7",
    shadowColor: "#0B2417",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#E8F3EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 19,
    fontWeight: "800",
    color: GREEN,
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: "#263D2E",
  },
  subText: {
    fontSize: 12,
    color: "#758479",
    marginTop: 3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 13,
    flexWrap: "wrap",
  },
  idChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF4EF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "70%",
  },
  idChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK_GREEN,
    fontFamily: MONO,
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F4F8F5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#65776B",
  },
  reviewHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 12,
  },
  reviewHintText: {
    fontSize: 11,
    color: "#829187",
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,32,21,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: DARK_GREEN,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalIdentity: {
    alignItems: "center",
    gap: 9,
    marginBottom: 18,
  },
  modalAvatar: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarText: {
    fontSize: 27,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#20392B",
    textAlign: "center",
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#829187",
    marginBottom: 8,
  },
  idBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EEF4EF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D6E6DB",
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  idBoxText: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: DARK_GREEN,
    fontFamily: MONO,
    letterSpacing: 0.5,
  },
  idNote: {
    fontSize: 11,
    lineHeight: 16,
    color: "#829187",
    marginTop: 8,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2EF",
  },
  detailRowLabel: {
    fontSize: 13,
    color: "#758479",
    fontWeight: "600",
  },
  detailRowValue: {
    fontSize: 13,
    color: "#20392B",
    fontWeight: "700",
    maxWidth: "60%",
    textAlign: "right",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8F3EB",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#3F5A49",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 13,
    borderWidth: 1,
  },
  approveBtn: {
    backgroundColor: "#E2F1E7",
    borderColor: "#CDE7D6",
  },
  approveText: {
    color: GREEN,
    fontSize: 14,
    fontWeight: "800",
  },
  rejectBtn: {
    backgroundColor: "#FBE3E3",
    borderColor: "#F1CCCC",
  },
  rejectText: {
    color: "#B33A3A",
    fontSize: 14,
    fontWeight: "800",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    marginTop: 4,
  },
  resetText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#65776B",
  },
});
