import { getIdentity } from "@/lib/identity/request";
import { listIdentityUsers, listInstitutions } from "@/lib/identity/service";

export const dynamic = "force-dynamic";

export default async function InstitutionPage() {
  const me = await getIdentity();
  const [orgs, users] = await Promise.all([listInstitutions(), listIdentityUsers()]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ff9600]">Institution</p>
      <h1 className="text-3xl font-black">Academy seats</h1>
      <p className="mt-2 text-[#777]">{me?.email} · plan {me?.plan}</p>
      <div className="mt-6 grid gap-4">
        {orgs.map((org) => (
          <article key={org.id} className="card p-5">
            <h2 className="text-xl font-black">{org.name}</h2>
            <p className="text-sm text-[#777]">{org.slug}</p>
            <p className="mt-2 text-sm font-bold">
              {users.filter((user) => user.institutionId === org.id).length} members
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
