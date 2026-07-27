import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrand } from "@/lib/brands";
import { ensureSeed } from "@/lib/seed";
import { BrandService, CourseService } from "@/shared/services";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ brand: string; slug: string }>;
}) {
  await ensureSeed();
  const { brand: brandSlug, slug } = await params;
  const cfg = getBrand(brandSlug);
  if (!cfg) notFound();

  const brand = await BrandService.getBySlug(brandSlug);
  if (!brand) notFound();

  const course = await CourseService.getWithModules(brand.id, slug, "en");
  if (!course) notFound();

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-4xl">
        <nav className="text-sm">
          <Link href={`/${brandSlug}`} className="opacity-70 hover:opacity-100">
            ← {cfg.name}
          </Link>
        </nav>
        <header className="mt-6">
          <p className="text-xs uppercase tracking-widest opacity-60">{course.level}</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl" style={{ color: cfg.theme.primary }}>
            {course.title}
          </h1>
          <p className="mt-3 opacity-80">{course.summary}</p>
        </header>

        <section className="mt-10 space-y-8">
          {course.modules.map((m) => (
            <div key={m.id}>
              <h2 className="text-lg font-semibold" style={{ color: cfg.theme.primary }}>
                {m.title}
              </h2>
              <ul className="mt-3 divide-y divide-black/5 rounded-2xl bg-white/80 shadow-sm">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="font-medium">{l.title}</p>
                      <p className="text-sm opacity-70">{l.body}</p>
                    </div>
                    <span className="text-xs opacity-60">{l.durationMinutes} min</span>
                  </li>
                ))}
                {m.lessons.length === 0 && (
                  <li className="px-5 py-4 text-sm opacity-60">No lessons yet.</li>
                )}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
