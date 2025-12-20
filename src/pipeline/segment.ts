import { Line, SegmentedText, Chunk } from "./types";

export function segment(lines: Line[]): SegmentedText {
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
