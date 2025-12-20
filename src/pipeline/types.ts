export type Line = { n: number; text: string };

export type NormalizedText = {
  fullText: string;
  lines: Line[];
};

export type Chunk = {
  startLine: number;
  endLine: number;
  titleGuess?: string;
  confidence: number;
  evidence: string;
};

export type SegmentedText = {
  chunks: Chunk[];
};

export type IntermediateRecipe = {
  title: string;
  ingredients: string[];
  instructions: string[];
  source: {
    startLine: number;
    endLine: number;
    evidence: string;
  };
};

export type SoustackRecipe = {
  $schema: string;
  level: string;
  name: string;
  stacks: string[];
  ingredients: string[];
  instructions: string[];
  "x-ingest": {
    pipelineVersion: string;
    sourcePath?: string;
    sourceLines?: {
      start: number;
      end: number;
    };
  };
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export type AdapterOutput = {
  kind: "text";
  text: string;
  assets?: string[];
  meta: {
    sourcePath: string;
    extractedPath?: string;
  };
};
