import { SCHEMA_URL } from "./schema";
import { IntermediateRecipe, PrepMetadata, SoustackRecipe } from "./types";

export type NormalizationContext = {
  sourcePath?: string;
  timestamp?: string;
  toolVersion?: string;
};

const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "off",
  "on",
  "onto",
  "or",
  "over",
  "per",
  "the",
  "to",
  "via",
  "with",
]);

function toTitleCase(rawTitle: string): string {
  const words = rawTitle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return rawTitle;
  }

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const isEdge = index === 0 || index === words.length - 1;
      if (!isEdge && MINOR_WORDS.has(lower)) {
        return lower;
      }

      const match = lower.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}])(.*)$/u);
      if (!match) {
        return lower;
      }

      const [, leading, firstChar, rest] = match;
      return `${leading}${firstChar.toUpperCase()}${rest}`;
    })
    .join(" ");
}

export function toSoustack(
  intermediate: IntermediateRecipe,
  options?: { sourcePath?: string }
): SoustackRecipe {
  const ingredients = Array.isArray(intermediate.ingredients)
    ? intermediate.ingredients.map((value) => `${value}`)
    : [];
  const instructions = Array.isArray(intermediate.instructions)
    ? intermediate.instructions.map((value) => `${value}`)
    : [];

  const metadata: SoustackRecipe["metadata"] = {
    originalTitle: intermediate.title,
    ingest: {
      pipelineVersion: "0.1.1",
      sourcePath: options?.sourcePath,
      sourceLines: {
        start: intermediate.source.startLine,
        end: intermediate.source.endLine,
      },
    },
    ...(intermediate.instructionParagraphs?.length
      ? { instructionParagraphs: intermediate.instructionParagraphs }
      : {}),
  };

  if (intermediate.source.author) {
    metadata.author = intermediate.source.author;
  }

  if (
    Array.isArray(intermediate.instructionParagraphs) &&
    intermediate.instructionParagraphs.length > 0
  ) {
    metadata.instructionParagraphs = intermediate.instructionParagraphs.map((value) => `${value}`);
  }

  const prepMetadata: PrepMetadata | undefined =
    intermediate.prepSection || intermediate.ingredientPrep
      ? {
          section: intermediate.prepSection,
          ingredients: intermediate.ingredientPrep,
          generatedAt: new Date().toISOString(),
        }
      : undefined;

  return {
    $schema: SCHEMA_URL,
    profile: "lite",
    name: toTitleCase(intermediate.title),
    stacks: {},
    ingredients,
    instructions,
    ...(prepMetadata ? { "x-prep": prepMetadata } : {}),
    metadata,
  };
}

/**
 * Normalizes a recipe to ensure it conforms to the canonical Soustack recipe shape.
 * This function ensures all required top-level keys exist with correct defaults.
 */
export function normalizeRecipeOutput(
  recipe: SoustackRecipe,
  context?: NormalizationContext
): SoustackRecipe {
  const normalized: SoustackRecipe = {
    $schema: SCHEMA_URL,
    profile: "lite",
    name: recipe.name || "Untitled Recipe",
    stacks: typeof recipe.stacks === "object" && recipe.stacks !== null ? recipe.stacks : {},
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
  };

  if (recipe["x-prep"]) {
    normalized["x-prep"] = recipe["x-prep"];
  }

  normalized.metadata = {
    ...recipe.metadata,
    ingest: {
      ...recipe.metadata?.ingest,
      ...(context?.sourcePath !== undefined ? { sourcePath: context.sourcePath } : {}),
      ...(context?.timestamp !== undefined ? { timestamp: context.timestamp } : {}),
      ...(context?.toolVersion !== undefined ? { toolVersion: context.toolVersion } : {}),
      warnings: recipe.metadata?.ingest?.warnings || [],
    },
  };

  return normalized;
}
