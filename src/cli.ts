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

type IngestOptions = {
  debugSegmentation?: boolean;
};

export async function ingest(
  inputPath: string,
  outDir: string,
  options: IngestOptions = {},
): Promise<void> {
  await initValidator();
  const adapterOutput = await loadInput(inputPath);
  const normalized = normalize(adapterOutput.text);
  const segmented = segment(normalized.lines, { debug: options.debugSegmentation });
  const chunksFound = segmented.chunks.length;

  const recipes: SoustackRecipe[] = [];
  const errors: string[] = [];
  const skipReasons = new Map<string, number>();

  const recordSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  };

  let intermediatesProduced = 0;
  let skippedEmpty = 0;
  let skippedValidation = 0;

  if (options.debugSegmentation) {
    console.log("Segmentation debug:");
    for (const chunk of segmented.chunks) {
      console.log(
        `- Lines ${chunk.startLine}-${chunk.endLine}: ${chunk.segmentationReason ?? "unknown"}`,
      );
    }
  }

  for (const chunk of segmented.chunks) {
    const intermediate = extract(chunk, normalized.lines);
    intermediatesProduced += 1;
    const missingIngredients = intermediate.ingredients.length === 0;
    const missingInstructions = intermediate.instructions.length === 0;
    const warningMessages: string[] = [];

    if (missingIngredients && missingInstructions) {
      errors.push(`${intermediate.title}: Missing ingredients and instructions`);
      skippedEmpty += 1;
      recordSkip("empty ingredients/instructions");
      continue;
    }

    if (missingIngredients) {
      warningMessages.push(`${intermediate.title}: Missing ingredients`);
    }
    if (missingInstructions) {
      warningMessages.push(`${intermediate.title}: Missing instructions`);
    }
    if (warningMessages.length > 0) {
      for (const warning of warningMessages) {
        console.error(`Warning: ${warning}`);
      }
    }
    const recipe = toSoustack(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
    if (warningMessages.length > 0) {
      recipe.metadata = {
        ...(recipe.metadata ?? {}),
        ingest: {
          ...(recipe.metadata?.ingest ?? {}),
          warnings: [...(recipe.metadata?.ingest?.warnings ?? []), ...warningMessages],
        },
      };
    }
    const result = validate(recipe);
    if (result.ok) {
      recipes.push(recipe);
      continue;
    }

    if (warningMessages.length > 0) {
      const filteredErrors = result.errors.filter((error) => {
        if (missingIngredients && error.includes("/ingredients")) {
          return false;
        }
        if (missingInstructions && error.includes("/instructions")) {
          return false;
        }
        return true;
      });
      if (filteredErrors.length === 0) {
        recipes.push(recipe);
        continue;
      }
      errors.push(...filteredErrors.map((error) => `${recipe.name}: ${error}`));
    } else {
      errors.push(...result.errors.map((error) => `${recipe.name}: ${error}`));
    }
    skippedValidation += 1;
    recordSkip("validation");
  }

  await emit(recipes, outDir);

  const emittedCount = recipes.length;
  console.log(
    [
      `Chunks found: ${chunksFound}`,
      `Intermediates produced: ${intermediatesProduced}`,
      `Skipped empty ingredients/instructions: ${skippedEmpty}`,
      `Skipped due to validation: ${skippedValidation}`,
      `Emitted: ${emittedCount}`,
    ].join("\n"),
  );
  console.log(`Ingested ${emittedCount} recipe(s) from ${inputPath}.`);
  if (errors.length > 0) {
    console.log("Validation errors:");
    for (const error of errors) {
      console.log(`- ${error}`);
    }
  }

  if (emittedCount === 0) {
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

if (require.main === module) {
  program
    .name("soustack-ingest")
    .description("Ingest recipe sources into Soustack JSON")
    .command("ingest")
    .argument("<inputPath>", "Path to the source file")
    .requiredOption("--out <outDir>", "Output directory")
    .option("--debug-segmentation", "Log segmentation debug details")
    .action(
      async (
        inputPath: string,
        options: { out: string; debugSegmentation?: boolean },
      ) => {
        await ingest(inputPath, options.out, {
          debugSegmentation: options.debugSegmentation,
        });
      }
    );

  program.parseAsync(process.argv).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
