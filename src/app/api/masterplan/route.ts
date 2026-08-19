import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getDirectoryTree(dirPath: string, basePath: string = ""): object[] {
  const items: object[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          type: "directory",
          path: relativePath,
          children: getDirectoryTree(path.join(dirPath, entry.name), relativePath),
        });
      } else {
        const stat = fs.statSync(path.join(dirPath, entry.name));
        items.push({
          name: entry.name,
          type: "file",
          path: relativePath,
          size: stat.size,
        });
      }
    }
  } catch {
    // directory might not exist
  }
  return items;
}

export async function GET() {
  const rootDir = path.join(process.cwd(), "nihongobridge-integration-masterplan");

  const tree = getDirectoryTree(rootDir);

  // Read key documents
  const docs: Record<string, string> = {};
  const docFiles = [
    "00_READ_FIRST.md",
    "MASTER_ROADMAP.md",
    "TARGET_ARCHITECTURE.md",
    "DOMAIN_MODEL.md",
    "API_CONTRACT.md",
    "DECISION_LOG.md",
    "RISK_REGISTER.md",
  ];

  for (const file of docFiles) {
    try {
      docs[file] = fs.readFileSync(path.join(rootDir, file), "utf-8");
    } catch {
      docs[file] = "";
    }
  }

  // Count files per category
  const phases = Array.from({ length: 10 }, (_, i) => {
    const phaseDir = path.join(rootDir, "prompts", `phase-0${i}`);
    let fileCount = 0;
    try {
      fileCount = fs.readdirSync(phaseDir).length;
    } catch { /* empty */ }
    return { phase: i, dir: `phase-0${i}`, fileCount };
  });

  const checklistDir = path.join(rootDir, "checklists");
  let checklistCount = 0;
  try {
    checklistCount = fs.readdirSync(checklistDir).length;
  } catch { /* empty */ }

  const reportDirs = ["audits", "database", "etl", "search", "ai", "mobile", "testing", "deployment"];
  const reports = reportDirs.map((dir) => {
    const dirPath = path.join(rootDir, "reports", dir);
    let fileCount = 0;
    try {
      fileCount = fs.readdirSync(dirPath).filter((f) => !f.startsWith(".")).length;
    } catch { /* empty */ }
    return { name: dir, fileCount };
  });

  return NextResponse.json({
    success: true,
    data: {
      tree,
      docs,
      phases,
      checklistCount,
      reports,
    },
  });
}
