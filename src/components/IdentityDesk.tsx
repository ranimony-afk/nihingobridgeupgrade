"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserRow = { id: string; email: string; name: string; role: string; plan: string; status: string };

export function IdentityDesk({
  users,
  institutions,
  mail,
  grants,
}: {
  users: UserRow[];
  institutions: { id: string; name: string }[];
  mail: { id: string; toEmail: string; subject: string; kind: string }[];
  grants: { role: string; permission: string }[];
}) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  async function patch(id: string, field: "role" | "plan" | "status", value: string) {
    const response = await fetch("/api/v1/admin/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Updated" : (data.error ?? "Failed"));
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      {note ? <p className="font-bold text-[#58cc02]">{note}</p> : null}
      <section className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-xs uppercase tracking-widest text-white/60">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Plan</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/10">
                <td className="px-3 py-3">
                  <p className="font-black">{user.name}</p>
                  <p className="text-white/60">{user.email}</p>
                </td>
                <td className="px-3 py-3">
                  <select className="rounded-lg bg-[#0f172a] px-2 py-1" value={user.role} onChange={(event) => patch(user.id, "role", event.target.value)}>
                    {["student", "teacher", "admin", "super_admin", "institution"].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select className="rounded-lg bg-[#0f172a] px-2 py-1" value={user.plan} onChange={(event) => patch(user.id, "plan", event.target.value)}>
                    {["free", "plus", "institution"].map((plan) => (
                      <option key={plan}>{plan}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select className="rounded-lg bg-[#0f172a] px-2 py-1" value={user.status} onChange={(event) => patch(user.id, "status", event.target.value)}>
                    <option>active</option>
                    <option>disabled</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="text-xl font-black">Institutions</h2>
        <ul className="mt-2 text-sm text-white/70">
          {institutions.map((org) => (
            <li key={org.id}>{org.name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-black">Mail outbox</h2>
        <ul className="mt-2 space-y-1 text-sm text-white/70">
          {mail.map((row) => (
            <li key={row.id}>
              {row.kind} · {row.toEmail} · {row.subject}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-black">Role grants</h2>
        <p className="mt-2 text-sm text-white/70">{grants.length} permission rows</p>
      </section>
    </div>
  );
}
