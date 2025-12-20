import { SoustackRecipe, ValidationResult } from "./types";

export function validate(recipe: SoustackRecipe): ValidationResult {
  const errors: string[] = [];

  if (!recipe.name || recipe.name.trim().length === 0) {
    errors.push("Recipe name is required.");
  }

  if (!Array.isArray(recipe.ingredients)) {
    errors.push("Ingredients must be an array.");
  }

  if (!Array.isArray(recipe.instructions) || recipe.instructions.length === 0) {
    errors.push("Instructions must be a non-empty array.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
