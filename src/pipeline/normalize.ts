import { Line, NormalizedText } from "./types";

export function normalize(input: string): NormalizedText {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines: Line[] = normalized.split("\n").map((text, index) => ({
    n: index + 1,
    text,
  }));

  return {
    fullText: normalized,
    lines,
  };
}
