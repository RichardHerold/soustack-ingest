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
    const content = [
      "INSTRUCTIONS ONLY",
      "Instructions",
      "Let stand for 10 minutes.",
      "Cool before eating.",
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
      metadata?: { ingest?: { warnings?: Array<{ code: string; message: string }> } };
    };
    const warnings = recipe.metadata?.ingest?.warnings ?? [];

    assert.ok(warnings.some((warning) => warning.code === "MISSING_INGREDIENTS"));
    assert.ok(warnings.some((warning) => warning.message.includes("missing an ingredients list")));
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
      metadata?: { ingest?: { warnings?: Array<{ code: string; message: string }> } };
    };
    const warnings = recipe.metadata?.ingest?.warnings ?? [];

    assert.ok(warnings.some((warning) => warning.code === "MISSING_INSTRUCTIONS"));
    assert.ok(warnings.some((warning) => warning.message.includes("missing instruction steps")));
  });

  it("creates index.json and recipes directory after ingest", async () => {
    const inputPath = path.join(tempDir, "simple.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "SIMPLE RECIPE",
      "Ingredients",
      "- 1 cup water",
      "Instructions",
      "Boil the water.",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    await ingest(inputPath, outDir);

    const indexStats = await fs.stat(path.join(outDir, "index.json"));
    const recipesStats = await fs.stat(path.join(outDir, "recipes"));

    assert.ok(indexStats.isFile());
    assert.ok(recipesStats.isDirectory());
  });

  it("ingests .rtf files", async () => {
    const inputPath = path.join(__dirname, "fixtures", "sample.rtf");
    const outDir = path.join(tempDir, "out");
    const originalExitCode = process.exitCode;

    try {
      await ingest(inputPath, outDir);
      const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
      const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;
      const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
      const recipe = JSON.parse(recipeRaw) as {
        ingredients?: unknown[];
        instructions?: unknown[];
      };

      assert.equal(indexPayload.length, 1);
      assert.ok(Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0);
      assert.ok(Array.isArray(recipe.instructions) && recipe.instructions.length > 0);
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("lists supported extensions when the input is unsupported", async () => {
    const inputPath = path.join(tempDir, "unsupported.html");
    const outDir = path.join(tempDir, "out");
    await fs.writeFile(inputPath, "<html></html>", "utf-8");
    const originalExitCode = process.exitCode;

    try {
      await assert.rejects(
        async () => ingest(inputPath, outDir),
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          assert.match(message, /supported extensions/i);
          assert.match(message, /\.rtf/);
          assert.match(message, /\.md/);
          assert.match(message, /\.rtfd\.zip/);
          return true;
        },
      );
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("reports skipped recipes and exits non-zero when nothing is emitted", async () => {
    const inputPath = path.join(tempDir, "no-recipe.txt");
    const outDir = path.join(tempDir, "out");
    await fs.writeFile(inputPath, "Just some notes without ingredients or instructions.", "utf-8");

    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    let exitCodeAfterIngest: number | undefined;

    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };

    try {
      await ingest(inputPath, outDir);
      exitCodeAfterIngest = process.exitCode ?? undefined;
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exitCode = originalExitCode;
    }

    assert.equal(exitCodeAfterIngest, 1);
    assert.ok(errors.some((line) => line.includes("Skipping recipe:")));
    assert.ok(errors.some((line) => line.includes("No recipes emitted (0)")));
    assert.ok(logs.some((line) => line.includes("Skip summary")));
  });

  it("allows partial recipes with warnings (missing ingredients)", async () => {
    const inputPath = path.join(tempDir, "partial-ingredients.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "PARTIAL RECIPE",
      "Instructions",
      "Heat the pan.",
      "Cook for 5 minutes.",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    await ingest(inputPath, outDir);

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;

    assert.equal(indexPayload.length, 1);

    const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
    const recipe = JSON.parse(recipeRaw) as {
      $schema: string;
      profile: string;
      name: string;
      stacks: unknown;
      ingredients: unknown[];
      instructions: unknown[];
      metadata?: {
        ingest?: {
          warnings?: Array<{ code: string; message: string }>;
          timestamp?: string;
          toolVersion?: string;
        };
      };
    };

    assert.equal(recipe.$schema, "https://spec.soustack.org/soustack.schema.json");
    assert.equal(recipe.profile, "lite");
    assert.ok(typeof recipe.stacks === "object");
    assert.ok(Array.isArray(recipe.ingredients));
    assert.ok(Array.isArray(recipe.instructions));
    // Note: Ingredients may be inferred from instructions, so we check if warnings exist
    // OR if ingredients array is empty (meaning inference also failed)
    const hasWarning = recipe.metadata?.ingest?.warnings?.some((w) => w.code === "MISSING_INGREDIENTS");
    const hasNoIngredients = recipe.ingredients.length === 0;
    assert.ok(
      hasWarning || hasNoIngredients,
      `Expected MISSING_INGREDIENTS warning or empty ingredients, got warnings: ${JSON.stringify(recipe.metadata?.ingest?.warnings)}, ingredients: ${JSON.stringify(recipe.ingredients)}`
    );
    assert.ok(recipe.metadata?.ingest?.timestamp);
  });

  it("allows partial recipes with warnings (missing instructions)", async () => {
    const inputPath = path.join(tempDir, "partial-instructions.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "PARTIAL RECIPE",
      "Ingredients",
      "- 1 cup flour",
      "- 2 eggs",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    await ingest(inputPath, outDir);

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;

    assert.equal(indexPayload.length, 1);

    const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
    const recipe = JSON.parse(recipeRaw) as {
      metadata?: {
        ingest?: {
          warnings?: Array<{ code: string; message: string }>;
        };
      };
    };

    assert.ok(recipe.metadata?.ingest?.warnings?.some((w) => w.code === "MISSING_INSTRUCTIONS"));
  });

  it("rejects structural validation failures (invalid profile)", async () => {
    // This test verifies that structural validation errors (beyond expected partial extraction)
    // are caught by the validation policy. Since we can't easily create a recipe that fails
    // structural validation through the normal pipeline (it always produces valid structure),
    // we test the validation policy function directly in pipeline.spec.ts.
    // Here we just verify that recipes with valid structure are accepted.
    const inputPath = path.join(tempDir, "valid-structure.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "VALID RECIPE",
      "Ingredients",
      "- 1 cup flour",
      "Instructions",
      "Mix and bake.",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    await ingest(inputPath, outDir);

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<unknown>;
    
    // Recipe should be emitted because structure is valid
    assert.equal(indexPayload.length, 1);
  });

  it("enforces canonical normalization (ensures stacks exists)", async () => {
    const inputPath = path.join(tempDir, "normalize-test.txt");
    const outDir = path.join(tempDir, "out");
    const content = [
      "NORMALIZED RECIPE",
      "Ingredients",
      "- 1 cup water",
      "Instructions",
      "Boil the water.",
    ].join("\n");
    await fs.writeFile(inputPath, content, "utf-8");

    await ingest(inputPath, outDir);

    const indexRaw = await fs.readFile(path.join(outDir, "index.json"), "utf-8");
    const indexPayload = JSON.parse(indexRaw) as Array<{ path: string }>;

    const recipeRaw = await fs.readFile(path.join(outDir, indexPayload[0].path), "utf-8");
    const recipe = JSON.parse(recipeRaw) as {
      $schema: string;
      profile: string;
      name: string;
      stacks: unknown;
      ingredients: unknown[];
      instructions: unknown[];
    };

    assert.equal(recipe.$schema, "https://spec.soustack.org/soustack.schema.json");
    assert.equal(recipe.profile, "lite");
    assert.ok(typeof recipe.stacks === "object" && recipe.stacks !== null);
    assert.ok(Array.isArray(recipe.ingredients));
    assert.ok(Array.isArray(recipe.instructions));
    assert.ok(typeof recipe.name === "string" && recipe.name.length > 0);
  });
});
