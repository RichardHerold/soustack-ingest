import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import Ajv, { ErrorObject, type AnySchema } from "ajv";

import { SoustackRecipe, ValidationResult } from "./types";

export interface Validator {
  validate(recipe: SoustackRecipe): ValidationResult;
}

type CoreValidationModule = {
  validator?: Validator;
  validateRecipe?: (recipe: SoustackRecipe, options?: unknown) => {
    ok: boolean;
    schemaErrors?: Array<{ path: string; message: string }>;
    conformanceIssues?: Array<{ path: string; message: string }>;
    warnings?: string[];
  };
  recipeSchema?: unknown;
  schema?: unknown;
  schemas?: {
    recipe?: unknown;
  };
};

const VNEXT_SCHEMA_URL = "https://soustack.spec/soustack.schema.json";

const vNextSchema = {
  type: "object",
  required: ["$schema", "profile", "name", "stacks", "ingredients", "instructions"],
  properties: {
    $schema: {
      const: VNEXT_SCHEMA_URL,
    },
    profile: {
      type: "string",
      const: "lite",
    },
    name: {
      type: "string",
      minLength: 1,
    },
    stacks: {
      anyOf: [{ type: "object" }, { type: "array" }],
    },
    ingredients: {
      type: "array",
      items: { type: "string" },
    },
    instructions: {
      type: "array",
      items: { type: "string" },
    },
    metadata: {
      type: "object",
      properties: {
        ingest: {
          type: "object",
          properties: {
            pipelineVersion: { type: "string" },
            sourcePath: { type: "string" },
            sourceLines: {
              type: "object",
              properties: {
                start: { type: "number" },
                end: { type: "number" },
              },
              required: ["start", "end"],
              additionalProperties: false,
            },
            warnings: {
              type: "array",
              items: { type: "string" },
            },
          },
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
};

const fallbackSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: {
      type: "string",
      minLength: 1,
    },
  },
  additionalProperties: true,
};

const moduleRequire = createRequire(typeof __filename !== "undefined" ? __filename : process.cwd());

function toJsonPathSegment(segment: string): string {
  if (/^\d+$/.test(segment)) {
    return `[${segment}]`;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
    return `.${segment}`;
  }
  return `['${segment.replace(/'/g, "\\'")}']`;
}

function toJsonPath(instancePath: string, missingProperty?: string): string {
  const parts = instancePath
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));

  let jsonPath = "$";
  for (const part of parts) {
    jsonPath += toJsonPathSegment(part);
  }
  if (missingProperty) {
    jsonPath += toJsonPathSegment(missingProperty);
  }
  return jsonPath;
}

function formatAjvError(error: ErrorObject): string {
  const path = toJsonPath(error.instancePath, (error.params as { missingProperty?: string }).missingProperty);
  const message = error.message ?? "is invalid";
  return `${path} ${message}`.trim();
}

function buildAjvValidator(schema: unknown): Validator {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateSchema = ajv.compile(schema as AnySchema);
  return {
    validate: (recipe: SoustackRecipe) => {
      const ok = validateSchema(recipe) as boolean;
      if (ok) {
        return { ok: true, errors: [] };
      }
      const errors = (validateSchema.errors ?? []).map((error) => formatAjvError(error));
      return { ok: false, errors };
    },
  };
}

function resolveSchemaFromModule(core: CoreValidationModule): unknown | null {
  if (core.recipeSchema && typeof core.recipeSchema === "object") {
    return core.recipeSchema;
  }
  if (core.schemas?.recipe && typeof core.schemas.recipe === "object") {
    return core.schemas.recipe;
  }
  if (core.schema && typeof core.schema === "object") {
    return core.schema;
  }
  return null;
}

async function loadSchemaFromString(schemaRef: string): Promise<unknown | null> {
  if (schemaRef.startsWith("http://") || schemaRef.startsWith("https://")) {
    const response = await fetch(schemaRef);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  }
  try {
    const resolved = path.isAbsolute(schemaRef)
      ? schemaRef
      : path.join(path.dirname(moduleRequire.resolve("soustack/package.json")), schemaRef);
    const raw = await fs.promises.readFile(resolved, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function loadSchemaFromPackage(): Promise<unknown | null> {
  try {
    const root = path.dirname(moduleRequire.resolve("soustack/package.json"));
    const candidates = [
      "recipe.schema.json",
      "schema/recipe.schema.json",
      "schemas/recipe.schema.json",
      "dist/recipe.schema.json",
      "dist/schema/recipe.schema.json",
      "dist/schemas/recipe.schema.json",
    ];
    for (const candidate of candidates) {
      const filePath = path.join(root, candidate);
      if (fs.existsSync(filePath)) {
        const raw = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(raw) as unknown;
      }
    }
  } catch {
    return null;
  }
  return null;
}

let activeValidator: Validator = buildAjvValidator(fallbackSchema);
const vNextValidator = buildAjvValidator(vNextSchema);

const coreValidatorPromise = (async () => {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:142',message:'Importing soustack module',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const module = await import("soustack");
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:144',message:'soustack module imported',data:{hasValidateRecipe:!!(module as {validateRecipe?:unknown}).validateRecipe},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const core = module as CoreValidationModule;
    if (core.validateRecipe) {
      const validateRecipeFn = core.validateRecipe;
      return {
        validate: (recipe: SoustackRecipe): ValidationResult => {
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:149',message:'Calling soustack validateRecipe',data:{recipeName:recipe.name},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          const result = validateRecipeFn(recipe);
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:152',message:'soustack validateRecipe result',data:{ok:result.ok,hasSchemaErrors:!!result.schemaErrors,hasConformanceIssues:!!result.conformanceIssues,schemaErrorCount:result.schemaErrors?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // Convert soustack ValidateResult to local ValidationResult format
          const errors: string[] = [];
          const schemaErrors = Array.isArray(result.schemaErrors) ? result.schemaErrors : [];
          const conformanceIssues = Array.isArray(result.conformanceIssues) ? result.conformanceIssues : [];
          errors.push(...schemaErrors.map((e) => `${e.path} ${e.message}`));
          errors.push(...conformanceIssues.map((e) => `${e.path} ${e.message}`));
          return {
            ok: result.ok,
            errors,
          };
        },
      };
    }
    const moduleSchema = resolveSchemaFromModule(core);
    if (moduleSchema) {
      return buildAjvValidator(moduleSchema);
    }
    const schemaRef =
      typeof core.schema === "string"
        ? core.schema
        : typeof core.recipeSchema === "string"
          ? core.recipeSchema
          : null;
    if (schemaRef) {
      const resolved = await loadSchemaFromString(schemaRef);
      if (resolved) {
        return buildAjvValidator(resolved);
      }
    }
    const packagedSchema = await loadSchemaFromPackage();
    if (packagedSchema) {
      return buildAjvValidator(packagedSchema);
    }
  } catch {
    return null;
  }
  return null;
})();

export async function initValidator(): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:189',message:'initValidator called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const validator = await coreValidatorPromise;
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:192',message:'Validator resolved',data:{hasValidator:!!validator},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  activeValidator = {
    validate: (recipe: SoustackRecipe) => {
      if (recipe.$schema === VNEXT_SCHEMA_URL) {
        return vNextValidator.validate(recipe);
      }
      return (validator ?? vNextValidator).validate(recipe);
    },
  };
}

export function validate(recipe: SoustackRecipe): ValidationResult {
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:203',message:'validate called',data:{recipeName:recipe.name},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const result = activeValidator.validate(recipe);
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'validate.ts:206',message:'validate result',data:{ok:result.ok,errorCount:result.errors.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  return result;
}
