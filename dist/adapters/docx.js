"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readDocx = readDocx;
const fs_1 = require("fs");
const mammoth_1 = __importDefault(require("mammoth"));
async function readDocx(inputPath) {
    const buffer = await fs_1.promises.readFile(inputPath);
    const result = await mammoth_1.default.extractRawText({ buffer });
    return {
        kind: "text",
        text: result.value,
        meta: {
            sourcePath: inputPath,
        },
    };
}
