#!/usr/bin/env node

/**
 * Guard script that fails if legacy schema URLs are found in src/ or test/ directories.
 * This ensures we don't accidentally reintroduce old schema URLs.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LEGACY_PATTERNS = [
  "https://soustack.ai/schemas/",
  "https://soustack.spec/",
];

const DIRECTORIES_TO_CHECK = ["src", "test"];

function getAllFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const issues = [];
  for (const pattern of LEGACY_PATTERNS) {
    if (content.includes(pattern)) {
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (line.includes(pattern)) {
          issues.push({
            file: filePath,
            line: index + 1,
            pattern,
            content: line.trim(),
          });
        }
      });
    }
  }
  return issues;
}

function main() {
  const allIssues = [];
  for (const dir of DIRECTORIES_TO_CHECK) {
    try {
      const files = getAllFiles(dir);
      for (const file of files) {
        const issues = checkFile(file);
        allIssues.push(...issues);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist, skip
        continue;
      }
      throw error;
    }
  }

  if (allIssues.length > 0) {
    console.error("❌ Legacy schema URLs found:");
    console.error("");
    for (const issue of allIssues) {
      console.error(`  ${issue.file}:${issue.line}`);
      console.error(`    Pattern: ${issue.pattern}`);
      console.error(`    Content: ${issue.content}`);
      console.error("");
    }
    console.error(
      `Found ${allIssues.length} occurrence(s) of legacy schema URLs.`
    );
    console.error(
      "Please update to use the canonical schema URL: https://spec.soustack.org/soustack.schema.json"
    );
    process.exit(1);
  }

  console.log("✅ No legacy schema URLs found in src/ or test/");
}

main();

