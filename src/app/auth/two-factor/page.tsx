import { TwoFactorChallengeForm } from "@/components/auth/two-factor-challenge-form";

export const dynamic = "force-dynamic";

type TwoFactorPageProps = {
  searchParams: Promise<{ challenge?: string }>;
};

export default async function TwoFactorPage({ searchParams }: TwoFactorPageProps) {
  const { challenge } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5 py-10">
      <TwoFactorChallengeForm challenge={challenge} />
    </main>
  );
}
