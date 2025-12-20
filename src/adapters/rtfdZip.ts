import { promises as fs } from "fs";
import { AdapterOutput } from "../pipeline";

export async function readRtfdZip(filePath: string): Promise<AdapterOutput> {
  const buffer = await fs.readFile(filePath);
  const placeholderText = buffer.length
    ? "RTFD ZIP content detected. Parsing not implemented yet."
    : "";

  return {
    sourcePath: filePath,
    text: placeholderText,
  };
}
