import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ZipEntry = {
  entryName: string;
  isDirectory: boolean;
  getData: () => Buffer;
};

function listPaths(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const resolved = fs.realpathSync(fullPath);
        if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
          throw new Error(`Zip entry resolves outside of extraction directory: ${entry.name}`);
        }
      }
      results.push(fullPath);
      if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  };
  walk(root);
  return results;
}

function createEntry(entryPath: string, root: string): ZipEntry {
  const stats = fs.lstatSync(entryPath);
  const entryName = path.relative(root, entryPath).split(path.sep).join("/");
  return {
    entryName,
    isDirectory: stats.isDirectory(),
    getData: () => (stats.isDirectory() ? Buffer.alloc(0) : fs.readFileSync(entryPath)),
  };
}

function validateZipEntries(zipPath: string): void {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf-8" });
  const entries = listing.split("\n").filter(Boolean);

  for (const rawEntry of entries) {
    const normalized = path.posix.normalize(rawEntry.replace(/\\/g, "/"));
    const isAbsolute = path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized);
    if (!normalized || normalized === "." || normalized.startsWith("..") || isAbsolute) {
      throw new Error(`Unsafe zip entry path: ${rawEntry}`);
    }
  }
}

export class ZipArchive {
  private stagedEntries: Array<{ entryName: string; data: Buffer }> = [];
  private entries: ZipEntry[] = [];

  constructor(zipPath?: string) {
    if (zipPath) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "soustack-zip-"));
      validateZipEntries(zipPath);
      execFileSync("unzip", ["-qq", zipPath, "-d", tempDir]);
      this.entries = listPaths(tempDir).map((entryPath) => createEntry(entryPath, tempDir));
    }
  }

  addFile(entryName: string, data: Buffer): void {
    this.stagedEntries.push({ entryName, data });
  }

  writeZip(targetPath: string): void {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "soustack-zip-build-"));
    for (const entry of this.stagedEntries) {
      const destination = path.join(workDir, entry.entryName.split("/").join(path.sep));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.data);
    }

    const cwd = process.cwd();
    process.chdir(workDir);
    try {
      execFileSync("zip", ["-qr", targetPath, "."]);
    } finally {
      process.chdir(cwd);
    }
  }

  getEntries(): ZipEntry[] {
    return this.entries;
  }
}
