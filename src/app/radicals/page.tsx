import type { Metadata } from "next";
import RadicalIndexClient from "./RadicalIndexClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Radicals — Nihongo Bridge",
  description:
    "Browse the 214 Kangxi radicals by stroke count and find the kanji built from them.",
};

/** Database-free UI route; data comes from /api/v2/radicals. */
export default function RadicalsPage() {
  return <RadicalIndexClient />;
}
