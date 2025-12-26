"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingest = ingest;
const commander_1 = require("commander");
const pipeline_1 = require("./pipeline");
const adapters_1 = require("./adapters");
async function ingest(inputPath, outDir, options = {}) {
    await (0, pipeline_1.initValidator)();
    const adapterOutput = await (0, adapters_1.loadInput)(inputPath);
    const normalized = (0, pipeline_1.normalize)(adapterOutput.text);
    const segmented = (0, pipeline_1.segment)(normalized.lines, { debug: options.debugSegmentation });
    const chunksFound = segmented.chunks.length;
    const recipes = [];
    const errors = [];
    const skipReasons = new Map();
    const recordSkip = (reason) => {
        skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    };
    let intermediatesProduced = 0;
    let skippedEmpty = 0;
    let skippedValidation = 0;
    if (options.debugSegmentation) {
        console.log("Segmentation debug:");
        for (const chunk of segmented.chunks) {
            console.log(`- Lines ${chunk.startLine}-${chunk.endLine}: ${chunk.segmentationReason ?? "unknown"}`);
        }
    }
    for (const chunk of segmented.chunks) {
        const intermediate = (0, pipeline_1.extract)(chunk, normalized.lines, {
            prepExtractionMode: options.prepExtractionMode,
        });
        intermediatesProduced += 1;
        const missingIngredients = intermediate.ingredients.length === 0;
        const missingInstructions = intermediate.instructions.length === 0;
        const warningMessages = [];
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
        const recipe = (0, pipeline_1.toSoustack)(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
        if (warningMessages.length > 0) {
            recipe.metadata = {
                ...(recipe.metadata ?? {}),
                ingest: {
                    ...(recipe.metadata?.ingest ?? {}),
                    warnings: [...(recipe.metadata?.ingest?.warnings ?? []), ...warningMessages],
                },
            };
        }
        const result = (0, pipeline_1.validate)(recipe);
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
        }
        else {
            errors.push(...result.errors.map((error) => `${recipe.name}: ${error}`));
        }
        skippedValidation += 1;
        recordSkip("validation");
    }
    await (0, pipeline_1.emit)(recipes, outDir);
    const emittedCount = recipes.length;
    console.log([
        `Chunks found: ${chunksFound}`,
        `Intermediates produced: ${intermediatesProduced}`,
        `Skipped empty ingredients/instructions: ${skippedEmpty}`,
        `Skipped due to validation: ${skippedValidation}`,
        `Emitted: ${emittedCount}`,
    ].join("\n"));
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
        }
        else {
            for (const [reason, count] of sortedReasons) {
                console.log(`- ${reason}: ${count}`);
            }
        }
        process.exitCode = 1;
    }
}
const program = new commander_1.Command();
if (require.main === module) {
    program
        .name("soustack-ingest")
        .description("Ingest recipe sources into Soustack JSON")
        .command("ingest")
        .argument("<inputPath>", "Path to the source file")
        .requiredOption("--out <outDir>", "Output directory")
        .option("--debug-segmentation", "Log segmentation debug details")
        .option("--prep-extraction-mode <mode>", "Ingredient prep extraction mode (conservative|aggressive)", "conservative")
        .action(async (inputPath, options) => {
        const prepExtractionMode = parsePrepExtractionMode(options.prepExtractionMode);
        await ingest(inputPath, options.out, {
            debugSegmentation: options.debugSegmentation,
            prepExtractionMode,
        });
    });
    program.parseAsync(process.argv).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
function parsePrepExtractionMode(mode) {
    if (mode === "conservative" || mode === "aggressive") {
        return mode;
    }
    if (!mode) {
        return "conservative";
    }
    throw new Error(`Invalid --prep-extraction-mode "${mode}". Expected "conservative" or "aggressive".`);
}
