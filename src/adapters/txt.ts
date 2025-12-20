import { promises as fs } from "fs";
import { AdapterOutput } from "../pipeline";

export async function readTxt(filePath: string): Promise<AdapterOutput> {
  const text = await fs.readFile(filePath, "utf-8");
  return {
    kind: "text",
    text,
    meta: {
      sourcePath: filePath,
    },
  };
}
