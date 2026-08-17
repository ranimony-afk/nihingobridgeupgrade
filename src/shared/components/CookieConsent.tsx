"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("nihongo_cookie_consent");
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("nihongo_cookie_consent", "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-50 rounded-3xl bg-slate-900 text-white p-6 shadow-xl border border-white/10 flex flex-col gap-4">
      <div className="space-y-1 text-xs">
        <p className="font-bold text-sm">🍪 Cookie Consent &amp; Privacy Advisory</p>
        <p className="opacity-80 leading-relaxed">
          We utilize secure cookies to preserve your <b>daily study streaks</b>, claim <b>XP milestones</b>, and authenticate administrative workspaces.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs font-bold self-end">
        <Link href="/nihongo/cookie_policy" className="opacity-75 hover:opacity-100 underline">
          Read Cookie Policy
        </Link>
        <button
          onClick={handleAccept}
          className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 shadow-sm transition cursor-pointer"
        >
          Agree &amp; Accept
        </button>
      </div>
    </div>
  );
}
