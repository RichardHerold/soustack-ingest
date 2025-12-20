import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { normalize } from "../src/pipeline/normalize";
import { segment } from "../src/pipeline/segment";
import { toSoustack } from "../src/pipeline/toSoustack";
import { emit } from "../src/pipeline/emit";
import { IntermediateRecipe, SoustackRecipe } from "../src/pipeline/types";

describe("pipeline", () => {
  describe("normalize", () => {
    it("produces stable lines", () => {
      const input = "First line\r\nSecond line\r\n\r\nThird line";
      const result = normalize(input);

      expect(result.fullText).toBe("First line\nSecond line\n\nThird line");
      expect(result.lines).toEqual([
        { n: 1, text: "First line" },
        { n: 2, text: "Second line" },
        { n: 3, text: "" },
        { n: 4, text: "Third line" },
      ]);
    });
  });

  describe("segment", () => {
    it("returns non-overlapping chunks", () => {
      const lines = normalize("Title\nBody line\nAnother line").lines;
      const { chunks } = segment(lines);

      expect(chunks.length).toBeGreaterThan(0);

      const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);
      sorted.forEach((chunk) => {
        expect(chunk.startLine).toBeLessThanOrEqual(chunk.endLine);
      });
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index].startLine).toBeGreaterThan(sorted[index - 1].endLine);
      }
    });
  });

  describe("toSoustack", () => {
    it("includes required fields", () => {
      const intermediate: IntermediateRecipe = {
        title: "Veggie Bowl",
        ingredients: ["1 cup rice"],
        instructions: ["Cook the rice."],
        source: {
          startLine: 1,
          endLine: 4,
          evidence: "Lines 1-4",
        },
      };

      const recipe = toSoustack(intermediate, { sourcePath: "recipes.md" });

      expect(recipe.$schema).toBe("https://soustack.ai/schemas/recipe.schema.json");
      expect(recipe.level).toBe("recipe");
      expect(recipe.name).toBe(intermediate.title);
      expect(recipe.ingredients).toEqual(intermediate.ingredients);
      expect(recipe.instructions).toEqual(intermediate.instructions);
      expect(recipe["x-ingest"]).toEqual({
        pipelineVersion: "0.1.0",
        sourcePath: "recipes.md",
        sourceLines: {
          start: 1,
          end: 4,
        },
      });
    });
  });

  describe("emit", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soustack-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("writes index and recipe files", async () => {
      const recipes: SoustackRecipe[] = [
        {
          $schema: "https://soustack.ai/schemas/recipe.schema.json",
          level: "recipe",
          name: "Test Recipe",
          stacks: [],
          ingredients: ["1 cup sugar"],
          instructions: ["Mix."],
          "x-ingest": {
            pipelineVersion: "0.1.0",
          },
        },
      ];

      await emit(recipes, tempDir);

      const indexPath = path.join(tempDir, "out", "index.json");
      const recipePath = path.join(tempDir, "out", "recipes", "test-recipe.soustack.json");

      const indexRaw = await fs.readFile(indexPath, "utf-8");
      const indexPayload = JSON.parse(indexRaw) as Array<{ name: string; slug: string; path: string }>;

      expect(indexPayload).toEqual([
        {
          name: "Test Recipe",
          slug: "test-recipe",
          path: "recipes/test-recipe.soustack.json",
        },
      ]);

      const recipeRaw = await fs.readFile(recipePath, "utf-8");
      const recipePayload = JSON.parse(recipeRaw) as SoustackRecipe;

      expect(recipePayload.name).toBe("Test Recipe");
      expect(recipePayload.ingredients).toEqual(["1 cup sugar"]);
    });
  });
});
