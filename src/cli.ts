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

  for (const chunk of segmented.chunks) {
    const intermediate = extract(chunk, normalized.lines);
    // Skip recipes with empty ingredients or instructions
    if (intermediate.ingredients.length === 0 || intermediate.instructions.length === 0) {
      errors.push(`${intermediate.title}: Missing ingredients or instructions`);
      continue;
    }
    const recipe = toSoustack(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
    const result = validate(recipe);
    if (result.ok) {
      recipes.push(recipe);
    } else {
      errors.push(...result.errors.map((error) => `${recipe.name}: ${error}`));
    }
  }

  await emit(recipes, outDir);

  console.log(`Ingested ${recipes.length} recipe(s) from ${inputPath}.`);
  if (errors.length > 0) {
    console.log("Validation errors:");
    for (const error of errors) {
      console.log(`- ${error}`);
    }
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
