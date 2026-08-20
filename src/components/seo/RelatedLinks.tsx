import Link from "next/link";
import type { InternalLink } from "@/lib/seo/links";

/** Contextual internal links. Rendered as real anchors so crawlers follow them. */
export function RelatedLinks({ title, links }: { title: string; links: InternalLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav className="card mt-6 p-5" aria-label={title}>
      <h2 className="text-lg font-black">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={`${link.kind}-${link.href}`}>
            <Link
              href={link.href}
              className="inline-block rounded-full bg-[#ddf4ff] px-3 py-1 text-sm font-bold text-[#1cb0f6]"
              title={link.reason}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
