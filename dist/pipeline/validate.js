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
async function loadSchemaFromString(schemaRef, moduleName) {
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
            : node_path_1.default.join(node_path_1.default.dirname(moduleRequire.resolve(`${moduleName}/package.json`)), schemaRef);
        const raw = await node_fs_1.default.promises.readFile(resolved, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function loadSchemaFromPackage(moduleName) {
    try {
        const root = node_path_1.default.dirname(moduleRequire.resolve(`${moduleName}/package.json`));
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
function normalizeIssue(issue) {
    if (typeof issue === "string") {
        return issue;
    }
    if (issue && typeof issue === "object") {
        const path = issue.path ?? "";
        const message = issue.message ??
            issue.error ??
            "is invalid";
        const normalizedPath = path || issue.instancePath || "";
        return [normalizedPath, message].filter(Boolean).join(" ").trim();
    }
    return "is invalid";
}
function normalizeValidateRecipeResult(raw) {
    if (!raw || typeof raw !== "object") {
        return { ok: false, errors: ["Validator returned no result"] };
    }
    const typed = raw;
    const errors = [];
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
function wrapValidateRecipe(validateRecipeFn) {
    return {
        validate: (recipe) => {
            const result = validateRecipeFn(recipe);
            if (result && typeof result.then === "function") {
                return {
                    ok: false,
                    errors: ["validateRecipe returned a Promise; async validators are not supported"],
                };
            }
            return normalizeValidateRecipeResult(result);
        },
    };
}
async function selectValidatorFromModule(moduleName) {
    try {
        const module = await Promise.resolve(`${moduleName}`).then(s => __importStar(require(s)));
        const core = module;
        if (core.validateRecipe) {
            return wrapValidateRecipe(core.validateRecipe);
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
            const resolved = await loadSchemaFromString(schemaRef, moduleName);
            if (resolved) {
                return buildAjvValidator(resolved);
            }
        }
        const packagedSchema = await loadSchemaFromPackage(moduleName);
        if (packagedSchema) {
            return buildAjvValidator(packagedSchema);
        }
    }
    catch {
        return null;
    }
    return null;
}
const validatorModuleCandidates = [
    process.env.SOUSTACK_VALIDATOR_MODULE,
    "soustack-core",
].filter(Boolean);
let activeValidator = buildAjvValidator(fallbackSchema);
const coreValidatorPromise = (async () => {
    for (const moduleName of validatorModuleCandidates) {
        const validator = await selectValidatorFromModule(moduleName);
        if (validator) {
            return validator;
        }
    }
    return null;
})();
async function initValidator() {
    const validator = await coreValidatorPromise;
    activeValidator = validator ?? buildAjvValidator(fallbackSchema);
}
function validate(recipe) {
    return activeValidator.validate(recipe);
}
