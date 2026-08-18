import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5 py-10">
      <ResetPasswordForm token={token} />
    </main>
  );
}
