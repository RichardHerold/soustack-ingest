import { Command } from "commander";
import {
  emit,
  extract,
  normalize,
  segment,
  toSoustack,
  initValidator,
  validate,
  SoustackRecipe,
} from "./pipeline";
import { loadInput } from "./adapters";

async function ingest(inputPath: string, outDir: string): Promise<void> {
  await initValidator();
  const adapterOutput = await loadInput(inputPath);
  const normalized = normalize(adapterOutput.text);
  const segmented = segment(normalized.lines);

  const recipes: SoustackRecipe[] = [];
  const errors: string[] = [];
  const skipReasons = new Map<string, number>();

  const recordSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  };

  let intermediatesProduced = 0;
  let skippedEmpty = 0;
  let skippedValidation = 0;

  for (const chunk of segmented.chunks) {
    const intermediate = extract(chunk, normalized.lines);
    intermediatesProduced += 1;
    // Skip recipes with empty ingredients or instructions
    if (intermediate.ingredients.length === 0 || intermediate.instructions.length === 0) {
      errors.push(`${intermediate.title}: Missing ingredients or instructions`);
      skippedEmpty += 1;
      recordSkip("empty ingredients/instructions");
      continue;
    }
    const recipe = toSoustack(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
    const result = validate(recipe);
    if (result.ok) {
      recipes.push(recipe);
    } else {
      errors.push(...result.errors.map((error) => `${recipe.name}: ${error}`));
      skippedValidation += 1;
      recordSkip("validation");
    }
  }

  await emit(recipes, outDir);

  console.log(
    [
      `Chunks found: ${segmented.chunks.length}`,
      `Intermediates produced: ${intermediatesProduced}`,
      `Skipped empty ingredients/instructions: ${skippedEmpty}`,
      `Skipped due to validation: ${skippedValidation}`,
      `Emitted: ${recipes.length}`,
    ].join("\n"),
  );
  console.log(`Ingested ${recipes.length} recipe(s) from ${inputPath}.`);
  if (errors.length > 0) {
    console.log("Validation errors:");
    for (const error of errors) {
      console.log(`- ${error}`);
    }
  }

  if (recipes.length === 0) {
    const sortedReasons = [...skipReasons.entries()].sort((a, b) => b[1] - a[1]);
    console.log("Skip summary:");
    if (sortedReasons.length === 0) {
      console.log("- No skip reasons recorded.");
    } else {
      for (const [reason, count] of sortedReasons) {
        console.log(`- ${reason}: ${count}`);
      }
    }
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("soustack-ingest")
  .description("Ingest recipe sources into Soustack JSON")
  .command("ingest")
  .argument("<inputPath>", "Path to the source file")
  .requiredOption("--out <outDir>", "Output directory")
  .action(async (inputPath: string, options: { out: string }) => {
    await ingest(inputPath, options.out);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
