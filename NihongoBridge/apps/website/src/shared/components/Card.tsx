import React from "react";
import { cn } from "../utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/80 p-5 shadow-sm transition hover:shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
