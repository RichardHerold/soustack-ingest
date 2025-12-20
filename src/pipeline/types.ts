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
  metadata?: {
    author?: string;
  };
  source: {
    startLine: number;
    endLine: number;
    evidence: string;
  };
};

export type SoustackRecipe = {
  $schema: string;
  profile: "lite";
  name: string;
  stacks?: Record<string, number> | string[];
  ingredients: string[];
  instructions: string[];
  metadata?: {
    author?: string;
    ingest?: {
      pipelineVersion?: string;
      sourcePath?: string;
      sourceLines?: {
        start: number;
        end: number;
      };
      warnings?: string[];
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
