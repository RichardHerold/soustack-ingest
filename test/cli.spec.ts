import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ingest } from "../src/cli";

describe("cli ingest warnings", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soustack-cli-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("emits recipes with warnings when instructions exist but ingredients are empty", async () => {
    const inputPath = path.join(tempDir, "instructions-only.txt");
    const outDir = path.join(tempDir, "out");
    const content = ["INSTRUCTIONS ONLY", "Instructions", "Mix well.", "Serve warm."].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    const stderrMessages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      stderrMessages.push(args.map(String).join(" "));
    };

    try {
      await ingest(inputPath, outDir);
    } finally {
      console.error = originalError;
    }

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;

    assert.equal(indexPayload.length, 1);

    const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
    const recipe = JSON.parse(recipeRaw) as {
      metadata?: { ingest?: { warnings?: string[] } };
    };
    const warnings = recipe.metadata?.ingest?.warnings ?? [];

    assert.ok(warnings.some((warning) => warning.includes("Missing ingredients")));
    assert.ok(stderrMessages.some((message) => message.includes("Missing ingredients")));
  });

  it("emits recipes with warnings when ingredients exist but instructions are empty", async () => {
    const inputPath = path.join(tempDir, "ingredients-only.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "INGREDIENTS ONLY",
      "Ingredients",
      "- 1 cup flour",
      "- 2 eggs",
      "- pinch of salt",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    const stderrMessages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      stderrMessages.push(args.map(String).join(" "));
    };

    try {
      await ingest(inputPath, outDir);
    } finally {
      console.error = originalError;
    }

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;

    assert.equal(indexPayload.length, 1);

    const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
    const recipe = JSON.parse(recipeRaw) as {
      metadata?: { ingest?: { warnings?: string[] } };
    };
    const warnings = recipe.metadata?.ingest?.warnings ?? [];

    assert.ok(warnings.some((warning) => warning.includes("Missing instructions")));
    assert.ok(stderrMessages.some((message) => message.includes("Missing instructions")));
  });
});
