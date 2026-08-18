import { getIdentity } from "@/lib/identity/request";
import { listIdentityUsers } from "@/lib/identity/service";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const me = await getIdentity();
  const roster = (await listIdentityUsers()).filter((user) => user.role === "student");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ce82ff]">Teacher</p>
      <h1 className="text-3xl font-black">Class roster</h1>
      <p className="mt-2 text-[#777]">Signed in as {me?.name} · {me?.role}</p>
      <ul className="card mt-6 divide-y">
        {roster.map((student) => (
          <li key={student.id} className="px-4 py-3">
            <p className="font-black">{student.name}</p>
            <p className="text-sm text-[#777]">{student.email}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
