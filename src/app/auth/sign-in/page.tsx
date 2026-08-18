import { SignInForm } from "@/components/auth/sign-in-form";
import { isFeatureConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string; verified?: string }>;
};

function safeCallbackUrl(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f2f4ed] px-5 py-10">
      <SignInForm
        callbackUrl={safeCallbackUrl(params.callbackUrl)}
        hasGoogle={isFeatureConfigured("googleOAuth")}
        hasGithub={isFeatureConfigured("githubOAuth")}
        hasEmail={isFeatureConfigured("email")}
        emailVerified={params.verified === "1" ? true : params.verified === "0" ? false : null}
      />
    </main>
  );
}
