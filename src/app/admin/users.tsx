import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ApprovalStatus = "pending" | "approved" | "rejected";
type UserRole = "student" | "teacher" | "admin";
type FilterStatus = "all" | ApprovalStatus;

type Profile = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  email: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  requested_role: UserRole | null;
  approval_status: ApprovalStatus | null;
  created_at: string | null;
};

const USERS_PER_PAGE = 5;

const COLORS = {
  primary: "#16794A",
  primaryDark: "#0E5E38",
  primaryLight: "#E8F5EC",
  background: "#F4F8F5",
  white: "#FFFFFF",
  text: "#172B20",
  secondaryText: "#718078",
  border: "#E0E9E2",
  pending: "#B7791F",
  pendingBg: "#FFF5D9",
  approved: "#16834A",
  approvedBg: "#E4F6E9",
  rejected: "#C53030",
  rejectedBg: "#FDE8E8",
  danger: "#C53030",
};

const FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "All Users", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function getStatus(profile: Profile): ApprovalStatus {
  return profile.approval_status ?? "pending";
}

function getStatusColor(status: ApprovalStatus) {
  switch (status) {
    case "approved":
      return COLORS.approved;
    case "rejected":
      return COLORS.rejected;
    default:
      return COLORS.pending;
  }
}

function getStatusBackground(status: ApprovalStatus) {
  switch (status) {
    case "approved":
      return COLORS.approvedBg;
    case "rejected":
      return COLORS.rejectedBg;
    default:
      return COLORS.pendingBg;
  }
}

function formatDate(dateString: string | null) {
  if (!dateString) return "Date unavailable";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AdminUsersScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Tracks which user's three-dot menu is currently open.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        Alert.alert(
          "Session Required",
          "Please sign in to access user management.",
        );
        router.replace("/login");
        return;
      }

      // Verify the signed-in user's actual role.
      const { data: currentProfile, error: currentProfileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (currentProfileError) {
        console.error(
          "Error checking admin role:",
          currentProfileError.message,
        );

        Alert.alert(
          "Unable to Verify Access",
          "We could not verify your account permissions.",
        );
        return;
      }

      if (currentProfile?.role !== "admin") {
        Alert.alert(
          "Access Denied",
          "Only administrators can manage user accounts.",
        );
        router.replace("/login");
        return;
      }

      // Load user profiles, including email and photo storage path.
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, student_id, email, avatar_path, role, requested_role, approval_status, created_at",
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching profiles:", error.message);

        Alert.alert(
          "Unable to Load Users",
          "Could not retrieve user accounts. Check that the email and avatar_path columns exist and that your Supabase Row Level Security policies allow administrators to read profiles.",
        );
        return;
      }

      // Create temporary URLs for photos stored in the private bucket.
      const profilesWithPhotos: Profile[] = await Promise.all(
        (data ?? []).map(async (profile) => {
          let avatarUrl: string | null = null;

          if (profile.avatar_path) {
            const { data: signedImage, error: imageError } =
              await supabase.storage
                .from("profile-photos")
                .createSignedUrl(profile.avatar_path, 3600);

            if (imageError) {
              console.warn(
                `Could not load photo for ${profile.id}:`,
                imageError.message,
              );
            } else {
              avatarUrl = signedImage?.signedUrl ?? null;
            }
          }

          return {
            ...profile,
            avatar_url: avatarUrl,
          } as Profile;
        }),
      );

      setProfiles(profilesWithPhotos);
    } catch (error) {
      console.error("Unexpected user management error:", error);

      Alert.alert(
        "Something Went Wrong",
        "An unexpected error occurred while loading users.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // Keep administrator accounts out of approval management.
  const managedProfiles = useMemo(() => {
    return profiles.filter(
      (profile) =>
        profile.role !== "admin" && profile.requested_role !== "admin",
    );
  }, [profiles]);

  // Account counts are based on all managed profiles.
  const counts = useMemo(() => {
    return {
      all: managedProfiles.length,
      pending: managedProfiles.filter(
        (profile) => getStatus(profile) === "pending",
      ).length,
      approved: managedProfiles.filter(
        (profile) => getStatus(profile) === "approved",
      ).length,
      rejected: managedProfiles.filter(
        (profile) => getStatus(profile) === "rejected",
      ).length,
    };
  }, [managedProfiles]);

  // Apply search and status filtering before pagination.
  const visibleProfiles = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return managedProfiles.filter((profile) => {
      const status = getStatus(profile);
      const matchesStatus = activeFilter === "all" || status === activeFilter;

      const searchableValues = [
        profile.full_name,
        profile.student_id,
        profile.email,
        profile.role,
        profile.requested_role,
      ];

      const matchesSearch =
        !searchTerm ||
        searchableValues.some((value) =>
          (value ?? "").toLowerCase().includes(searchTerm),
        );

      return matchesStatus && matchesSearch;
    });
  }, [managedProfiles, activeFilter, search]);

  // Pagination calculations.
  const totalPages = Math.max(
    1,
    Math.ceil(visibleProfiles.length / USERS_PER_PAGE),
  );

  const paginatedProfiles = useMemo(() => {
    const startIndex = (currentPage - 1) * USERS_PER_PAGE;

    return visibleProfiles.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [visibleProfiles, currentPage]);

  const startItem =
    visibleProfiles.length === 0 ? 0 : (currentPage - 1) * USERS_PER_PAGE + 1;

  const endItem = Math.min(
    currentPage * USERS_PER_PAGE,
    visibleProfiles.length,
  );

  // Return to the first page when the search or filter changes.
  useEffect(() => {
    setCurrentPage(1);
    setOpenMenuId(null);
  }, [search, activeFilter]);

  // Keep the current page valid if the number of results decreases.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const updateApproval = useCallback(
    (profile: Profile, nextStatus: ApprovalStatus) => {
      const actionLabels: Record<ApprovalStatus, string> = {
        approved: "approve",
        rejected: "reject",
        pending: "set back to pending",
      };

      const actionLabel = actionLabels[nextStatus];

      Alert.alert(
        capitalize(actionLabel),
        `Are you sure you want to ${actionLabel} ${
          profile.full_name || "this account"
        }?`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: capitalize(actionLabel),
            style: nextStatus === "rejected" ? "destructive" : "default",
            onPress: () => {
              void (async () => {
                setUpdatingId(profile.id);

                try {
                  const { data, error } = await supabase
                    .from("profiles")
                    .update({ approval_status: nextStatus })
                    .eq("id", profile.id)
                    .select("id, approval_status")
                    .maybeSingle();

                  if (error) {
                    console.error(
                      "Error updating approval status:",
                      error.message,
                    );

                    Alert.alert(
                      "Update Failed",
                      "The account status could not be updated. Check your Supabase Row Level Security policies.",
                    );
                    return;
                  }

                  if (!data) {
                    Alert.alert(
                      "No Changes Made",
                      "No profile was updated. Check that your administrator update policy allows this action.",
                    );
                    return;
                  }

                  setProfiles((currentProfiles) =>
                    currentProfiles.map((item) =>
                      item.id === profile.id
                        ? {
                            ...item,
                            approval_status: nextStatus,
                          }
                        : item,
                    ),
                  );

                  Alert.alert(
                    "Success",
                    `${profile.full_name || "The account"} has been ${
                      nextStatus === "approved"
                        ? "approved"
                        : nextStatus === "rejected"
                          ? "rejected"
                          : "returned to pending status"
                    }.`,
                  );
                } catch (error) {
                  console.error("Unexpected update error:", error);

                  Alert.alert(
                    "Update Failed",
                    "An unexpected error occurred. Please try again.",
                  );
                } finally {
                  setUpdatingId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [],
  );

  const renderProfile = ({ item }: { item: Profile }) => {
    const status = getStatus(item);
    const statusColor = getStatusColor(status);
    const statusBackground = getStatusBackground(status);
    const isUpdating = updatingId === item.id;
    const isMenuOpen = openMenuId === item.id;

    const displayRole = item.role ?? "student";
    const requestedRole = item.requested_role;
    const initial = (item.full_name?.trim().charAt(0) || "U").toUpperCase();

    return (
      <View style={styles.userCard}>
        <View style={styles.userTopRow}>
          <View style={styles.avatar}>
            {item.avatar_url ? (
              <Image
                source={{ uri: item.avatar_url }}
                style={styles.avatarImage}
                resizeMode="cover"
                accessibilityLabel={`Profile photo of ${
                  item.full_name || "user"
                }`}
              />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </View>

          <View style={styles.userInformation}>
            <Text style={styles.userName} numberOfLines={2}>
              {item.full_name || "Unnamed User"}
            </Text>

            <Text style={styles.studentId}>
              {item.student_id
                ? `Student ID: ${item.student_id}`
                : "No student ID"}
            </Text>

            <View style={styles.emailRow}>
              <Ionicons
                name="mail-outline"
                size={13}
                color={COLORS.secondaryText}
              />
              <Text style={styles.emailText} numberOfLines={2}>
                {item.email || "Email unavailable"}
              </Text>
            </View>

            <Text style={styles.accountRole}>
              Account role: {capitalize(displayRole)}
            </Text>

            {requestedRole && requestedRole !== displayRole && (
              <Text style={styles.requestedRole}>
                Originally requested: {capitalize(requestedRole)}
              </Text>
            )}
          </View>

          <View
            style={[styles.statusBadge, { backgroundColor: statusBackground }]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {capitalize(status)}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dateRow}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color={COLORS.secondaryText}
          />
          <Text style={styles.dateText}>
            Registered {formatDate(item.created_at)}
          </Text>
        </View>

        {/* Compact three-dot account actions menu */}
        <View style={styles.cardActions}>
          <Text style={styles.actionHint}>Account actions</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${
              item.full_name || "this user"
            }`}
            accessibilityState={{ expanded: isMenuOpen }}
            disabled={isUpdating}
            onPress={() =>
              setOpenMenuId((current) => (current === item.id ? null : item.id))
            }
            style={({ pressed }) => [
              styles.moreButton,
              pressed && styles.buttonPressed,
              isUpdating && styles.disabledButton,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons
                name="ellipsis-vertical"
                size={21}
                color={COLORS.primary}
              />
            )}
          </Pressable>
        </View>

        {isMenuOpen && !isUpdating && (
          <View style={styles.actionMenu}>
            {status !== "approved" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpenMenuId(null);
                  updateApproval(item, "approved");
                }}
                style={({ pressed }) => [
                  styles.menuOption,
                  pressed && styles.menuOptionPressed,
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={19}
                  color={COLORS.approved}
                />
                <Text style={styles.approveMenuText}>Approve Account</Text>
              </Pressable>
            )}

            {status !== "rejected" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpenMenuId(null);
                  updateApproval(item, "rejected");
                }}
                style={({ pressed }) => [
                  styles.menuOption,
                  pressed && styles.menuOptionPressed,
                ]}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={19}
                  color={COLORS.danger}
                />
                <Text style={styles.rejectMenuText}>Reject Account</Text>
              </Pressable>
            )}

            {status !== "pending" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpenMenuId(null);
                  updateApproval(item, "pending");
                }}
                style={({ pressed }) => [
                  styles.menuOption,
                  pressed && styles.menuOptionPressed,
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={19}
                  color={COLORS.primary}
                />
                <Text style={styles.resetMenuText}>Set to Pending</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderPagination = () => {
    if (visibleProfiles.length === 0) {
      return null;
    }

    return (
      <View style={styles.paginationContainer}>
        <Text style={styles.paginationInfo}>
          Showing {startItem}–{endItem} of {visibleProfiles.length}
        </Text>

        <View style={styles.paginationButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            accessibilityState={{ disabled: currentPage === 1 }}
            disabled={currentPage === 1}
            onPress={() => {
              setOpenMenuId(null);
              setCurrentPage((page) => Math.max(1, page - 1));
            }}
            style={({ pressed }) => [
              styles.paginationButton,
              currentPage === 1 && styles.paginationButtonDisabled,
              pressed && currentPage !== 1 && styles.buttonPressed,
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={17}
              color={currentPage === 1 ? COLORS.secondaryText : COLORS.primary}
            />
            <Text
              style={[
                styles.paginationButtonText,
                currentPage === 1 && styles.paginationButtonTextDisabled,
              ]}
            >
              Previous
            </Text>
          </Pressable>

          <View style={styles.pageIndicator}>
            <Text style={styles.pageIndicatorText}>
              {currentPage} / {totalPages}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next page"
            accessibilityState={{ disabled: currentPage === totalPages }}
            disabled={currentPage === totalPages}
            onPress={() => {
              setOpenMenuId(null);
              setCurrentPage((page) => Math.min(totalPages, page + 1));
            }}
            style={({ pressed }) => [
              styles.paginationButton,
              currentPage === totalPages && styles.paginationButtonDisabled,
              pressed && currentPage !== totalPages && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.paginationButtonText,
                currentPage === totalPages &&
                  styles.paginationButtonTextDisabled,
              ]}
            >
              Next
            </Text>
            <Ionicons
              name="chevron-forward"
              size={17}
              color={
                currentPage === totalPages
                  ? COLORS.secondaryText
                  : COLORS.primary
              }
            />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>

          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>User Management</Text>
            <Text style={styles.headerSubtitle}>
              Review and manage student and teacher accounts
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh users"
            disabled={refreshing}
            onPress={() => {
              setOpenMenuId(null);
              void fetchProfiles(true);
            }}
            style={styles.refreshButton}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={21}
                color={COLORS.primary}
              />
            )}
          </Pressable>
        </View>

        <FlatList
          data={paginatedProfiles}
          keyExtractor={(item) => item.id}
          renderItem={renderProfile}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setOpenMenuId(null);
                void fetchProfiles(true);
              }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.summaryCard}>
                <View style={styles.summaryIcon}>
                  <Ionicons
                    name="people-outline"
                    size={25}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.summaryTextContainer}>
                  <Text style={styles.summaryLabel}>Managed Accounts</Text>
                  <Text style={styles.summaryValue}>{counts.all}</Text>
                  <Text style={styles.summaryCaption}>
                    Student and teacher profiles
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <View
                    style={[
                      styles.statIcon,
                      { backgroundColor: COLORS.pendingBg },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={COLORS.pending}
                    />
                  </View>
                  <Text style={styles.statValue}>{counts.pending}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>

                <View style={styles.statCard}>
                  <View
                    style={[
                      styles.statIcon,
                      { backgroundColor: COLORS.approvedBg },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color={COLORS.approved}
                    />
                  </View>
                  <Text style={styles.statValue}>{counts.approved}</Text>
                  <Text style={styles.statLabel}>Approved</Text>
                </View>

                <View style={styles.statCard}>
                  <View
                    style={[
                      styles.statIcon,
                      { backgroundColor: COLORS.rejectedBg },
                    ]}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={18}
                      color={COLORS.rejected}
                    />
                  </View>
                  <Text style={styles.statValue}>{counts.rejected}</Text>
                  <Text style={styles.statLabel}>Rejected</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Account Directory</Text>
              <Text style={styles.sectionSubtitle}>
                Search by name, student ID, email, or role, and filter by
                approval status.
              </Text>

              <View style={styles.searchContainer}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={COLORS.secondaryText}
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name, ID, email, or role..."
                  placeholderTextColor="#98A69D"
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Search user accounts"
                />

                {search.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    onPress={() => setSearch("")}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={19}
                      color={COLORS.secondaryText}
                    />
                  </Pressable>
                )}
              </View>

              <FlatList
                data={FILTERS}
                keyExtractor={(item) => item.value}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filtersContainer}
                renderItem={({ item: filter }) => {
                  const selected = activeFilter === filter.value;
                  const count = counts[filter.value];

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setActiveFilter(filter.value)}
                      style={[
                        styles.filterChip,
                        selected && styles.filterChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          selected && styles.filterTextSelected,
                        ]}
                      >
                        {filter.label}
                      </Text>

                      <View
                        style={[
                          styles.filterCount,
                          selected && styles.filterCountSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterCountText,
                            selected && styles.filterCountTextSelected,
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
              />

              <View style={styles.resultsHeading}>
                <Text style={styles.resultsTitle}>
                  {activeFilter === "all"
                    ? "All Accounts"
                    : `${capitalize(activeFilter)} Accounts`}
                </Text>
                <Text style={styles.resultsCount}>
                  {visibleProfiles.length} found
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading user accounts...</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="people-outline"
                    size={32}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>No accounts found</Text>
                <Text style={styles.emptyDescription}>
                  {search.trim()
                    ? "Try another name, student ID, email, or role."
                    : activeFilter === "pending"
                      ? "There are no accounts waiting for approval."
                      : "No accounts match the selected filter."}
                </Text>
              </View>
            )
          }
          ListFooterComponent={renderPagination}
        />

        {!loading && (
          <View style={styles.footer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={COLORS.secondaryText}
            />
            <Text style={styles.footerText}>
              Administrator account controls
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.secondaryText,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginLeft: 8,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    flexGrow: 1,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 19,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  summaryIcon: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  summaryTextContainer: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.secondaryText,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 29,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 2,
  },
  summaryCaption: {
    fontSize: 12,
    color: COLORS.secondaryText,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 26,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: COLORS.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 23,
    fontWeight: "800",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.secondaryText,
    marginTop: 3,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.secondaryText,
    marginTop: 5,
    marginBottom: 15,
  },
  searchContainer: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    fontSize: 13,
    color: COLORS.text,
  },
  filtersContainer: {
    paddingTop: 15,
    paddingBottom: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    gap: 7,
  },
  filterChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.secondaryText,
  },
  filterTextSelected: {
    color: COLORS.white,
  },
  filterCount: {
    minWidth: 21,
    height: 21,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 5,
  },
  filterCountSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.secondaryText,
  },
  filterCountTextSelected: {
    color: COLORS.white,
  },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  resultsCount: {
    fontSize: 12,
    color: COLORS.secondaryText,
  },
  userCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 15,
  },
  avatarText: {
    fontSize: 19,
    fontWeight: "800",
    color: COLORS.primary,
  },
  userInformation: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  userName: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },
  studentId: {
    fontSize: 11,
    color: COLORS.secondaryText,
    marginTop: 4,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  emailText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.secondaryText,
  },
  accountRole: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
    marginTop: 5,
  },
  requestedRole: {
    fontSize: 10,
    color: COLORS.secondaryText,
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 9,
    marginLeft: 6,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 14,
  },
  dateText: {
    fontSize: 11,
    color: COLORS.secondaryText,
  },

  // Three-dot action menu styles
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  actionHint: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.secondaryText,
  },
  moreButton: {
    width: 42,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: "#C7E5D0",
  },
  actionMenu: {
    alignSelf: "flex-end",
    width: 190,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuOption: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    gap: 10,
  },
  menuOptionPressed: {
    backgroundColor: COLORS.background,
  },
  approveMenuText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.approved,
  },
  rejectMenuText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.danger,
  },
  resetMenuText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  buttonPressed: {
    opacity: 0.75,
  },
  disabledButton: {
    opacity: 0.6,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.secondaryText,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    paddingVertical: 35,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    marginBottom: 15,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  emptyDescription: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: COLORS.secondaryText,
    marginTop: 7,
  },
  paginationContainer: {
    paddingVertical: 16,
    paddingHorizontal: 2,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  paginationInfo: {
    textAlign: "center",
    color: COLORS.secondaryText,
    fontSize: 11,
    fontWeight: "600",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  paginationButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#C7E5D0",
    backgroundColor: COLORS.white,
    gap: 3,
  },
  paginationButtonDisabled: {
    backgroundColor: "#F0F3F1",
    borderColor: COLORS.border,
    opacity: 0.8,
  },
  paginationButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  paginationButtonTextDisabled: {
    color: COLORS.secondaryText,
  },
  pageIndicator: {
    minWidth: 66,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
  },
  pageIndicatorText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  footerText: {
    fontSize: 11,
    color: COLORS.secondaryText,
  },
});
