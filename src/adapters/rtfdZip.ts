/// <reference path="../types/external.d.ts" />
import AdmZip from "adm-zip";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { AdapterOutput } from "../pipeline";

type RtfCandidate = {
  filePath: string;
  size: number;
  priority: number;
};

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function scoreRtfCandidate(filePath: string): number {
  const name = path.basename(filePath).toLowerCase();
  if (name === "txt.rtf" || name === "text.rtf") {
    return 3;
  }
  if (name.startsWith("txt") && name.endsWith(".rtf")) {
    return 2;
  }
  return 1;
}

async function findPrimaryRtf(extractedPath: string): Promise<RtfCandidate | null> {
  const files = await listFiles(extractedPath);
  const rtfFiles = files.filter((file) => path.extname(file).toLowerCase() === ".rtf");

  if (rtfFiles.length === 0) {
    return null;
  }

  const candidates: RtfCandidate[] = [];
  for (const filePath of rtfFiles) {
    const stats = await fs.stat(filePath);
    candidates.push({
      filePath,
      size: stats.size,
      priority: scoreRtfCandidate(filePath),
    });
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return b.size - a.size;
  });

  return candidates[0];
}

function convertRtfFallback(rtf: string): string {
  return rtf
    .replace(/\r\n/g, "\n")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function convertWithNode(rtf: string): Promise<string | null> {
  try {
    const module = await import("rtf2text");
    const converter = (module as { default?: unknown }).default ?? module;

    if (typeof converter === "function") {
      const result = await Promise.resolve((converter as (input: string) => string | Promise<string>)(rtf));
      return result?.trim() ? result : null;
    }

    if (converter && typeof (converter as { fromString?: unknown }).fromString === "function") {
      const result = await new Promise<string>((resolve, reject) => {
        (converter as { fromString: (input: string, cb: (err: Error | null, text?: string) => void) => void }).fromString(
          rtf,
          (error, text) => {
            if (error) {
              reject(error);
            } else {
              resolve(text ?? "");
            }
          },
        );
      });
      return result.trim() ? result : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function runCommand(command: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `${command} exited with code ${code}`));
      }
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function convertWithPandoc(rtfPath: string): Promise<string | null> {
  try {
    const result = await runCommand("pandoc", ["--from", "rtf", "--to", "plain", rtfPath]);
    return result.trim() ? result : null;
  } catch {
    return null;
  }
}

async function convertWithTextutil(rtfPath: string): Promise<string | null> {
  try {
    const result = await runCommand("textutil", ["-convert", "txt", "-stdout", rtfPath]);
    return result.trim() ? result : null;
  } catch {
    return null;
  }
}

async function convertRtfToText(rtfPath: string): Promise<string> {
  const rtf = await fs.readFile(rtfPath, "utf-8");

  const nodeResult = await convertWithNode(rtf);
  if (nodeResult) {
    return nodeResult;
  }

  const pandocResult = await convertWithPandoc(rtfPath);
  if (pandocResult) {
    return pandocResult;
  }

  const textutilResult = await convertWithTextutil(rtfPath);
  if (textutilResult) {
    return textutilResult;
  }

  return convertRtfFallback(rtf);
}

export async function readRtfdZip(filePath: string): Promise<AdapterOutput> {
  const extractedPath = await fs.mkdtemp(path.join(os.tmpdir(), "soustack-rtfd-"));
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryName = entry.entryName;
    const resolvedPath = path.resolve(extractedPath, entryName);
    if (resolvedPath !== extractedPath && !resolvedPath.startsWith(`${extractedPath}${path.sep}`)) {
      throw new Error(`Blocked zip entry with invalid path: ${entryName}`);
    }

    if (entry.isDirectory) {
      await fs.mkdir(resolvedPath, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    const data = entry.getData();
    await fs.writeFile(resolvedPath, data);
  }

  const primaryRtf = await findPrimaryRtf(extractedPath);
  if (!primaryRtf) {
    throw new Error(`No .rtf files found in ${filePath}`);
  }

  const text = await convertRtfToText(primaryRtf.filePath);

  return {
    kind: "text",
    text,
    assets: [primaryRtf.filePath],
    meta: {
      sourcePath: filePath,
      extractedPath,
    },
  };
}

export async function readRtfdDirectory(dirPath: string): Promise<AdapterOutput> {
  const primaryRtf = await findPrimaryRtf(dirPath);
  if (!primaryRtf) {
    throw new Error(`No .rtf files found in ${dirPath}`);
  }

  const text = await convertRtfToText(primaryRtf.filePath);

  return {
    kind: "text",
    text,
    assets: [primaryRtf.filePath],
    meta: {
      sourcePath: dirPath,
    },
  };
}
