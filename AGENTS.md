# soustack-ingest — agends

This repo turns “random recipe files found in the wild” into **Soustack JSON**.

This file is a living **agenda + guide** for humans *and* coding agents working in this codebase. Keep it lightweight, keep it honest, and update it when reality changes.

---

## What this repo does

- **Input:** recipe sources (currently `.txt`, `.rtfd` bundles, `.rtfd.zip`).
- **Output:** `index.json` plus `recipes/<slug>.soustack.json` files.
- **Flow:** adapter → normalize → segment → extract → toSoustack → validate → emit.

If you’re lost, start with `src/cli.ts` (or the `ingest()` function inside it).

---

## Quick commands

```bash
npm install
npm test
npm run build

# Run ingest locally
npm run ingest -- <inputPath> --out <outDir>

# Known-good repro run (uses test fixtures)
npm run repro