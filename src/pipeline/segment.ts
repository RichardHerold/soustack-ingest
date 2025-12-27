import { Line, SegmentedText, Chunk, SegmentationReason } from "./types";

type LineFeatures = {
  isBlank: boolean;
  isTitleLike: boolean;
  isAllCapsTitle: boolean;
  hasIngredientsMarker: boolean;
  hasInstructionMarker: boolean;
  isIngredientLine: boolean;
  isImperativeLine: boolean;
};

const units = [
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
  "g",
  "kg",
  "ml",
  "l",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "pinch",
  "dash",
  "clove",
  "cloves",
  "slice",
  "slices",
  "can",
  "cans",
];

const ingredientMarker = /^(ingredients?)\b/i;
const instructionMarker = /^(instructions?|directions?|method|steps?)\b/i;
const bylineMarker = /^(by|from)\b/i;
const sectionHeaderMarker = /^(ingredients?|instructions?|directions?|method|steps?|preparation|prep|serves?|yield|makes?)\b/i;
const endsWithPunctuation = /[.:;!?]$/;
const unicodeFraction = /[¼½¾⅓⅔⅛⅜⅝⅞]/;
const bulletStart = /^[-*•·‣◦–—]/;
const titleInstructionVerbRegex = /^(add|mix|remove|cook|bake|stir|heat)\b/i;
const imperativeVerbRegex =
  /^(add|mix|bake|toast|stir|cook|whisk|combine|place|pour|bring|boil|simmer|heat|serve|fold|sprinkle|chop|slice|preheat|roast|saute|grill|blend|beat|season|drain|flip|marinate|set)\b/i;

function isTitleLikeLine(
  text: string,
  prevBlank: boolean,
  nextBlank: boolean,
  index: number,
  totalLines: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (endsWithPunctuation.test(trimmed)) {
    return false;
  }
  if (/^\d/.test(trimmed) || unicodeFraction.test(trimmed.charAt(0))) {
    return false;
  }
  if (bulletStart.test(trimmed)) {
    return false;
  }
  if (titleInstructionVerbRegex.test(trimmed)) {
    return false;
  }
  if (trimmed.length < 3 || trimmed.length > 72) {
    return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 10) {
    return false;
  }
  const letters = trimmed.replace(/[^A-Za-z]/g, "").length;
  const letterRatio = letters / trimmed.length;
  if (letterRatio < 0.6) {
    return false;
  }
  const isEdgePosition = index <= 1 || index >= totalLines - 2;
  const capitalizedWords = words.filter((word) => /^[A-Z]/.test(word)).length;
  const capitalRatio = words.length === 0 ? 0 : capitalizedWords / words.length;
  // Require capitalization even when surrounded by blank lines or at edges.
  // This avoids tagging short ingredient lines like "Chicken breasts" as titles.
  return (prevBlank || nextBlank || isEdgePosition) && capitalRatio >= 0.6;
}

function isIngredientCandidate(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (ingredientMarker.test(trimmed) || instructionMarker.test(trimmed)) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  const hasUnitToken = units.some((unit) => new RegExp(`\\b${unit}\\b`, "i").test(lower));
  const startsWithQuantity =
    /^[-*•]/.test(trimmed) ||
    /^\d/.test(trimmed) ||
    /^\d+\s*\d+\/\d+/.test(trimmed) ||
    unicodeFraction.test(trimmed.charAt(0)) ||
    /^\d+\s*[¼½¾⅓⅔⅛⅜⅝⅞]/.test(trimmed);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (startsWithQuantity) {
    if (hasUnitToken) {
      return true;
    }
    return words.length <= 6;
  }
  if (hasUnitToken) {
    return true;
  }
  return false;
}

function isAllCapsTitle(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const lettersOnly = trimmed.replace(/[^A-Za-z]/g, "");
  if (!lettersOnly) {
    return false;
  }
  return lettersOnly === lettersOnly.toUpperCase();
}

function isImperativeLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (ingredientMarker.test(trimmed) || instructionMarker.test(trimmed)) {
    return false;
  }
  const normalized = trimmed.replace(/^(\d+[\).\s]+|[-*•]\s*)/, "");
  return imperativeVerbRegex.test(normalized);
}

function buildFeatures(lines: Line[]): LineFeatures[] {
  return lines.map((line, index) => {
    const text = line.text;
    const trimmed = text.trim();
    const prev = lines[index - 1];
    const next = lines[index + 1];
    const prevBlank = !prev || prev.text.trim().length === 0;
    const nextBlank = !next || next.text.trim().length === 0;

    return {
      isBlank: trimmed.length === 0,
      isTitleLike: isTitleLikeLine(text, prevBlank, nextBlank, index, lines.length),
      isAllCapsTitle: isAllCapsTitle(text),
      hasIngredientsMarker: ingredientMarker.test(trimmed),
      hasInstructionMarker: instructionMarker.test(trimmed),
      isIngredientLine: isIngredientCandidate(text),
      isImperativeLine: isImperativeLine(text),
    };
  });
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function ingredientDensity(features: LineFeatures[], start: number, window: number): number {
  const end = Math.min(features.length, start + window);
  const slice = features.slice(start, end);
  const nonEmpty = slice.filter((line) => !line.isBlank);
  if (nonEmpty.length === 0) {
    return 0;
  }
  const ingredientLines = nonEmpty.filter((line) => line.isIngredientLine).length;
  return ingredientLines / nonEmpty.length;
}

function imperativeDensity(features: LineFeatures[], start: number, window: number): number {
  const end = Math.min(features.length, start + window);
  const slice = features.slice(start, end);
  const nonEmpty = slice.filter((line) => !line.isBlank);
  if (nonEmpty.length === 0) {
    return 0;
  }
  const imperativeLines = nonEmpty.filter((line) => line.isImperativeLine).length;
  return imperativeLines / nonEmpty.length;
}

type CandidateStart = {
  index: number;
  score: number;
  reason?: SegmentationReason;
};

function findCandidateStarts(lines: Line[], features: LineFeatures[]): CandidateStart[] {
  const candidates: CandidateStart[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (features[index].isIngredientLine) {
      continue;
    }
    if (!features[index].isTitleLike) {
      continue;
    }
    // Filter out attribution/byline patterns (e.g., "From the former Boston Restaurant...")
    const trimmed = lines[index].text.trim();
    if (bylineMarker.test(trimmed) || isAuthorLine(lines, index)) {
      continue;
    }
    // Filter out section headers (e.g., "Ingredients", "Directions") - these are not recipe titles
    if (sectionHeaderMarker.test(trimmed) && trimmed.length < 20) {
      continue;
    }
    if (features[index].isImperativeLine && !features[index].isAllCapsTitle) {
      const prev = features[index - 1];
      if (prev && !prev.isBlank) {
        continue;
      }
    }
    const density = ingredientDensity(features, index + 1, 8);
    const imperative = imperativeDensity(features, index + 1, 8);
    const score = clamp(0.6 + Math.max(density, imperative) * 0.8);
    const acceptsIngredient = density >= 0.25;
    const acceptsImperative = imperative >= 0.3;
    const acceptsCapsImperative = features[index].isAllCapsTitle && imperative >= 0.2;
    if (acceptsIngredient || acceptsImperative || acceptsCapsImperative) {
      let reason: SegmentationReason | undefined;
      if (acceptsCapsImperative) {
        reason = "all-caps-imperative";
      } else if (acceptsImperative && imperative >= density) {
        reason = "imperative-density";
      } else {
        reason = "ingredient-density";
      }

      candidates.push({ index, score, reason });
    }
  }

  const deduped: CandidateStart[] = [];
  candidates.forEach((candidate) => {
    const last = deduped[deduped.length - 1];
    if (!last) {
      deduped.push(candidate);
      return;
    }
    if (candidate.index - last.index <= 3) {
      // Prefer the earlier candidate when they're close together (likely same recipe)
      // Only replace if the later candidate has significantly higher score (>0.1 difference)
      if (candidate.score > last.score + 0.1) {
        deduped[deduped.length - 1] = candidate;
      }
      return;
    }
    deduped.push(candidate);
  });

  return deduped;
}

function hasNearbyStructuredMarker(lines: Line[], startIndex: number, window = 8): boolean {
  const end = Math.min(lines.length - 1, startIndex + window);
  for (let index = startIndex + 1; index <= end; index += 1) {
    const trimmed = lines[index].text.trim();
    if (!trimmed) {
      continue;
    }
    if (ingredientMarker.test(trimmed) || bylineMarker.test(trimmed)) {
      return true;
    }
  }
  return false;
}

function isAuthorLine(lines: Line[], index: number): boolean {
  const prev = lines[index - 1];
  return prev ? bylineMarker.test(prev.text.trim()) : false;
}

function findStructuredCookbookStarts(lines: Line[], features: LineFeatures[]): number[] {
  const ingredientIndices = lines
    .map((line, index) => (features[index].hasIngredientsMarker ? index : -1))
    .filter((index) => index >= 0);
  const starts: number[] = [];

  ingredientIndices.forEach((ingredientIndex) => {
    for (let index = ingredientIndex - 1; index >= 0; index -= 1) {
      const text = lines[index].text.trim();
      if (!text) {
        continue;
      }
      if (bylineMarker.test(text) || isAuthorLine(lines, index)) {
        continue;
      }
      if (features[index].isIngredientLine) {
        continue;
      }
      if (!features[index].isTitleLike) {
        continue;
      }
      if (!hasNearbyStructuredMarker(lines, index)) {
        continue;
      }
      starts.push(index);
      break;
    }
  });

  return starts;
}

function confidenceForChunk(
  lines: Line[],
  features: LineFeatures[],
  startIndex: number,
  endIndex: number,
): number {
  const slice = features.slice(startIndex, endIndex + 1);
  const nonEmpty = slice.filter((line) => !line.isBlank);
  const ingredientLines = slice.filter((line) => line.isIngredientLine).length;
  const density = nonEmpty.length === 0 ? 0 : ingredientLines / nonEmpty.length;
  const instructionPresent = slice.some((line) => line.hasInstructionMarker);
  const titleScore = features[startIndex]?.isTitleLike ? 1 : 0;

  return clamp(0.4 * titleScore + 0.4 * density + (instructionPresent ? 0.2 : 0));
}

export type SegmentOptions = {
  debug?: boolean;
};

export function segment(lines: Line[], options: SegmentOptions = {}): SegmentedText {
  if (lines.length === 0) {
    return { chunks: [] };
  }

  const features = buildFeatures(lines);
  const ingredientMarkerCount = features.filter((feature) => feature.hasIngredientsMarker).length;
  const structuredStarts =
    ingredientMarkerCount >= 5 ? findStructuredCookbookStarts(lines, features) : [];
  const structuredCandidateStarts = Array.from(new Set(structuredStarts)).sort((a, b) => a - b);
  const candidates = structuredCandidateStarts.length > 0 ? [] : findCandidateStarts(lines, features);
  const includeDebug = options.debug === true;

  if (structuredCandidateStarts.length === 0 && candidates.length === 0) {
    const nonEmpty = lines.find((line) => line.text.trim().length > 0);
    const titleGuess = nonEmpty?.text.trim();
    const chunk: Chunk = {
      startLine: lines[0]?.n ?? 1,
      endLine: lines.length > 0 ? lines[lines.length - 1].n : 1,
      titleGuess,
      confidence: 0.2,
      evidence: titleGuess
        ? `Title guessed from line ${nonEmpty?.n}`
        : "No non-empty lines to infer title.",
    };

    return { chunks: [chunk] };
  }

  const chunks: Chunk[] =
    structuredCandidateStarts.length > 0
      ? structuredCandidateStarts.map((startIndex, index) => {
          const next = structuredCandidateStarts[index + 1];
          const endIndex = next ? next - 1 : lines.length - 1;
          const titleGuess = lines[startIndex].text.trim();
          const confidence = confidenceForChunk(lines, features, startIndex, endIndex);
          const evidence = `Structured cookbook start at line ${lines[startIndex].n}`;

          return {
            startLine: lines[startIndex].n,
            endLine: lines[endIndex].n,
            titleGuess,
            confidence,
            evidence,
          };
        })
      : candidates.map((candidate, index) => {
          const next = candidates[index + 1];
          const startIndex = candidate.index;
          const endIndex = next ? next.index - 1 : lines.length - 1;
          const titleGuess = lines[startIndex].text.trim();
          const confidence = confidenceForChunk(lines, features, startIndex, endIndex);
          const evidence = `Title candidate at line ${lines[startIndex].n} with density ${ingredientDensity(
            features,
            startIndex + 1,
            8,
          ).toFixed(2)}`;

          return {
            startLine: lines[startIndex].n,
            endLine: lines[endIndex].n,
            titleGuess,
            confidence,
            evidence,
            ...(includeDebug && candidate.reason
              ? { segmentationReason: candidate.reason }
              : {}),
          };
        });

  return { chunks };
}
