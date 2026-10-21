// ============================================================================
// Unit tests for the delete-account authorization decision.
// ----------------------------------------------------------------------------
// These test the pure authorizeDeletion() function, so they need NO Supabase
// project, NO network, and NO secrets. They cover exactly the permission
// matrix that protects accounts.
//
// Run from the project root:
//   deno test supabase/functions/delete-account/authorize_test.ts
// ============================================================================

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeDeletion } from "./index.ts";

Deno.test("student deletes their own account -> allowed", () => {
  const result = authorizeDeletion({
    callerIsAdmin: false,
    callerIsApprovedAdmin: false,
    isSelf: true,
    targetIsAdmin: false,
  });
  assertEquals(result, null);
});

Deno.test("teacher deletes their own account -> allowed", () => {
  const result = authorizeDeletion({
    callerIsAdmin: false,
    callerIsApprovedAdmin: false,
    isSelf: true,
    targetIsAdmin: false,
  });
  assertEquals(result, null);
});

Deno.test("admin deletes their own account -> refused", () => {
  const result = authorizeDeletion({
    callerIsAdmin: true,
    callerIsApprovedAdmin: true,
    isSelf: true,
    targetIsAdmin: true,
  });
  assertEquals(result?.status, 403);
});

Deno.test("approved admin deletes a student -> allowed", () => {
  const result = authorizeDeletion({
    callerIsAdmin: true,
    callerIsApprovedAdmin: true,
    isSelf: false,
    targetIsAdmin: false,
  });
  assertEquals(result, null);
});

Deno.test("approved admin deletes a teacher -> allowed", () => {
  const result = authorizeDeletion({
    callerIsAdmin: true,
    callerIsApprovedAdmin: true,
    isSelf: false,
    targetIsAdmin: false,
  });
  assertEquals(result, null);
});

Deno.test("approved admin deletes another admin -> refused", () => {
  const result = authorizeDeletion({
    callerIsAdmin: true,
    callerIsApprovedAdmin: true,
    isSelf: false,
    targetIsAdmin: true,
  });
  assertEquals(result?.status, 403);
});

Deno.test("student tries to delete someone else -> refused", () => {
  const result = authorizeDeletion({
    callerIsAdmin: false,
    callerIsApprovedAdmin: false,
    isSelf: false,
    targetIsAdmin: false,
  });
  assertEquals(result?.status, 403);
});

Deno.test("teacher tries to delete someone else -> refused", () => {
  const result = authorizeDeletion({
    callerIsAdmin: false,
    callerIsApprovedAdmin: false,
    isSelf: false,
    targetIsAdmin: false,
  });
  assertEquals(result?.status, 403);
});

Deno.test("unapproved admin (pending) deleting others -> refused", () => {
  // callerIsAdmin may be true from the profile role, but an admin that is not
  // 'approved' must not gain delete powers.
  const result = authorizeDeletion({
    callerIsAdmin: true,
    callerIsApprovedAdmin: false,
    isSelf: false,
    targetIsAdmin: false,
  });
  assertEquals(result?.status, 403);
});

Deno.test("nobody can delete an admin row even with another flag set", () => {
  const result = authorizeDeletion({
    callerIsAdmin: false,
    callerIsApprovedAdmin: false,
    isSelf: false,
    targetIsAdmin: true,
  });
  assertEquals(result?.status, 403);
});
