export const roles = ["student", "teacher", "admin", "super_admin"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "learning:read",
  "learning:write",
  "learning:grade",
  "cms:read",
  "cms:write",
  "cms:publish",
  "users:read",
  "users:manage",
  "institutions:read",
  "institutions:manage",
  "subscriptions:read",
  "subscriptions:manage",
  "audit:read",
  "knowledge:read",
  "knowledge:manage",
  "knowledge:import",
  "system:manage", 
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<Role, readonly Permission[]> = {
  student: ["learning:read", "learning:write"],
  teacher: [
    "learning:read",
    "learning:write",
    "learning:grade",
    "cms:read",
    "cms:write",
    "knowledge:read",
  ],
  admin: [
    "learning:read",
    "learning:write",
    "learning:grade",
    "cms:read",
    "cms:write",
    "cms:publish",
    "users:read",
    "users:manage",
    "institutions:read",
    "subscriptions:read",
    "audit:read",
    "knowledge:read",
    "knowledge:manage",
    "knowledge:import",
  ],
  super_admin: [...permissions],
};

export function isRole(value: string | null | undefined): value is Role {
  return Boolean(value && roles.includes(value as Role));
}

/** Legacy `learner` records remain compatible during the Phase 3 migration. */
export function normalizeRole(value: string | null | undefined): Role {
  if (value === "learner") return "student";
  return isRole(value) ? value : "student";
}

export function permissionsForRole(role: string | null | undefined): readonly Permission[] {
  return rolePermissions[normalizeRole(role)];
}

export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function roleAtLeast(role: string | null | undefined, minimum: Role): boolean {
  const rank: Record<Role, number> = {
    student: 0,
    teacher: 1,
    admin: 2,
    super_admin: 3,
  };

  return rank[normalizeRole(role)] >= rank[minimum];
}
