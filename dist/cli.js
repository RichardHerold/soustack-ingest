"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const pipeline_1 = require("./pipeline");
const adapters_1 = require("./adapters");
async function ingest(inputPath, outDir) {
    await (0, pipeline_1.initValidator)();
    const adapterOutput = await (0, adapters_1.loadInput)(inputPath);
    const normalized = (0, pipeline_1.normalize)(adapterOutput.text);
    const segmented = (0, pipeline_1.segment)(normalized.lines);
    const recipes = [];
    const errors = [];
    for (const chunk of segmented.chunks) {
        const intermediate = (0, pipeline_1.extract)(chunk, normalized.lines);
        // Skip recipes with empty ingredients or instructions
        if (intermediate.ingredients.length === 0 || intermediate.instructions.length === 0) {
            errors.push(`${intermediate.title}: Missing ingredients or instructions`);
            continue;
        }
        const recipe = (0, pipeline_1.toSoustack)(intermediate, { sourcePath: adapterOutput.meta.sourcePath });
        const result = (0, pipeline_1.validate)(recipe);
        if (result.ok) {
            recipes.push(recipe);
        }
        else {
            errors.push(...result.errors.map((error) => `${recipe.name}: ${error}`));
        }
    }
    await (0, pipeline_1.emit)(recipes, outDir);
    console.log(`Ingested ${recipes.length} recipe(s) from ${inputPath}.`);
    if (errors.length > 0) {
        console.log("Validation errors:");
        for (const error of errors) {
            console.log(`- ${error}`);
        }
    }
}
const program = new commander_1.Command();
program
    .name("soustack-ingest")
    .description("Ingest recipe sources into Soustack JSON")
    .command("ingest")
    .argument("<inputPath>", "Path to the source file")
    .requiredOption("--out <outDir>", "Output directory")
    .action(async (inputPath, options) => {
    await ingest(inputPath, options.out);
});
program.parseAsync(process.argv).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
