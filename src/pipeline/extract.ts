import { Chunk, IntermediateRecipe, Line } from "./types";

function sliceLines(lines: Line[], startLine: number, endLine: number): Line[] {
  return lines.filter((line) => line.n >= startLine && line.n <= endLine);
}

function splitSections(lines: Line[]): {
  ingredients: string[];
  instructions: string[];
} {
  const ingredients: string[] = [];
  const instructions: string[] = [];
  let mode: "ingredients" | "instructions" | "unknown" = "unknown";

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) {
      continue;
    }

    const header = text.toLowerCase();
    if (header === "ingredients") {
      mode = "ingredients";
      continue;
    }
    if (header === "instructions" || header === "directions" || header === "method") {
      mode = "instructions";
      continue;
    }

    if (mode === "ingredients") {
      ingredients.push(text.replace(/^[-*]\s+/, "").trim());
      continue;
    }

    if (mode === "instructions") {
      instructions.push(text.replace(/^\d+\.\s+/, "").trim());
      continue;
    }

    instructions.push(text);
  }

  return {
    ingredients,
    instructions,
  };
}

export function extract(chunk: Chunk, lines: Line[]): IntermediateRecipe {
  const relevantLines = sliceLines(lines, chunk.startLine, chunk.endLine);
  const { ingredients, instructions } = splitSections(relevantLines);
  const fallbackTitle = chunk.titleGuess ?? "Untitled Recipe";

  return {
    title: fallbackTitle,
    ingredients,
    instructions,
    source: {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      evidence: chunk.evidence,
    },
  };
}
