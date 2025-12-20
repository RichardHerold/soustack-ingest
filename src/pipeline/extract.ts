import { Chunk, IntermediateRecipe, Line } from "./types";

function sliceLines(lines: Line[], startLine: number, endLine: number): Line[] {
  return lines.filter((line) => line.n >= startLine && line.n <= endLine);
}

function splitSections(lines: Line[]): {
  ingredients: string[];
  instructions: string[];
} {
  const trimmedLines = lines
    .map((line) => line.text.trim())
    .filter((text) => Boolean(text));
  const ingredients: string[] = [];
  const instructions: string[] = [];
  let mode: "ingredients" | "instructions" | "unknown" = "unknown";

  const normalizeHeader = (text: string) => text.toLowerCase().replace(/[:\s]+$/, "");
  const isIngredientHeader = (text: string) => normalizeHeader(text) === "ingredients";
  const isInstructionHeader = (text: string) =>
    /^(instructions?|directions|method|preparation|steps?|step\s*\d+)$/i.test(
      normalizeHeader(text),
    );
  const cleanIngredient = (text: string) => text.replace(/^[-*]\s+/, "").trim();
  const cleanInstruction = (text: string) =>
    text
      .replace(/^(step\s*\d+[:.)]?\s*)/i, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
  const isIngredientLike = (text: string) =>
    /^[-*]\s+/.test(text) ||
    /^(\d+([/-]\d+)?|\d+\s+\d\/\d)\s+\w+/.test(text) ||
    /^\d+\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|grams?|kg|ml|l)\b/i.test(
      text,
    );
  const isInstructionLike = (text: string) =>
    /^\d+[.)]\s+/.test(text) || /[.!?]\s*$/.test(text) || /\w+\s+\w+/.test(text);

  const hasExplicitHeadings = trimmedLines.some(
    (text) => isIngredientHeader(text) || isInstructionHeader(text),
  );

  if (hasExplicitHeadings) {
    for (const text of trimmedLines) {
      if (isIngredientHeader(text)) {
        mode = "ingredients";
        continue;
      }
      if (isInstructionHeader(text)) {
        mode = "instructions";
        continue;
      }

      if (mode === "ingredients") {
        ingredients.push(cleanIngredient(text));
        continue;
      }

      if (mode === "instructions") {
        instructions.push(cleanInstruction(text));
        continue;
      }

      instructions.push(text);
    }
  } else {
    for (const text of trimmedLines) {
      const ingredientLike = isIngredientLike(text);
      const instructionLike = isInstructionLike(text);

      if (mode === "unknown") {
        if (ingredientLike) {
          mode = "ingredients";
          ingredients.push(cleanIngredient(text));
          continue;
        }
        if (instructionLike) {
          mode = "instructions";
          instructions.push(cleanInstruction(text));
          continue;
        }
        continue;
      }

      if (mode === "ingredients") {
        if (instructionLike && !ingredientLike) {
          mode = "instructions";
          instructions.push(cleanInstruction(text));
          continue;
        }
        ingredients.push(cleanIngredient(text));
        continue;
      }

      instructions.push(cleanInstruction(text));
    }
  }

  if (ingredients.length === 0 && trimmedLines.length > 0) {
    ingredients.push(cleanIngredient(trimmedLines[0]));
    for (const text of trimmedLines.slice(1)) {
      instructions.push(cleanInstruction(text));
    }
  }

  if (instructions.length === 0 && ingredients.length > 1) {
    const lastIngredient = ingredients.pop();
    if (lastIngredient) {
      instructions.push(cleanInstruction(lastIngredient));
    }
  }

  if (instructions.length === 0 && ingredients.length === 1) {
    instructions.push(ingredients[0]);
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
