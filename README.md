# soustack-ingest

## Recommended usage

**End users:** Use the `soustack` CLI (requires `@soustack/ingest` to be installed):

```bash
npx soustack ingest <inputPath> --out <outDir>
```

**Contributors:** Use the local npm script:

```bash
npm run ingest -- <inputPath> --out <outDir>
```

The CLI reads the input file, runs it through the ingest pipeline, and writes JSON outputs under `<outDir>` (see `src/cli.ts` and `src/pipeline/emit.ts`).

### Prerequisites

- Node.js 18+ (or compatible)
- Optional: `pandoc` for improved RTF/RTFD conversion (the adapter will fall back to a built-in parser when it is unavailable).

## Adapter behavior

Adapters are selected by file extension (`src/cli.ts`, `src/adapters`).

- `.rtfd.zip`: handled by `readRtfdZip` (`src/adapters/rtfdZip.ts`). The adapter extracts the archive, locates the primary `.rtf` payload (preferring `TXT.rtf` or the largest `.rtf` file), and converts it to text. It tries a Node-based parser first, then falls back to `pandoc` and `textutil` when available.
- `.txt`: handled by `readTxt` (`src/adapters/txt.ts`). Reads the file as UTF-8 text and passes it to the pipeline.
- `.docx`: handled by `readDocx` (`src/adapters/docx.ts`). Extracts plain text from Microsoft Word documents using `mammoth`.
- `.pdf`: handled by `readPdf` (`src/adapters/pdf.ts`). Extracts plain text from PDF files using `pdf-parse`.

Unsupported extensions throw an error.

## Pipeline stages & contracts

The ingest pipeline runs stages in order (`src/cli.ts`, `src/pipeline`).

1. **normalize** (`src/pipeline/normalize.ts`)
   - **Input:** raw adapter text (`string`).
   - **Output:** `NormalizedText` with `fullText` and line metadata (`Line[]`).
   - **Contract:** normalize newlines to `\n` and assign 1-based line numbers.

2. **segment** (`src/pipeline/segment.ts`)
   - **Input:** `Line[]`.
   - **Output:** `SegmentedText` with `Chunk[]`.
   - **Contract:** scores potential recipe boundaries and returns one chunk per inferred recipe with a best-effort title guess and confidence score.

3. **extract** (`src/pipeline/extract.ts`)
   - **Input:** a `Chunk` plus the full `Line[]`.
   - **Output:** `IntermediateRecipe` containing title, ingredients, instructions, and source-line evidence.
   - **Contract:** splits lines into `ingredients` and `instructions` sections by headers; lines before any header fall into instructions.

4. **toSoustack** (`src/pipeline/toSoustack.ts`)
   - **Input:** `IntermediateRecipe`.
   - **Output:** `SoustackRecipe` (Soustack JSON shape) with `$schema` (canonical URL), `profile: "lite"`, `stacks` as an object map, normalized `ingredients`/`instructions` string arrays, and ingest metadata.
   - **Contract:** embeds source path and line range into `metadata.ingest`.

5. **validate** (`src/pipeline/validate.ts`)
   - **Input:** `SoustackRecipe`.
   - **Output:** `ValidationResult` (`ok`, `errors`).
   - **Contract:** see validator notes below.

6. **emit** (`src/pipeline/emit.ts`)
   - **Input:** list of validated `SoustackRecipe` values and an output directory.
   - **Output:**
     - `<outDir>/index.json` with name/slug/path entries.
     - `<outDir>/recipes/<slug>.soustack.json` files for each recipe.
   - **Contract:** recipe filenames are slugified from `recipe.name` and truncated to 80 characters.

## Validator behavior & wiring `soustack`

Validation is intentionally lightweight today. The pipeline starts with a stub validator built from a fallback schema (`src/pipeline/validate.ts`). It attempts to load `soustack` at runtime:

- If `soustack` exports `validator`, that object is used.
- If it exports `validateRecipe`, it is wrapped into a `validator`.
- If neither exists or the import fails, the stub validator stays active.

To wire `soustack` validation:

1. Ensure `soustack` is installed (already in `package.json`).
2. Export either a `validator` object with a `validate(recipe)` function, or a `validateRecipe(recipe)` function, from the `soustack` package entry point.
3. Call `initValidator()` once at startup (the CLI does this before any `validate()` calls) so the active validator is set deterministically.

## Build, test, and run

```bash
npm ci
npm run build
npm test
npm run ingest -- <inputPath> --out <outDir>
```

### Example usage

```bash
npm run ingest -- "/mnt/data/bowman cookbook.rtfd.zip" --out ./output
```
