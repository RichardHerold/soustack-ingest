"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initValidator = initValidator;
exports.validate = validate;
const node_module_1 = require("node:module");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const ajv_1 = __importDefault(require("ajv"));
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
const moduleRequire = (0, node_module_1.createRequire)(typeof __filename !== "undefined" ? __filename : process.cwd());
function toJsonPathSegment(segment) {
    if (/^\d+$/.test(segment)) {
        return `[${segment}]`;
    }
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
        return `.${segment}`;
    }
    return `['${segment.replace(/'/g, "\\'")}']`;
}
function toJsonPath(instancePath, missingProperty) {
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
function formatAjvError(error) {
    const path = toJsonPath(error.instancePath, error.params.missingProperty);
    const message = error.message ?? "is invalid";
    return `${path} ${message}`.trim();
}
function buildAjvValidator(schema) {
    const ajv = new ajv_1.default({ allErrors: true, strict: false });
    const validateSchema = ajv.compile(schema);
    return {
        validate: (recipe) => {
            const ok = validateSchema(recipe);
            if (ok) {
                return { ok: true, errors: [] };
            }
            const errors = (validateSchema.errors ?? []).map((error) => formatAjvError(error));
            return { ok: false, errors };
        },
    };
}
function resolveSchemaFromModule(core) {
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
async function loadSchemaFromString(schemaRef) {
    if (schemaRef.startsWith("http://") || schemaRef.startsWith("https://")) {
        const response = await fetch(schemaRef);
        if (!response.ok) {
            return null;
        }
        return (await response.json());
    }
    try {
        const resolved = node_path_1.default.isAbsolute(schemaRef)
            ? schemaRef
            : node_path_1.default.join(node_path_1.default.dirname(moduleRequire.resolve("soustack/package.json")), schemaRef);
        const raw = await node_fs_1.default.promises.readFile(resolved, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function loadSchemaFromPackage() {
    try {
        const root = node_path_1.default.dirname(moduleRequire.resolve("soustack/package.json"));
        const candidates = [
            "recipe.schema.json",
            "schema/recipe.schema.json",
            "schemas/recipe.schema.json",
            "dist/recipe.schema.json",
            "dist/schema/recipe.schema.json",
            "dist/schemas/recipe.schema.json",
        ];
        for (const candidate of candidates) {
            const filePath = node_path_1.default.join(root, candidate);
            if (node_fs_1.default.existsSync(filePath)) {
                const raw = await node_fs_1.default.promises.readFile(filePath, "utf-8");
                return JSON.parse(raw);
            }
        }
    }
    catch {
        return null;
    }
    return null;
}
let activeValidator = buildAjvValidator(fallbackSchema);
const coreValidatorPromise = (async () => {
    try {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:142', message: 'Importing soustack module', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        const module = await Promise.resolve().then(() => __importStar(require("soustack")));
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:144', message: 'soustack module imported', data: { hasValidateRecipe: !!module.validateRecipe }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion
        const core = module;
        if (core.validateRecipe) {
            const validateRecipeFn = core.validateRecipe;
            return {
                validate: (recipe) => {
                    // #region agent log
                    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:149', message: 'Calling soustack validateRecipe', data: { recipeName: recipe.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
                    // #endregion
                    const result = validateRecipeFn(recipe);
                    // #region agent log
                    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:152', message: 'soustack validateRecipe result', data: { ok: result.ok, hasSchemaErrors: !!result.schemaErrors, hasConformanceIssues: !!result.conformanceIssues, schemaErrorCount: result.schemaErrors?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
                    // #endregion
                    // Convert soustack ValidateResult to local ValidationResult format
                    const errors = [];
                    if (result.schemaErrors) {
                        errors.push(...result.schemaErrors.map((e) => `${e.path} ${e.message}`));
                    }
                    if (result.conformanceIssues) {
                        errors.push(...result.conformanceIssues.map((e) => `${e.path} ${e.message}`));
                    }
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
        const schemaRef = typeof core.schema === "string"
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
    }
    catch {
        return null;
    }
    return null;
})();
async function initValidator() {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:189', message: 'initValidator called', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
    // #endregion
    const validator = await coreValidatorPromise;
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:192', message: 'Validator resolved', data: { hasValidator: !!validator }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
    // #endregion
    if (validator) {
        activeValidator = validator;
    }
}
function validate(recipe) {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:203', message: 'validate called', data: { recipeName: recipe.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
    // #endregion
    const result = activeValidator.validate(recipe);
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/e57cfe72-9edb-4211-85b1-172504310ac9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'validate.ts:206', message: 'validate result', data: { ok: result.ok, errorCount: result.errors.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'pre-fix', hypothesisId: 'C' }) }).catch(() => { });
    // #endregion
    return result;
}
