import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Nihongo Bridge is now the sole focus of the platform.
 * The root route lands directly on the Nihongo Bridge learning portal.
 * The previous multi-brand hub remains available at /hub.
 */
export default function HomePage() {
  redirect("/nihongo");
}
