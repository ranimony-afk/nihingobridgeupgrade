import { redirect } from "next/navigation";
import { AppFrame } from "@/components/AppFrame";
import { ShopGrid } from "@/components/ShopGrid";
import { db } from "@/db";
import { shopItems } from "@/db/schema";
import { getPublicLearner } from "@/lib/learner";
import { media } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const learner = await getPublicLearner();
  if (!learner) redirect("/onboarding");
  const items = await db.select().from(shopItems);

  return (
    <AppFrame learner={learner} active="/shop">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#1cb0f6]">Gem shop</p>
          <h1 className="text-3xl font-black">Spend what you earn.</h1>
          <p className="mt-1 text-[#777]">Hearts, streak freezes, double XP, and outfits for Mochi.</p>
          <ShopGrid items={items} gems={learner.gems} avatar={learner.avatar} />
        </div>
        <aside className="card overflow-hidden">
          <img src={media.ramen} alt="Japanese ramen bowl" className="h-40 w-full object-cover" />
          <div className="p-4">
            <p className="font-black">You have {learner.gems} gems</p>
            <p className="mt-2 text-sm text-[#777]">
              Earn gems by finishing lessons. Perfect runs pay more. Chests hide extras on the path.
            </p>
          </div>
        </aside>
      </div>
    </AppFrame>
  );
}
