import { IntermediateRecipe, SoustackRecipe } from "./types";

const SCHEMA_URL = "https://soustack.spec/soustack.schema.json";

export function toSoustack(
  intermediate: IntermediateRecipe,
  options?: { sourcePath?: string }
): SoustackRecipe {
  return {
    $schema: SCHEMA_URL,
    profile: "lite",
    name: intermediate.title,
    stacks: {},
    ingredients: intermediate.ingredients,
    instructions: intermediate.instructions,
    metadata: {
      ingest: {
        pipelineVersion: "0.1.0",
        sourcePath: options?.sourcePath,
        sourceLines: {
          start: intermediate.source.startLine,
          end: intermediate.source.endLine,
        },
      },
    },
  };
}
