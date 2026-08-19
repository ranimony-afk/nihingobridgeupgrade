import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { getPost } from "@/lib/cms/service";
import { articleLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { relatedPosts } from "@/lib/seo/links";
import { buildMetadata } from "@/lib/seo/metadata";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) {
    return buildMetadata({
      title: "Post not found",
      description: "This article is not available.",
      path: `/blog/${slug}`,
      noindex: true,
    });
  }
  return buildMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.updatedAt,
    modifiedTime: post.updatedAt,
    tags: post.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    // Drafts must not be indexed if someone shares the preview link.
    noindex: post.status !== "published",
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  await seedReady();
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post || post.status !== "published") notFound();
  const tags = post.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const related = await relatedPosts(post.slug, post.tags);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <JsonLd
        data={[
          articleLd({
            title: post.title,
            description: post.seoDescription ?? post.excerpt,
            path: `/blog/${post.slug}`,
            published: post.updatedAt,
            modified: post.updatedAt,
            tags,
            wordCount: post.body.split(/\s+/).filter(Boolean).length,
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <Link href="/blog" className="text-sm font-bold text-[#1cb0f6]">
        ← Blog
      </Link>
      <h1 className="mt-3 text-4xl font-black">{post.title}</h1>
      <p className="mt-2 text-[#777]">{post.excerpt}</p>
      <article className="mt-6 whitespace-pre-wrap text-lg leading-relaxed">{post.body}</article>
      <RelatedLinks title="Keep reading" links={related} />
    </main>
  );
}
