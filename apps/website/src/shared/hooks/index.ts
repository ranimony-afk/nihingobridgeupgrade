/**
 * Shared React & State Hooks
 */

import { useMemo } from "react";
import { getBrand, type BrandConfig } from "@/lib/brands";

export function useBrandTheme(brandSlug: string): BrandConfig["theme"] | null {
  return useMemo(() => {
    const brand = getBrand(brandSlug);
    return brand ? brand.theme : null;
  }, [brandSlug]);
}
