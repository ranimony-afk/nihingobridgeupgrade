export const ROLES = ["student", "teacher", "admin", "super_admin", "institution"] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ["free", "plus", "institution"] as const;
export type Plan = (typeof PLANS)[number];

export const PERMISSIONS = [
  "lms.learn",
  "lms.practice",
  "identity.self",
  "teacher.roster",
  "institution.manage",
  "cms.audit.read",
  "cms.audit.write",
  "identity.users.read",
  "identity.users.write",
  "billing.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Array<Permission | "*">> = {
  student: ["lms.learn", "lms.practice", "identity.self"],
  teacher: ["lms.learn", "lms.practice", "identity.self", "teacher.roster"],
  institution: ["lms.learn", "lms.practice", "identity.self", "teacher.roster", "institution.manage", "billing.manage"],
  admin: [
    "lms.learn",
    "lms.practice",
    "identity.self",
    "teacher.roster",
    "cms.audit.read",
    "cms.audit.write",
    "identity.users.read",
    "identity.users.write",
  ],
  super_admin: ["*"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: string, permission: Permission) {
  if (!isRole(role)) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes("*") || granted.includes(permission);
}

export function planAllows(plan: string, feature: "plus" | "institution") {
  if (feature === "institution") return plan === "institution";
  return plan === "plus" || plan === "institution";
}

export function canAccessTeacher(role: string) {
  return role === "teacher" || role === "admin" || role === "super_admin" || role === "institution";
}

export function canAccessInstitution(role: string) {
  return role === "institution" || role === "admin" || role === "super_admin";
}
