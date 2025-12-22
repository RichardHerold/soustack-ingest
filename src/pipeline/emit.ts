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

  const slugCounts = new Map<string, number>();
  const indexPayload: Array<{ name: string; slug: string; path: string }> = [];

  for (const recipe of recipes) {
    const baseSlug = slugify(recipe.name);
    const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, nextCount);
    const resolvedSlug = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
    const fileName = `${resolvedSlug}.soustack.json`;

    indexPayload.push({
      name: recipe.name,
      slug: resolvedSlug,
      path: `recipes/${fileName}`,
    });

    const filePath = path.join(recipesDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(recipe, null, 2), "utf-8");
  }

  await fs.writeFile(
    path.join(outputRoot, "index.json"),
    JSON.stringify(indexPayload, null, 2),
    "utf-8"
  );
}
