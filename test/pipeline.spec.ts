import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { normalize } from "../src/pipeline/normalize";
import { segment } from "../src/pipeline/segment";
import { extract } from "../src/pipeline/extract";
import { toSoustack } from "../src/pipeline/toSoustack";
import { emit } from "../src/pipeline/emit";
import { initValidator, validate } from "../src/pipeline/validate";
import { IntermediateRecipe, SoustackRecipe } from "../src/pipeline/types";

describe("pipeline", () => {
  describe("normalize", () => {
    it("produces stable lines", () => {
      const input = "First line\r\nSecond line\r\n\r\nThird line";
      const result = normalize(input);

      assert.equal(result.fullText, "First line\nSecond line\n\nThird line");
      assert.deepEqual(result.lines, [
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

      assert.ok(chunks.length > 0);

      const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);
      sorted.forEach((chunk) => {
        assert.ok(chunk.startLine <= chunk.endLine);
      });
      for (let index = 1; index < sorted.length; index += 1) {
        assert.ok(sorted[index].startLine > sorted[index - 1].endLine);
      }
    });

    it("segments a mini cookbook with inferred titles", () => {
      const cookbook = [
        "SUMMER SALAD",
        "",
        "2 cups mixed greens",
        "1/2 cup cherry tomatoes",
        "Pinch of salt",
        "",
        "Toss together and serve.",
        "",
        "COZY SOUP",
        "",
        "- 1 tbsp olive oil",
        "- 1 cup broth",
        "",
        "Directions",
        "Simmer for 10 minutes.",
        "",
        "PANCAKE BITES",
        "",
        "1 cup flour",
        "1/2 cup milk",
        "1 egg",
        "",
        "Cook on a griddle until golden.",
      ].join("\n");

      const { chunks } = segment(normalize(cookbook).lines);

      assert.equal(chunks.length, 5);
      assert.deepEqual(
        chunks.map((chunk) => chunk.titleGuess),
        ["SUMMER SALAD", "Pinch of salt", "COZY SOUP", "Directions", "1 cup flour"]
      );
      chunks.forEach((chunk) => {
        assert.ok(chunk.confidence > 0.6);
      });
    });

    it("handles ingredient lines with unit tokens but no leading numbers", () => {
      const cookbook = [
        "MORNING OATS",
        "",
        "cup rolled oats",
        "tbsp chia seeds",
        "pinch salt",
        "",
        "Stir together and soak overnight.",
        "",
        "HERB TEA",
        "",
        "tsp dried chamomile",
        "cup hot water",
        "",
        "Steep for five minutes.",
      ].join("\n");

      const { chunks } = segment(normalize(cookbook).lines);

      assert.equal(chunks.length, 3);
      assert.deepEqual(chunks.map((chunk) => chunk.titleGuess), [
        "MORNING OATS",
        "pinch salt",
        "HERB TEA",
      ]);
      chunks.forEach((chunk) => {
        assert.ok(chunk.confidence > 0.6);
      });
    });
  });

  describe("extract", () => {
    it("returns ingredients and instructions when headings are missing", () => {
      const text = [
        "SIMPLE SALAD",
        "2 cups mixed greens",
        "1 tbsp olive oil",
        "Pinch of salt",
        "Toss everything together and serve.",
      ].join("\n");
      const lines = normalize(text).lines;
      const [chunk] = segment(lines).chunks;

      const recipe = extract(chunk, lines);

      assert.ok(recipe.ingredients.includes("2 cups mixed greens"));
      assert.ok(recipe.ingredients.includes("1 tbsp olive oil"));
      assert.ok(recipe.ingredients.includes("Pinch of salt"));
      assert.ok(!recipe.ingredients.includes("SIMPLE SALAD"));
      assert.ok(recipe.instructions.join(" ").includes("Toss"));
    });

    it("handles ingredients before a preparation heading", () => {
      const text = [
        "QUICK TOAST",
        "2 slices bread",
        "1 tbsp butter",
        "Preparation:",
        "Toast the bread until golden.",
        "Spread with butter.",
      ].join("\n");
      const lines = normalize(text).lines;
      const [chunk] = segment(lines).chunks;

      const recipe = extract(chunk, lines);

      assert.deepEqual(recipe.ingredients, []);
      assert.ok(recipe.instructions.includes("2 slices bread"));
      assert.ok(recipe.instructions.includes("1 tbsp butter"));
      assert.ok(recipe.instructions[2].includes("Toast"));
    });

    it("keeps simple ingredient phrases without quantities", () => {
      const text = ["SPICE BLEND", "Salt and pepper", "Mix well."].join("\n");
      const lines = normalize(text).lines;
      const [chunk] = segment(lines).chunks;

      const recipe = extract(chunk, lines);

      assert.ok(recipe.ingredients.includes("Salt and pepper"));
      assert.ok(recipe.instructions.join(" ").includes("Mix"));
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

      assert.equal(recipe.$schema, "https://soustack.ai/schemas/recipe.schema.json");
      assert.equal(recipe["@type"], "Recipe");
      assert.equal(recipe.level, "lite");
      assert.equal(recipe.name, intermediate.title);
      assert.deepEqual(recipe.ingredients, intermediate.ingredients);
      assert.deepEqual(recipe.instructions, intermediate.instructions);
      assert.deepEqual(recipe.stacks, {});
      assert.deepEqual(recipe["x-ingest"], {
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

      const indexPath = path.join(tempDir, "index.json");
      const recipePath = path.join(tempDir, "recipes", "test-recipe.soustack.json");

      const indexRaw = await fs.readFile(indexPath, "utf-8");
      const indexPayload = JSON.parse(indexRaw) as Array<{ name: string; slug: string; path: string }>;

      assert.deepEqual(indexPayload, [
        {
          name: "Test Recipe",
          slug: "test-recipe",
          path: "recipes/test-recipe.soustack.json",
        },
      ]);

      const recipeRaw = await fs.readFile(recipePath, "utf-8");
      const recipePayload = JSON.parse(recipeRaw) as SoustackRecipe;

      assert.equal(recipePayload.name, "Test Recipe");
      assert.deepEqual(recipePayload.ingredients, ["1 cup sugar"]);
    });
  });

  describe("validate", () => {
    beforeEach(async () => {
      await initValidator();
    });

    it("accepts a minimal valid recipe", () => {
      const recipe: SoustackRecipe = {
        $schema: "https://soustack.ai/schemas/recipe.schema.json",
        level: "recipe",
        name: "Test Recipe",
        stacks: [],
        ingredients: ["1 cup sugar"],
        instructions: ["Mix."],
        "x-ingest": {
          pipelineVersion: "0.1.0",
        },
      };

      const result = validate(recipe);

      assert.equal(result.ok, false);
      assert.ok(result.errors.some((error) => error.includes("@type")));
    });

    it("rejects a recipe missing a name", () => {
      const recipe = {
        $schema: "https://soustack.ai/schemas/recipe.schema.json",
        level: "recipe",
        stacks: [],
        ingredients: ["1 cup sugar"],
        instructions: ["Mix."],
        "x-ingest": {
          pipelineVersion: "0.1.0",
        },
      } as unknown as SoustackRecipe;

      const result = validate(recipe);

      assert.equal(result.ok, false);
      assert.ok(result.errors.some((error) => error.includes("@type")));
      assert.ok(result.errors.some((error) => error.includes("name")));
    });
  });
});
