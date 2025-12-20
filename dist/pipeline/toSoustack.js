"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSoustack = toSoustack;
const SCHEMA_URL = "https://soustack.ai/schemas/recipe.schema.json";
function toSoustack(intermediate, options) {
    return {
        "@type": "Recipe",
        $schema: SCHEMA_URL,
        level: "lite",
        name: intermediate.title,
        stacks: {},
        ingredients: intermediate.ingredients,
        instructions: intermediate.instructions,
        "x-ingest": {
            pipelineVersion: "0.1.0",
            sourcePath: options?.sourcePath,
            sourceLines: {
                start: intermediate.source.startLine,
                end: intermediate.source.endLine,
            },
        },
    };
}
