import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  auditRoadmap,
  identityPermissions,
  identityRolePermissions,
  identityUsers,
  institutions,
  staffUsers,
  systemSettings,
} from "@/db/schema";
import { hashPassword } from "@/lib/audit/crypto";
import { PERMISSIONS, ROLE_PERMISSIONS, type Role } from "./rbac";
import { uid } from "@/lib/utils";

const PERMISSION_COPY: Record<(typeof PERMISSIONS)[number], string> = {
  "lms.learn": "Access the lesson path",
  "lms.practice": "Access practice and stories",
  "identity.self": "Manage own account, 2FA, and sessions",
  "teacher.roster": "View a class roster",
  "institution.manage": "Manage an institution seat",
  "cms.audit.read": "Read CMS audit",
  "cms.audit.write": "Write CMS audit",
  "identity.users.read": "List identity users",
  "identity.users.write": "Change roles and plans",
  "billing.manage": "Manage subscription plan",
};

export async function ensureIdentitySeed() {
  for (const key of PERMISSIONS) {
    await db
      .insert(identityPermissions)
      .values({ key, description: PERMISSION_COPY[key] })
      .onConflictDoNothing();
  }

  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS) as Array<[Role, Array<string>]>) {
    for (const permission of perms) {
      if (permission === "*") continue;
      await db
        .insert(identityRolePermissions)
        .values({ role, permission })
        .onConflictDoNothing();
    }
  }

  await db
    .insert(institutions)
    .values({ id: "org-bridge", name: "Nihongo Bridge Academy", slug: "bridge-academy", plan: "institution" })
    .onConflictDoNothing();

  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, "staff-sensei"));

  const demos = [
    {
      id: "idn-sensei",
      email: "sensei@nihongobridge.local",
      name: "Lead Architect",
      role: "super_admin",
      plan: "institution",
      staffId: staff?.id ?? null,
      institutionId: "org-bridge",
    },
    {
      id: "idn-student",
      email: "student@nihongobridge.local",
      name: "Aiko Student",
      role: "student",
      plan: "free",
      staffId: null,
      institutionId: null,
    },
    {
      id: "idn-teacher",
      email: "teacher@nihongobridge.local",
      name: "Kenji Sensei",
      role: "teacher",
      plan: "plus",
      staffId: null,
      institutionId: "org-bridge",
    },
    {
      id: "idn-org",
      email: "institution@nihongobridge.local",
      name: "Academy Office",
      role: "institution",
      plan: "institution",
      staffId: null,
      institutionId: "org-bridge",
    },
  ];

  for (const demo of demos) {
    await db
      .insert(identityUsers)
      .values({
        ...demo,
        passwordHash: hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD || "bridge-audit"),
        emailVerifiedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  await db
    .update(auditRoadmap)
    .set({ status: "done" })
    .where(and(eq(auditRoadmap.id, "rm-2")));

  const marked = await db.select({ key: systemSettings.key }).from(systemSettings).where(eq(systemSettings.key, "phase3_event"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase3_event", value: "1" });
    await db.insert(auditEvents).values({
      id: uid("aev"),
      findingId: null,
      actorId: "system",
      action: "phase3",
      detail: "Identity catalog seeded (roles, demo users, OAuth-ready)",
    });
  }
}
