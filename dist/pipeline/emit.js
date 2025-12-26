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
    const slugCounts = new Map();
    const indexPayload = [];
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
        const filePath = path_1.default.join(recipesDir, fileName);
        await fs_1.promises.writeFile(filePath, JSON.stringify(recipe, null, 2), "utf-8");
    }
    await fs_1.promises.writeFile(path_1.default.join(outputRoot, "index.json"), JSON.stringify(indexPayload, null, 2), "utf-8");
}
