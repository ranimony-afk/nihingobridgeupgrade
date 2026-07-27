import React from "react";
import { cn } from "../utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
}

export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition focus:outline-none";
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
  };
  return (
    <button className={cn(base, styles[variant], className)} {...props}>
      {children}
    </button>
  );
}
