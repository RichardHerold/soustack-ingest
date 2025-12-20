import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import Ajv, { ErrorObject } from "ajv";

import { SoustackRecipe, ValidationResult } from "./types";

export interface Validator {
  validate(recipe: SoustackRecipe): ValidationResult;
}

type CoreValidationModule = {
  validator?: Validator;
  validateRecipe?: (recipe: SoustackRecipe) => ValidationResult;
  recipeSchema?: unknown;
  schema?: unknown;
  schemas?: {
    recipe?: unknown;
  };
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

const require = createRequire(import.meta.url);

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
  const validateSchema = ajv.compile(schema);
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
      : path.join(path.dirname(require.resolve("soustack-core/package.json")), schemaRef);
    const raw = await fs.promises.readFile(resolved, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function loadSchemaFromPackage(): Promise<unknown | null> {
  try {
    const root = path.dirname(require.resolve("soustack-core/package.json"));
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

const coreValidatorPromise = (async () => {
  try {
    const module = await import("soustack-core");
    const core = module as CoreValidationModule;
    if (core.validator) {
      return core.validator;
    }
    if (core.validateRecipe) {
      return {
        validate: core.validateRecipe,
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

void coreValidatorPromise.then((validator) => {
  if (validator) {
    activeValidator = validator;
  }
});

export function validate(recipe: SoustackRecipe): ValidationResult {
  return activeValidator.validate(recipe);
}
