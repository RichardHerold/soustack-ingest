"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPdf = exports.readDocx = exports.readRtfdDirectory = exports.readRtfdZip = exports.readTxt = void 0;
exports.loadInput = loadInput;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const rtfdZip_1 = require("./rtfdZip");
const txt_1 = require("./txt");
const docx_1 = require("./docx");
const pdf_1 = require("./pdf");
var txt_2 = require("./txt");
Object.defineProperty(exports, "readTxt", { enumerable: true, get: function () { return txt_2.readTxt; } });
var rtfdZip_2 = require("./rtfdZip");
Object.defineProperty(exports, "readRtfdZip", { enumerable: true, get: function () { return rtfdZip_2.readRtfdZip; } });
var rtfdZip_3 = require("./rtfdZip");
Object.defineProperty(exports, "readRtfdDirectory", { enumerable: true, get: function () { return rtfdZip_3.readRtfdDirectory; } });
var docx_2 = require("./docx");
Object.defineProperty(exports, "readDocx", { enumerable: true, get: function () { return docx_2.readDocx; } });
var pdf_2 = require("./pdf");
Object.defineProperty(exports, "readPdf", { enumerable: true, get: function () { return pdf_2.readPdf; } });
async function loadInput(inputPath) {
    const normalizedPath = inputPath.toLowerCase();
    if (normalizedPath.endsWith(".zip") && normalizedPath.includes(".rtfd")) {
        return (0, rtfdZip_1.readRtfdZip)(inputPath);
    }
    const extension = path_1.default.extname(normalizedPath);
    if (extension === ".rtfd") {
        // Check if it's a directory (rtfd bundle) or a zip file
        const stats = await fs_1.promises.stat(inputPath);
        if (stats.isDirectory()) {
            return (0, rtfdZip_1.readRtfdDirectory)(inputPath);
        }
        else {
            // Treat as zip file
            return (0, rtfdZip_1.readRtfdZip)(inputPath);
        }
    }
    if (extension === ".txt") {
        return (0, txt_1.readTxt)(inputPath);
    }
    if (extension === ".docx") {
        return (0, docx_1.readDocx)(inputPath);
    }
    if (extension === ".pdf") {
        return (0, pdf_1.readPdf)(inputPath);
    }
    throw new Error(`Unsupported input extension: ${extension}`);
}
