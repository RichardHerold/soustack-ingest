import path from "path";
import { readRtfdZip } from "./rtfdZip";
import { readTxt } from "./txt";
import { AdapterOutput } from "../pipeline";

export { readTxt } from "./txt";
export { readRtfdZip } from "./rtfdZip";

export async function loadInput(inputPath: string): Promise<AdapterOutput> {
  const normalizedPath = inputPath.toLowerCase();
  if (normalizedPath.endsWith(".zip") && normalizedPath.includes(".rtfd")) {
    return readRtfdZip(inputPath);
  }

  const extension = path.extname(normalizedPath);
  if (extension === ".txt") {
    return readTxt(inputPath);
  }

  throw new Error(`Unsupported input extension: ${extension}`);
}
