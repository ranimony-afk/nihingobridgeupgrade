import React from "react";
import { cn } from "../utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "featured" | "status";
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider";
  return (
    <span className={cn(base, className)} {...props}>
      {children}
    </span>
  );
}
