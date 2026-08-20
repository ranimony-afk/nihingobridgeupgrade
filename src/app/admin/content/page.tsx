import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { CmsDesk } from "@/components/CmsDesk";
import { getStaffSession } from "@/lib/audit/auth";
import { cmsOverview } from "@/lib/cms/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const data = await cmsOverview();

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc800]">CMS</p>
      <h1 className="text-4xl font-black">Content workspace</h1>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries({
          Blogs: data.posts.length,
          Courses: data.courses.length,
          Media: data.media.length,
          Lessons: data.counts.lessons,
          Users: data.counts.users,
          Invoices: data.counts.invoices,
        }).map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 p-4">
            <p className="text-xs uppercase text-white/50">{label}</p>
            <p className="text-2xl font-black">{value}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CmsDesk />
        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-xl font-black">Blogs</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {data.posts.map((post) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className="font-bold text-white">
                  {post.title}
                </Link>{" "}
                · {post.status}
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-xl font-black">Courses</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {data.courses.map((course) => (
              <li key={course.id}>
                {course.title} · {course.level} · {course.status} · {course.modules.length} modules
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-xl font-black">Media</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {data.media.map((asset) => (
              <li key={asset.id}>
                {asset.name} · {asset.kind}
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-xl font-black">Notifications</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {data.notifications.map((row) => (
              <li key={row.id}>
                {row.title} · {row.audience} · {row.status}
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-xl font-black">SEO</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {data.seo.map((row) => (
              <li key={row.path}>
                {row.path} · {row.title}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold text-white/70">
        <Link href="/admin/kg">Dictionary</Link>
        <Link href="/admin/kanji">Kanji</Link>
        <Link href="/admin/grammar">Grammar</Link>
        <Link href="/admin/identity">Users</Link>
        <Link href="/admin/billing">Payments</Link>
        <Link href="/admin/tutor">Tutor</Link>
      </div>
    </AdminShell>
  );
}
