import { Command } from "commander";
import {
  emit,
  extract,
  normalize,
  segment,
  toSoustack,
  normalizeRecipeOutput,
  initValidator,
  validate,
  isValidationErrorAcceptable,
  SoustackRecipe,
  PrepExtractionMode,
  IngestWarning,
} from "./pipeline";
import { loadInput } from "./adapters";
import { readFileSync } from "fs";
import { join } from "path";

type IngestOptions = {
  debugSegmentation?: boolean;
  prepExtractionMode?: PrepExtractionMode;
};

function getToolVersion(): string | undefined {
  try {
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version;
  } catch {
    return undefined;
  }
}

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
  const timestamp = new Date().toISOString();
  const toolVersion = getToolVersion();

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
    const intermediate = extract(chunk, normalized.lines, {
      prepExtractionMode: options.prepExtractionMode,
    });
    intermediatesProduced += 1;
    const missingIngredients = intermediate.ingredients.length === 0;
    const missingInstructions = intermediate.instructions.length === 0;
    const missingName = !intermediate.title || intermediate.title.trim().length === 0;
    const warnings: IngestWarning[] = [];

    if (missingIngredients && missingInstructions) {
      const skipMessage = `${intermediate.title || "Untitled"}: Missing ingredients and instructions`;
      errors.push(skipMessage);
      skippedEmpty += 1;
      recordSkip("empty ingredients/instructions");
      console.error(`Skipping recipe: ${skipMessage}`);
      continue;
    }

    if (missingIngredients) {
      warnings.push({
        code: "MISSING_INGREDIENTS",
        message: "Recipe is missing an ingredients list",
        source: intermediate.title || "unknown",
      });
    }
    if (missingInstructions) {
      warnings.push({
        code: "MISSING_INSTRUCTIONS",
        message: "Recipe is missing instruction steps",
        source: intermediate.title || "unknown",
      });
    }
    if (missingName) {
      warnings.push({
        code: "MISSING_NAME",
        message: "Recipe is missing a name/title",
      });
    }

    const recipe = toSoustack(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
    
    const normalizedRecipe = normalizeRecipeOutput(recipe, {
      sourcePath: adapterOutput.meta.sourcePath,
      timestamp,
      toolVersion,
    });

    if (warnings.length > 0) {
      normalizedRecipe.metadata = {
        ...normalizedRecipe.metadata,
        ingest: {
          ...normalizedRecipe.metadata?.ingest,
          warnings: [...(normalizedRecipe.metadata?.ingest?.warnings || []), ...warnings],
        },
      };
    }

    const result = validate(normalizedRecipe);
    if (result.ok) {
      recipes.push(normalizedRecipe);
      continue;
    }

    const { acceptable, fatalErrors } = isValidationErrorAcceptable(
      result.errors,
      warnings.length > 0
    );

    if (acceptable) {
      recipes.push(normalizedRecipe);
      continue;
    }

    errors.push(...fatalErrors.map((error) => `${normalizedRecipe.name}: ${error}`));
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
    console.error(
      "No recipes emitted (0). Check that the source contains ingredients + instructions headings or recognizable structure.",
    );
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
    .option(
      "--prep-extraction-mode <mode>",
      "Ingredient prep extraction mode (conservative|aggressive)",
      "conservative",
    )
    .action(
      async (
        inputPath: string,
        options: {
          out: string;
          debugSegmentation?: boolean;
          prepExtractionMode?: string;
        },
      ) => {
        const prepExtractionMode = parsePrepExtractionMode(options.prepExtractionMode);
        await ingest(inputPath, options.out, {
          debugSegmentation: options.debugSegmentation,
          prepExtractionMode,
        });
      }
    );

  program.parseAsync(process.argv).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function parsePrepExtractionMode(mode?: string): PrepExtractionMode {
  if (mode === "conservative" || mode === "aggressive") {
    return mode;
  }
  if (!mode) {
    return "conservative";
  }
  throw new Error(
    `Invalid --prep-extraction-mode "${mode}". Expected "conservative" or "aggressive".`,
  );
}
