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
  validateRecipe?: (
    recipe: SoustackRecipe,
    options?: unknown
  ) =>
    | {
        ok?: boolean;
        valid?: boolean;
        success?: boolean;
        schemaErrors?: Array<{ path?: string; message?: string }>;
        conformanceIssues?: Array<{ path?: string; message?: string }>;
        errors?: Array<{ path?: string; message?: string } | string>;
        warnings?: string[];
      }
    | Promise<{
        ok?: boolean;
        valid?: boolean;
        success?: boolean;
        schemaErrors?: Array<{ path?: string; message?: string }>;
        conformanceIssues?: Array<{ path?: string; message?: string }>;
        errors?: Array<{ path?: string; message?: string } | string>;
        warnings?: string[];
      }>;
  recipeSchema?: unknown;
  schema?: unknown;
  schemas?: {
    recipe?: unknown;
  };
};

const fallbackSchema = {
  type: "object",
  required: ["profile", "name", "stacks", "ingredients", "instructions"],
  properties: {
    $schema: {
      type: "string",
      // Accept canonical URL, legacy URLs, or missing (for backward compatibility)
      // The canonical URL is preferred, but we don't hard-fail on legacy values
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
      type: "object",
      additionalProperties: true,
    },
    ingredients: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    instructions: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    "x-prep": {
      type: "object",
      properties: {
        section: {
          type: "array",
          items: { type: "string" },
        },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: { type: "number" },
              raw: { type: "string" },
              base: { type: "string" },
              prep: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["index", "raw", "base", "prep"],
            additionalProperties: false,
          },
        },
        generatedAt: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    metadata: {
      type: "object",
      properties: {
        originalTitle: { type: "string" },
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

async function loadSchemaFromString(schemaRef: string, moduleName: string): Promise<unknown | null> {
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
      : path.join(path.dirname(moduleRequire.resolve(`${moduleName}/package.json`)), schemaRef);
    const raw = await fs.promises.readFile(resolved, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function loadSchemaFromPackage(moduleName: string): Promise<unknown | null> {
  try {
    const root = path.dirname(moduleRequire.resolve(`${moduleName}/package.json`));
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

function normalizeIssue(issue: unknown): string {
  if (typeof issue === "string") {
    return issue;
  }
  if (issue && typeof issue === "object") {
    const path = (issue as { path?: string; instancePath?: string }).path ?? "";
    const message =
      (issue as { message?: string; error?: string }).message ??
      (issue as { error?: string }).error ??
      "is invalid";
    const normalizedPath = path || (issue as { instancePath?: string }).instancePath || "";
    return [normalizedPath, message].filter(Boolean).join(" ").trim();
  }
  return "is invalid";
}

function normalizeValidateRecipeResult(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Validator returned no result"] };
  }

  const typed = raw as {
    ok?: boolean;
    valid?: boolean;
    success?: boolean;
    schemaErrors?: Array<unknown>;
    conformanceIssues?: Array<unknown>;
    errors?: Array<unknown>;
  };

  const errors: string[] = [];
  for (const issue of typed.schemaErrors ?? []) {
    errors.push(normalizeIssue(issue));
  }
  for (const issue of typed.conformanceIssues ?? []) {
    errors.push(normalizeIssue(issue));
  }
  for (const issue of typed.errors ?? []) {
    errors.push(normalizeIssue(issue));
  }

  const ok = Boolean(typed.ok ?? typed.valid ?? typed.success);
  return { ok: ok && errors.length === 0, errors };
}

function wrapValidateRecipe(
  validateRecipeFn: NonNullable<CoreValidationModule["validateRecipe"]>
): Validator {
  return {
    validate: (recipe: SoustackRecipe) => {
      const result = validateRecipeFn(recipe);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return {
          ok: false,
          errors: ["validateRecipe returned a Promise; async validators are not supported"],
        };
      }
      return normalizeValidateRecipeResult(result);
    },
  };
}

async function selectValidatorFromModule(moduleName: string): Promise<Validator | null> {
  try {
    const module = await import(moduleName);
    const core = module as CoreValidationModule;
    if (core.validateRecipe) {
      return wrapValidateRecipe(core.validateRecipe);
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
      const resolved = await loadSchemaFromString(schemaRef, moduleName);
      if (resolved) {
        return buildAjvValidator(resolved);
      }
    }
    const packagedSchema = await loadSchemaFromPackage(moduleName);
    if (packagedSchema) {
      return buildAjvValidator(packagedSchema);
    }
  } catch {
    return null;
  }
  return null;
}

const validatorModuleCandidates = [
  process.env.SOUSTACK_VALIDATOR_MODULE,
  "soustack-core",
].filter(Boolean) as string[];

let activeValidator: Validator = buildAjvValidator(fallbackSchema);
const coreValidatorPromise = (async () => {
  for (const moduleName of validatorModuleCandidates) {
    const validator = await selectValidatorFromModule(moduleName);
    if (validator) {
      return validator;
    }
  }
  return null;
})();

export async function initValidator(): Promise<void> {
  const validator = await coreValidatorPromise;
  activeValidator = validator ?? buildAjvValidator(fallbackSchema);
}

export function validate(recipe: SoustackRecipe): ValidationResult {
  return activeValidator.validate(recipe);
}
