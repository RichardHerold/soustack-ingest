"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPdf = readPdf;
const fs_1 = require("fs");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
async function readPdf(inputPath) {
    const buffer = await fs_1.promises.readFile(inputPath);
    const result = await (0, pdf_parse_1.default)(buffer);
    return {
        kind: "text",
        text: result.text,
        meta: {
            sourcePath: inputPath,
        },
    };
}
