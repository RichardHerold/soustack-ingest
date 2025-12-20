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
  const bulletRegex = /^[-*•·‣◦–—]\s+/;
  const cleanIngredient = (text: string) => text.replace(bulletRegex, "").trim();
  const cleanInstruction = (text: string) =>
    text
      .replace(/^(step\s*\d+[:.)]?\s*)/i, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
  const ingredientStarters = ["salt", "pepper", "pinch", "dash"];
  const isIngredientLike = (text: string) =>
    bulletRegex.test(text) ||
    /^(\d+([/-]\d+)?|\d+\s+\d\/\d)\s+\w+/.test(text) ||
    /^\d+\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|grams?|kg|ml|l)\b/i.test(
      text,
    ) ||
    ingredientStarters.some((starter) => text.toLowerCase().startsWith(starter));
  const isInstructionLike = (text: string) =>
    /^\d+[.)]\s+/.test(text) || /[.!?]\s*$/.test(text) || /\w+\s+\w+/.test(text);
  const isClearInstructionLike = (text: string) =>
    /[.!?]\s*$/.test(text) ||
    /^(mix|stir|cook|bake|toast|toss|combine|whisk|simmer|bring|add|preheat|heat|serve)\b/i.test(
      text,
    );

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
    const sample = trimmedLines.slice(0, 5);
    const sampleIngredientCount = sample.filter((text) => isIngredientLike(text)).length;
    const sampleInstructionCount = sample.filter((text) => isInstructionLike(text)).length;
    if (sampleIngredientCount > 0 && sampleIngredientCount >= sampleInstructionCount) {
      mode = "ingredients";
    }

    let ingredientCount = 0;
    let instructionCount = 0;

    for (const text of trimmedLines) {
      if (isInstructionHeader(text)) {
        mode = "instructions";
        continue;
      }

      const ingredientLike = isIngredientLike(text);
      const instructionLike = isInstructionLike(text) || isClearInstructionLike(text);

      if (mode === "unknown") {
        if (ingredientLike && !instructionLike) {
          mode = "ingredients";
          ingredients.push(cleanIngredient(text));
          ingredientCount += 1;
          continue;
        }
        if (instructionLike) {
          mode = "instructions";
          instructions.push(cleanInstruction(text));
          instructionCount += 1;
          continue;
        }
        continue;
      }

      if (mode === "ingredients") {
        if (instructionLike && ingredientCount >= 2) {
          mode = "instructions";
          instructions.push(cleanInstruction(text));
          instructionCount += 1;
          continue;
        }
        ingredients.push(cleanIngredient(text));
        ingredientCount += 1;
        continue;
      }

      instructions.push(cleanInstruction(text));
      instructionCount += 1;
    }

    if (ingredients.length === 0 && trimmedLines.length > 1) {
      ingredients.length = 0;
      instructions.length = 0;
      ingredientCount = 0;
      instructionCount = 0;
      let inInstructions = false;

      for (const text of trimmedLines) {
        const ingredientLike = isIngredientLike(text);
        const instructionLike = isInstructionLike(text) || isClearInstructionLike(text);

        if (!inInstructions) {
          if (instructionLike && ingredientCount >= 1) {
            instructionCount += 1;
            if (instructionCount > ingredientCount) {
              inInstructions = true;
              instructions.push(cleanInstruction(text));
              continue;
            }
          }

          if (ingredientLike || !instructionLike) {
            ingredients.push(cleanIngredient(text));
            ingredientCount += 1;
            continue;
          }

          inInstructions = true;
          instructionCount += 1;
          instructions.push(cleanInstruction(text));
          continue;
        }

        instructions.push(cleanInstruction(text));
        instructionCount += 1;
      }
    }
  }

  if (instructions.length === 0 && ingredients.length > 1) {
    const lastIngredient = ingredients[ingredients.length - 1];
    if (lastIngredient && isClearInstructionLike(lastIngredient)) {
      ingredients.pop();
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
  const titleGuess = chunk.titleGuess?.trim();
  let title = titleGuess ?? "Untitled Recipe";
  let contentLines = relevantLines;

  if (titleGuess) {
    const titleIndex = relevantLines.findIndex((line) => line.text.trim() === titleGuess);
    if (titleIndex >= 0) {
      contentLines = relevantLines.filter((_, index) => index !== titleIndex);
    }
  } else {
    const firstNonEmptyIndex = relevantLines.findIndex((line) => line.text.trim().length > 0);
    if (firstNonEmptyIndex >= 0) {
      title = relevantLines[firstNonEmptyIndex].text.trim();
      contentLines = relevantLines.filter((_, index) => index !== firstNonEmptyIndex);
    }
  }

  const { ingredients, instructions } = splitSections(contentLines);

  return {
    title,
    ingredients,
    instructions,
    source: {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      evidence: chunk.evidence,
    },
  };
}
