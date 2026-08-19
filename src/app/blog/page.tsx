import Link from "next/link";
import { listPosts } from "@/lib/cms/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  await seedReady();
  const posts = await listPosts(true);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffc800]">Blog</p>
      <h1 className="text-3xl font-black">Study notes</h1>
      <div className="mt-6 grid gap-4">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="card p-5">
            <h2 className="text-xl font-black">{post.title}</h2>
            <p className="text-[#777]">{post.excerpt}</p>
          </Link>
        ))}
        {posts.length === 0 ? <p className="text-[#777]">Nothing published yet.</p> : null}
      </div>
    </main>
  );
}
