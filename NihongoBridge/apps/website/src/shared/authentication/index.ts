/**
 * Shared Authentication & Role-Based Access Control (RBAC)
 */

export type UserRole = "learner" | "author" | "editor" | "admin";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
}

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  learner: ["course:read", "lesson:read", "progress:write"],
  author: ["course:read", "lesson:read", "page:write", "asset:write"],
  editor: ["course:read", "lesson:read", "page:write", "asset:write", "workflow:transition"],
  admin: ["course:write", "lesson:write", "page:write", "asset:write", "workflow:transition", "admin:all"],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes(permission) || permissions.includes("admin:all");
}
