"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalize = normalize;
function normalize(input) {
    const normalized = input.replace(/\r\n?/g, "\n").replace(/\f/g, "\n");
    const lines = normalized.split("\n").map((text, index) => ({
        n: index + 1,
        text,
    }));
    return {
        fullText: normalized,
        lines,
    };
}
