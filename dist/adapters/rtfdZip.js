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
exports.readRtfdZip = readRtfdZip;
exports.readRtfdDirectory = readRtfdDirectory;
/// <reference path="../types/external.d.ts" />
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const zip_1 = require("../lib/zip");
async function listFiles(root) {
    const entries = await fs_1.promises.readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path_1.default.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listFiles(fullPath)));
        }
        else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
}
function scoreRtfCandidate(filePath) {
    const name = path_1.default.basename(filePath).toLowerCase();
    if (name === "txt.rtf" || name === "text.rtf") {
        return 3;
    }
    if (name.startsWith("txt") && name.endsWith(".rtf")) {
        return 2;
    }
    return 1;
}
async function findPrimaryRtf(extractedPath) {
    const files = await listFiles(extractedPath);
    const rtfFiles = files.filter((file) => path_1.default.extname(file).toLowerCase() === ".rtf");
    if (rtfFiles.length === 0) {
        return null;
    }
    const candidates = [];
    for (const filePath of rtfFiles) {
        const stats = await fs_1.promises.stat(filePath);
        candidates.push({
            filePath,
            size: stats.size,
            priority: scoreRtfCandidate(filePath),
        });
    }
    candidates.sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority;
        }
        return b.size - a.size;
    });
    return candidates[0];
}
function convertRtfFallback(rtf) {
    return rtf
        .replace(/\r\n/g, "\n")
        .replace(/\\par[d]?/g, "\n")
        .replace(/\\'[0-9a-fA-F]{2}/g, "")
        .replace(/\\[a-zA-Z]+\d* ?/g, "")
        .replace(/[{}]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
async function convertWithNode(rtf) {
    try {
        const module = await Promise.resolve().then(() => __importStar(require("rtf2text")));
        const converter = module.default ?? module;
        if (typeof converter === "function") {
            const result = await Promise.resolve(converter(rtf));
            return result?.trim() ? result : null;
        }
        if (converter && typeof converter.fromString === "function") {
            const result = await new Promise((resolve, reject) => {
                converter.fromString(rtf, (error, text) => {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(text ?? "");
                    }
                });
            });
            return result.trim() ? result : null;
        }
    }
    catch {
        return null;
    }
    return null;
}
async function runCommand(command, args, input) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            reject(error);
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(stderr || `${command} exited with code ${code}`));
            }
        });
        if (input) {
            child.stdin.write(input);
        }
        child.stdin.end();
    });
}
async function convertWithPandoc(rtfPath) {
    try {
        const result = await runCommand("pandoc", ["--from", "rtf", "--to", "plain", rtfPath]);
        return result.trim() ? result : null;
    }
    catch {
        return null;
    }
}
async function convertWithTextutil(rtfPath) {
    try {
        const result = await runCommand("textutil", ["-convert", "txt", "-stdout", rtfPath]);
        return result.trim() ? result : null;
    }
    catch {
        return null;
    }
}
async function convertRtfToText(rtfPath) {
    const rtf = await fs_1.promises.readFile(rtfPath, "utf-8");
    const nodeResult = await convertWithNode(rtf);
    if (nodeResult) {
        return nodeResult;
    }
    const pandocResult = await convertWithPandoc(rtfPath);
    if (pandocResult) {
        return pandocResult;
    }
    const textutilResult = await convertWithTextutil(rtfPath);
    if (textutilResult) {
        return textutilResult;
    }
    return convertRtfFallback(rtf);
}
async function readRtfdZip(filePath) {
    const extractedPath = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "soustack-rtfd-"));
    const zip = new zip_1.ZipArchive(filePath);
    const entries = zip.getEntries();
    for (const entry of entries) {
        const entryName = entry.entryName;
        const resolvedPath = path_1.default.resolve(extractedPath, entryName);
        if (resolvedPath !== extractedPath && !resolvedPath.startsWith(`${extractedPath}${path_1.default.sep}`)) {
            throw new Error(`Blocked zip entry with invalid path: ${entryName}`);
        }
        if (entry.isDirectory) {
            await fs_1.promises.mkdir(resolvedPath, { recursive: true });
            continue;
        }
        await fs_1.promises.mkdir(path_1.default.dirname(resolvedPath), { recursive: true });
        const data = entry.getData();
        await fs_1.promises.writeFile(resolvedPath, data);
    }
    const primaryRtf = await findPrimaryRtf(extractedPath);
    if (!primaryRtf) {
        throw new Error(`No .rtf files found in ${filePath}`);
    }
    const text = await convertRtfToText(primaryRtf.filePath);
    return {
        kind: "text",
        text,
        assets: [primaryRtf.filePath],
        meta: {
            sourcePath: filePath,
            extractedPath,
        },
    };
}
async function readRtfdDirectory(dirPath) {
    const primaryRtf = await findPrimaryRtf(dirPath);
    if (!primaryRtf) {
        throw new Error(`No .rtf files found in ${dirPath}`);
    }
    const text = await convertRtfToText(primaryRtf.filePath);
    return {
        kind: "text",
        text,
        assets: [primaryRtf.filePath],
        meta: {
            sourcePath: dirPath,
        },
    };
}
