export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingStatus = "open" | "in_progress" | "resolved" | "accepted_risk";
export type FindingCategory =
  | "architecture"
  | "security"
  | "performance"
  | "debt"
  | "smell"
  | "missing"
  | "duplicate"
  | "unused"
  | "dependency"
  | "accessibility"
  | "seo"
  | "cms"
  | "data";

export type FindingSeed = {
  id: string;
  domain: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  effort: "S" | "M" | "L" | "XL";
  priority: number;
  status?: FindingStatus;
};

export type RoadmapSeed = {
  id: string;
  phase: string;
  title: string;
  description: string;
  dependsOn?: string;
  status: "done" | "active" | "planned";
  sortOrder: number;
};
