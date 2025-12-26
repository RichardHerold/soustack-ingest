"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = extract;
function sliceLines(lines, startLine, endLine) {
    return lines.filter((line) => line.n >= startLine && line.n <= endLine);
}
const AUTHOR_NAME_REGEX = /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*){0,3}$/;
function isAuthorNameLine(text) {
    return AUTHOR_NAME_REGEX.test(text);
}
function extractAuthorFromLines(lines) {
    let author;
    let awaitingAuthor = false;
    const filteredLines = [];
    for (const line of lines) {
        const trimmed = line.text.trim();
        if (!trimmed) {
            if (!awaitingAuthor) {
                filteredLines.push(line);
            }
            continue;
        }
        if (awaitingAuthor) {
            if (isAuthorNameLine(trimmed)) {
                if (!author) {
                    author = trimmed;
                }
                awaitingAuthor = false;
                continue;
            }
            awaitingAuthor = false;
        }
        const inlineMatch = trimmed.match(/^(by|from)[:\s]+(.+)$/i);
        if (inlineMatch) {
            if (!author) {
                author = inlineMatch[2].trim();
            }
            continue;
        }
        if (/^by:\s*$/i.test(trimmed)) {
            awaitingAuthor = true;
            continue;
        }
        filteredLines.push(line);
    }
    return { author, filteredLines };
}
function isPrepHeader(text) {
    const normalized = text.toLowerCase().replace(/[:\s]+$/, "");
    return (normalized === "prep" ||
        normalized === "preparation" ||
        normalized === "mise en place" ||
        normalized === "mise-en-place" ||
        normalized === "before you start");
}
function splitSections(lines) {
    const trimmedLines = lines
        .map((line) => line.text.trim())
        .filter((text) => Boolean(text));
    const ingredients = [];
    const instructions = [];
    const prep = [];
    let mode = "unknown";
    const normalizeHeader = (text) => text.toLowerCase().replace(/[:\s]+$/, "");
    const isIngredientHeader = (text) => normalizeHeader(text) === "ingredients";
    const isInstructionHeader = (text) => /^(instructions?|directions|method|steps?|step\s*\d+)$/i.test(normalizeHeader(text));
    const isByLine = (text) => /^by[:\s]/i.test(text);
    const bulletRegex = /^[-*•·‣◦–—]\s*/;
    const cleanIngredient = (text) => text.replace(bulletRegex, "").trim();
    const cleanInstruction = (text) => text
        .replace(/^(step\s*\d+[:.)]?\s*)/i, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();
    const cleanPrep = (text) => cleanInstruction(text.replace(bulletRegex, "").trim());
    const ingredientStarters = ["salt", "pepper", "pinch", "dash"];
    const unicodeFractionRegex = /^[¼½¾⅓⅔⅛⅜⅝⅞]\s+\w+/;
    const isIngredientLike = (text) => bulletRegex.test(text) ||
        /^(\d+([/-]\d+)?|\d+\s+\d\/\d)\s+\w+/.test(text) ||
        unicodeFractionRegex.test(text) ||
        /^\d+\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|grams?|kg|ml|l)\b/i.test(text) ||
        ingredientStarters.some((starter) => text.toLowerCase().startsWith(starter));
    const isInstructionLike = (text) => /^\d+[.)]\s+/.test(text) || /[.!?]\s*$/.test(text) || /\w+\s+\w+/.test(text);
    const isClearInstructionLike = (text) => /[.!?]\s*$/.test(text) ||
        /^(mix|stir|cook|bake|toast|toss|combine|whisk|simmer|bring|add|preheat|heat|serve)\b/i.test(text);
    const hasExplicitHeadings = trimmedLines.some((text) => isIngredientHeader(text) || isInstructionHeader(text));
    if (hasExplicitHeadings) {
        let skipNextAuthorLine = false;
        for (const text of trimmedLines) {
            if (mode === "unknown") {
                if (isByLine(text)) {
                    skipNextAuthorLine = true;
                    continue;
                }
                if (skipNextAuthorLine &&
                    !isIngredientHeader(text) &&
                    !isInstructionHeader(text) &&
                    isAuthorNameLine(text)) {
                    skipNextAuthorLine = false;
                    continue;
                }
                skipNextAuthorLine = false;
            }
            if (isIngredientHeader(text)) {
                mode = "ingredients";
                continue;
            }
            if (isInstructionHeader(text)) {
                mode = "instructions";
                continue;
            }
            if (isPrepHeader(text)) {
                mode = "prep";
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
            if (mode === "prep") {
                const cleanedPrep = cleanPrep(text);
                prep.push(cleanedPrep);
                instructions.push(cleanInstruction(text));
                continue;
            }
            instructions.push(text);
        }
    }
    else {
        const sample = trimmedLines.slice(0, 5);
        const sampleIngredientCount = sample.filter((text) => isIngredientLike(text)).length;
        const sampleInstructionCount = sample.filter((text) => isInstructionLike(text)).length;
        if (sampleIngredientCount > 0 && sampleIngredientCount >= sampleInstructionCount) {
            mode = "ingredients";
        }
        let ingredientCount = 0;
        let instructionCount = 0;
        for (const text of trimmedLines) {
            if (isPrepHeader(text)) {
                mode = "prep";
                continue;
            }
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
            if (mode === "prep") {
                const cleanedPrep = cleanPrep(text);
                prep.push(cleanedPrep);
                instructions.push(cleanInstruction(text));
                instructionCount += 1;
                continue;
            }
            instructions.push(cleanInstruction(text));
            instructionCount += 1;
        }
        if (ingredients.length === 0 && trimmedLines.length > 1 && prep.length === 0) {
            ingredients.length = 0;
            instructions.length = 0;
            ingredientCount = 0;
            instructionCount = 0;
            let inInstructions = false;
            for (const text of trimmedLines) {
                if (isPrepHeader(text)) {
                    mode = "prep";
                    continue;
                }
                const ingredientLike = isIngredientLike(text);
                const instructionLike = isInstructionLike(text) || isClearInstructionLike(text);
                if (mode === "prep") {
                    const cleanedPrep = cleanPrep(text);
                    prep.push(cleanedPrep);
                    instructions.push(cleanInstruction(text));
                    instructionCount += 1;
                    continue;
                }
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
    if (ingredients.length === 0) {
        const inferredIngredients = inferIngredientsFromInstructions(instructions);
        if (inferredIngredients.length > 0) {
            ingredients.push(...inferredIngredients);
        }
    }
    return {
        ingredients,
        instructions,
        prep,
    };
}
const IMPERATIVE_VERBS = [
    "add",
    "bake",
    "beat",
    "blend",
    "boil",
    "bring",
    "broil",
    "chop",
    "combine",
    "cook",
    "dice",
    "fold",
    "fry",
    "grill",
    "heat",
    "melt",
    "mix",
    "pour",
    "preheat",
    "roast",
    "saute",
    "season",
    "serve",
    "simmer",
    "slice",
    "sprinkle",
    "spread",
    "stir",
    "toast",
    "toss",
    "whisk",
];
const INGREDIENT_UNITS = [
    "cup",
    "cups",
    "tbsp",
    "tablespoon",
    "tablespoons",
    "tsp",
    "teaspoon",
    "teaspoons",
    "oz",
    "ounce",
    "ounces",
    "gram",
    "grams",
    "g",
    "kg",
    "ml",
    "l",
    "lb",
    "pound",
    "pounds",
    "pinch",
    "dash",
    "clove",
    "cloves",
    "slice",
    "slices",
    "piece",
    "pieces",
];
const TOOL_WORDS = new Set([
    "pan",
    "skillet",
    "pot",
    "bowl",
    "oven",
    "tray",
    "sheet",
    "plate",
    "dish",
    "rack",
    "knife",
    "spoon",
]);
const PREP_BASE_WORDS = new Set([
    "chopped",
    "minced",
    "diced",
    "sliced",
    "grated",
    "shredded",
    "zested",
    "juiced",
    "peeled",
    "seeded",
    "drained",
    "rinsed",
    "softened",
    "melted",
    "cooled",
    "thawed",
    "toasted",
    "crushed",
    "ground",
]);
const PREP_AGGRESSIVE_MODIFIERS = new Set([
    "finely",
    "roughly",
    "coarsely",
    "thinly",
    "thickly",
]);
const PREP_AGGRESSIVE_ADJECTIVES = new Set(["soft"]);
const PREP_AGGRESSIVE_INTENSIFIERS = new Set(["very", "extra", "super", "really"]);
function normalizePrepToken(token, mode) {
    const cleaned = token
        .toLowerCase()
        .replace(/[.!?]+$/, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) {
        return null;
    }
    if (/^(at\s+)?room\s+temp(erature)?$/.test(cleaned)) {
        return "room temperature";
    }
    if (PREP_BASE_WORDS.has(cleaned)) {
        return cleaned;
    }
    if (mode === "aggressive") {
        const modifierMatch = cleaned.match(/^(\w+)\s+(\w+)$/);
        if (modifierMatch) {
            const [, modifier, base] = modifierMatch;
            if (PREP_AGGRESSIVE_MODIFIERS.has(modifier) && PREP_BASE_WORDS.has(base)) {
                return `${modifier} ${base}`;
            }
            if (PREP_AGGRESSIVE_INTENSIFIERS.has(modifier) && PREP_AGGRESSIVE_ADJECTIVES.has(base)) {
                return `${modifier} ${base}`;
            }
        }
        if (PREP_AGGRESSIVE_ADJECTIVES.has(cleaned)) {
            return cleaned;
        }
    }
    return null;
}
function extractIngredientPrep(raw, mode) {
    let base = raw.trim();
    const prep = [];
    base = base
        .replace(/\(([^)]+)\)/g, (_match, contents) => {
        const tokens = contents
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean);
        const kept = [];
        for (const token of tokens) {
            const normalized = normalizePrepToken(token, mode);
            if (normalized) {
                prep.push(normalized);
            }
            else {
                kept.push(token);
            }
        }
        if (kept.length > 0) {
            return `(${kept.join(", ")})`;
        }
        return "";
    })
        .replace(/\s+/g, " ")
        .trim();
    const segments = base
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean);
    if (segments.length > 1) {
        const baseSegments = [];
        segments.forEach((segment, index) => {
            if (index === 0) {
                baseSegments.push(segment);
                return;
            }
            const normalized = normalizePrepToken(segment, mode);
            if (normalized) {
                prep.push(normalized);
            }
            else {
                baseSegments.push(segment);
            }
        });
        base = baseSegments.join(", ").trim();
    }
    if (mode === "aggressive") {
        const leadingPrep = extractLeadingPrepPhrase(base, mode);
        if (leadingPrep) {
            prep.push(leadingPrep.prep);
            base = leadingPrep.base;
        }
    }
    return { base, prep };
}
function extractLeadingPrepPhrase(text, mode) {
    if (mode !== "aggressive") {
        return null;
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 3) {
        return null;
    }
    const leadingToken = `${words[0]} ${words[1]}`;
    const normalized = normalizePrepToken(leadingToken, mode);
    if (!normalized) {
        return null;
    }
    const remaining = words.slice(2).join(" ").trim();
    if (!remaining) {
        return null;
    }
    return { base: remaining, prep: normalized };
}
function inferIngredientsFromInstructions(instructions) {
    const imperativeLines = instructions.filter((line) => isImperativeLine(line));
    if (imperativeLines.length < 2) {
        return [];
    }
    const candidates = [];
    for (const line of imperativeLines) {
        const extracted = extractNounPhrasesFromImperative(line);
        candidates.push(...extracted);
    }
    const deduped = dedupePreserveOrder(candidates);
    if (deduped.length < 2) {
        return [];
    }
    return deduped;
}
function isImperativeLine(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }
    const verbPattern = IMPERATIVE_VERBS.join("|");
    return new RegExp(`^(${verbPattern})\\b`, "i").test(trimmed);
}
function extractNounPhrasesFromImperative(text) {
    const cleaned = text
        .replace(/^(step\s*\d+[:.)]?\s*)/i, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();
    const verbPattern = new RegExp(`^(${IMPERATIVE_VERBS.join("|")})\\b`, "i");
    let remainder = cleaned.replace(verbPattern, "").trim();
    remainder = remainder.replace(/^(slowly|gently|carefully)\b/i, "").trim();
    if (!remainder) {
        return [];
    }
    const segments = remainder
        .split(/(?:,|;|\band\b|\bor\b|\bwith\b|\binto\b|\bin\b|\bon\b|\bover\b|\bonto\b|\bfor\b|\bto\b|\buntil\b|\bthen\b)/i)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const phrases = [];
    for (const segment of segments) {
        const candidate = normalizeIngredientCandidate(segment);
        if (candidate) {
            phrases.push(candidate);
        }
    }
    return phrases;
}
function normalizeIngredientCandidate(segment) {
    let candidate = segment.replace(/[.!?]+$/, "").trim();
    candidate = candidate.replace(/^(the|a|an|some|your)\b\s*/i, "").trim();
    if (!candidate) {
        return null;
    }
    const quantityUnitPattern = new RegExp(`^(?:\\d+(?:[/-]\\d+)?|\\d+\\s+\\d/\\d)\\s+(?:${INGREDIENT_UNITS.join("|")})\\b\\s*`, "i");
    candidate = candidate.replace(quantityUnitPattern, "").trim();
    if (!candidate) {
        return null;
    }
    if (/\d/.test(candidate)) {
        return null;
    }
    const normalized = candidate.replace(/\s+/g, " ");
    const words = normalized.split(" ");
    if (words.length === 0 || words.length > 4) {
        return null;
    }
    const lastWord = words[words.length - 1]?.toLowerCase();
    if (lastWord && TOOL_WORDS.has(lastWord)) {
        return null;
    }
    return normalized;
}
function dedupePreserveOrder(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = item.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(item);
    }
    return result;
}
function extract(chunk, lines, options = {}) {
    const relevantLines = sliceLines(lines, chunk.startLine, chunk.endLine);
    const titleGuess = chunk.titleGuess?.trim();
    let title = titleGuess ?? "Untitled Recipe";
    let contentLines = relevantLines;
    let titleIndex = -1;
    if (titleGuess) {
        titleIndex = relevantLines.findIndex((line) => line.text.trim() === titleGuess);
        if (titleIndex >= 0) {
            contentLines = relevantLines.filter((_, index) => index !== titleIndex);
        }
    }
    else {
        const firstNonEmptyIndex = relevantLines.findIndex((line) => line.text.trim().length > 0);
        if (firstNonEmptyIndex >= 0) {
            title = relevantLines[firstNonEmptyIndex].text.trim();
            titleIndex = firstNonEmptyIndex;
            contentLines = relevantLines.filter((_, index) => index !== firstNonEmptyIndex);
        }
    }
    const { author, filteredLines } = extractAuthorFromLines(contentLines);
    contentLines = filteredLines;
    const { ingredients, instructions, prep } = splitSections(contentLines);
    const ingredientPrep = [];
    const prepExtractionMode = options.prepExtractionMode ?? "conservative";
    ingredients.forEach((ingredient, index) => {
        const { base, prep: prepTokens } = extractIngredientPrep(ingredient, prepExtractionMode);
        if (prepTokens.length > 0) {
            ingredientPrep.push({
                index,
                raw: ingredient,
                base,
                prep: prepTokens,
            });
        }
    });
    const recipe = {
        title,
        ingredients,
        instructions,
        source: {
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            evidence: chunk.evidence,
            author,
        },
    };
    if (prep.length > 0) {
        recipe.prepSection = prep;
    }
    if (ingredientPrep.length > 0) {
        recipe.ingredientPrep = ingredientPrep;
    }
    return recipe;
}
