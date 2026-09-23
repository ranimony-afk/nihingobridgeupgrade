"use client";

import { CMS_STATUS_META } from "@/lib/cms-admin/actions";
import type { CmsStatus } from "@/lib/cms-admin/types";

/** Workflow status pill in the app's badge vocabulary. */
export function StatusBadge({ status }: { status: CmsStatus }) {
  const meta = CMS_STATUS_META[status] ?? {
    label: status,
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}
