import path from "path";
import { promises as fs } from "fs";
import { readRtfdZip, readRtfdDirectory } from "./rtfdZip";
import { readTxt } from "./txt";
import { AdapterOutput } from "../pipeline";

export { readTxt } from "./txt";
export { readRtfdZip } from "./rtfdZip";
export { readRtfdDirectory } from "./rtfdZip";

export async function loadInput(inputPath: string): Promise<AdapterOutput> {
  const normalizedPath = inputPath.toLowerCase();
  if (normalizedPath.endsWith(".zip") && normalizedPath.includes(".rtfd")) {
    return readRtfdZip(inputPath);
  }

  const extension = path.extname(normalizedPath);
  if (extension === ".rtfd") {
    // Check if it's a directory (rtfd bundle) or a zip file
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      return readRtfdDirectory(inputPath);
    } else {
      // Treat as zip file
      return readRtfdZip(inputPath);
    }
  }
  if (extension === ".txt") {
    return readTxt(inputPath);
  }

  throw new Error(`Unsupported input extension: ${extension}`);
}
