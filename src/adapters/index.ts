import path from "path";
import { promises as fs } from "fs";
import { readRtfdZip, readRtfdDirectory } from "./rtfdZip";
import { readTxt } from "./txt";
import { readDocx } from "./docx";
import { readPdf } from "./pdf";
import { readRtf } from "./rtf";
import { AdapterOutput } from "../pipeline";

export { readTxt } from "./txt";
export { readRtfdZip } from "./rtfdZip";
export { readRtfdDirectory } from "./rtfdZip";
export { readDocx } from "./docx";
export { readPdf } from "./pdf";
export { readRtf } from "./rtf";

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".rtf", ".rtfd", ".rtfd.zip", ".docx", ".pdf"] as const;

export async function loadInput(inputPath: string): Promise<AdapterOutput> {
  const normalizedPath = inputPath.toLowerCase();
  if (
    normalizedPath.endsWith(".rtfd.zip") ||
    (normalizedPath.endsWith(".zip") && normalizedPath.includes(".rtfd"))
  ) {
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
  if (extension === ".rtf") {
    return readRtf(inputPath);
  }
  if (extension === ".txt" || extension === ".md") {
    return readTxt(inputPath);
  }
  if (extension === ".docx") {
    return readDocx(inputPath);
  }
  if (extension === ".pdf") {
    return readPdf(inputPath);
  }

  const supportedList = SUPPORTED_EXTENSIONS.join(", ");
  const details = extension || path.basename(normalizedPath) || normalizedPath;
  throw new Error(`Unsupported input extension: ${details}. Supported extensions: ${supportedList}`);
}
