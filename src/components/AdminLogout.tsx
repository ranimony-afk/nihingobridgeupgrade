"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export function AdminLogout() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/v1/admin/logout", { method: "POST" });
    await signOut({ redirect: false });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button type="button" className="press bg-white/10 px-3 py-1 text-xs text-white" onClick={logout}>
      Log out
    </button>
  );
}
