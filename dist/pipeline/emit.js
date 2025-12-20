"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emit = emit;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
        .slice(0, 80) || "recipe";
}
async function emit(recipes, outDir) {
    const outputRoot = outDir;
    const recipesDir = path_1.default.join(outputRoot, "recipes");
    await fs_1.promises.mkdir(recipesDir, { recursive: true });
    const indexPayload = recipes.map((recipe) => ({
        name: recipe.name,
        slug: slugify(recipe.name),
        path: `recipes/${slugify(recipe.name)}.soustack.json`,
    }));
    await fs_1.promises.writeFile(path_1.default.join(outputRoot, "index.json"), JSON.stringify(indexPayload, null, 2), "utf-8");
    await Promise.all(recipes.map(async (recipe) => {
        const slug = slugify(recipe.name);
        const filePath = path_1.default.join(recipesDir, `${slug}.soustack.json`);
        await fs_1.promises.writeFile(filePath, JSON.stringify(recipe, null, 2), "utf-8");
    }));
}
