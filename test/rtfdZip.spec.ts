import AdmZip from "adm-zip";
import { existsSync, promises as fs } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { loadInput } from "../src/adapters";
import { emit } from "../src/pipeline/emit";
import { extract } from "../src/pipeline/extract";
import { normalize } from "../src/pipeline/normalize";
import { segment } from "../src/pipeline/segment";
import { toSoustack } from "../src/pipeline/toSoustack";
import { validate } from "../src/pipeline/validate";
import { SoustackRecipe } from "../src/pipeline/types";

const fixturePath = path.join(__dirname, "fixtures", "sample.rtf");

describe("rtfd zip adapter", () => {
  it("converts a tiny rtf payload to plain text", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soustack-rtfd-test-"));
    const zipPath = path.join(tempDir, "sample.rtfd.zip");
    const rtfContents = await fs.readFile(fixturePath);
    const zip = new AdmZip();
    zip.addFile("Sample.rtfd/TXT.rtf", rtfContents);
    zip.writeZip(zipPath);

    const output = await loadInput(zipPath);

    expect(output.kind).toBe("text");
    expect(output.text.toLowerCase()).toContain("test recipe");
    expect(output.meta.sourcePath).toBe(zipPath);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe("rtfd zip integration", () => {
  const realPath = "/mnt/data/bowman cookbook.rtfd.zip";
  const runTest = existsSync(realPath) ? it : it.skip;

  runTest("ingests the cookbook end-to-end when present", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "soustack-rtfd-it-"));
    const adapterOutput = await loadInput(realPath);
    const normalized = normalize(adapterOutput.text);
    const segmented = segment(normalized.lines);

    const recipes: SoustackRecipe[] = [];
    for (const chunk of segmented.chunks) {
      const intermediate = extract(chunk, normalized.lines);
      const recipe = toSoustack(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
      const result = validate(recipe);
      if (result.ok) {
        recipes.push(recipe);
      }
    }

    await emit(recipes, tempDir);

    const indexPath = path.join(tempDir, "out", "index.json");
    const recipesDir = path.join(tempDir, "out", "recipes");

    await expect(fs.access(indexPath)).resolves.toBeUndefined();
    const recipeFiles = await fs.readdir(recipesDir);
    expect(recipeFiles.length).toBeGreaterThanOrEqual(2);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
