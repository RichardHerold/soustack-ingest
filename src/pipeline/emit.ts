import { promises as fs } from "fs";
import path from "path";
import { SoustackRecipe } from "./types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80) || "recipe";
}

export async function emit(recipes: SoustackRecipe[], outDir: string): Promise<void> {
  const outputRoot = outDir;
  const recipesDir = path.join(outputRoot, "recipes");

  await fs.mkdir(recipesDir, { recursive: true });

  const indexPayload = recipes.map((recipe) => ({
    name: recipe.name,
    slug: slugify(recipe.name),
    path: `recipes/${slugify(recipe.name)}.soustack.json`,
  }));

  await fs.writeFile(
    path.join(outputRoot, "index.json"),
    JSON.stringify(indexPayload, null, 2),
    "utf-8"
  );

  await Promise.all(
    recipes.map(async (recipe) => {
      const slug = slugify(recipe.name);
      const filePath = path.join(recipesDir, `${slug}.soustack.json`);
      await fs.writeFile(filePath, JSON.stringify(recipe, null, 2), "utf-8");
    })
  );
}
