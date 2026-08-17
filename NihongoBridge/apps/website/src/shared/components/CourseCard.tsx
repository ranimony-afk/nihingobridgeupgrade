import React from "react";
import Link from "next/link";
import { type BrandConfig } from "@/lib/brands";

export interface CourseCardProps {
  brandSlug: string;
  course: {
    id: number;
    slug: string;
    title: string;
    summary: string;
    level: string;
    isFeatured: boolean;
  };
  brand: BrandConfig;
}

export function CourseCard({ brandSlug, course, brand }: CourseCardProps) {
  return (
    <Link
      href={`/${brandSlug}/courses/${course.slug}`}
      className="rounded-2xl bg-white/80 p-5 shadow-sm transition hover:shadow-md block"
    >
      <p className="text-xs uppercase tracking-widest opacity-60">
        {course.level}
        {course.isFeatured ? " • Featured" : ""}
      </p>
      <p className="mt-2 text-lg font-medium" style={{ color: brand.theme.primary }}>
        {course.title}
      </p>
      <p className="mt-1 text-sm opacity-75">{course.summary}</p>
    </Link>
  );
}
