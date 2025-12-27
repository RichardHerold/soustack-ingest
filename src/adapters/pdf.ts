import { promises as fs } from "fs";
import pdfParse from "pdf-parse";
import { AdapterOutput } from "../pipeline";

export async function readPdf(inputPath: string): Promise<AdapterOutput> {
  const buffer = await fs.readFile(inputPath);
  const result = await pdfParse(buffer);
  return {
    kind: "text",
    text: result.text,
    meta: {
      sourcePath: inputPath,
    },
  };
}

