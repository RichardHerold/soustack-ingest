import { SCHEMA_URL } from "./schema";
import { IntermediateRecipe, PrepMetadata, SoustackRecipe } from "./types";

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
  };

  if (intermediate.source.author) {
    metadata.author = intermediate.source.author;
  }

  if (intermediate.instructionParagraphs?.length) {
    metadata.instructionParagraphs = intermediate.instructionParagraphs;
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
