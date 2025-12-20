"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTxt = readTxt;
const fs_1 = require("fs");
async function readTxt(filePath) {
    const text = await fs_1.promises.readFile(filePath, "utf-8");
    return {
        kind: "text",
        text,
        meta: {
            sourcePath: filePath,
        },
    };
}
