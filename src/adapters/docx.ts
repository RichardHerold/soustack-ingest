import { promises as fs } from "fs";
import mammoth from "mammoth";
import { AdapterOutput } from "../pipeline";

export async function readDocx(inputPath: string): Promise<AdapterOutput> {
  const buffer = await fs.readFile(inputPath);
  const result = await mammoth.extractRawText({ buffer });
  return {
    kind: "text",
    text: result.value,
    meta: {
      sourcePath: inputPath,
    },
  };
}

