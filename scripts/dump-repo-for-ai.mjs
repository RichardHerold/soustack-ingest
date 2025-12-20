#!/usr/bin/env node

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_MAX_FILE_KB = 256;
const DEFAULT_MAX_TOTAL_MB = 10;

const DEFAULT_IGNORE_PATTERNS = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  'out/',
  'coverage/',
  '.cache/',
  '.parcel-cache/',
  '.turbo/',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'npm-shrinkwrap.json'
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.tif',
  '.tiff',
  '.psd',
  '.ai',
  '.eps',
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mpg',
  '.mpeg',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.rar',
  '.pdf',
  '.exe',
  '.bin',
  '.dll',
  '.so',
  '.dylib',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot'
]);

function parseArgs(argv) {
  const args = {
    out: 'soustack-injest-repo-pack.md',
    maxFileKB: DEFAULT_MAX_FILE_KB,
    maxTotalMB: DEFAULT_MAX_TOTAL_MB
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--maxFileKB' && argv[i + 1]) {
      args.maxFileKB = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--maxTotalMB' && argv[i + 1]) {
      args.maxTotalMB = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function globToRegex(glob) {
  let regex = '';
  let i = 0;
  while (i < glob.length) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        regex += '.*';
        i += 2;
      } else {
        regex += '[^/]*';
        i += 1;
      }
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      i += 1;
      continue;
    }
    regex += char.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
    i += 1;
  }
  return new RegExp(`^${regex}$`);
}

function compilePatterns(patterns) {
  return patterns.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return null;
    }
    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1) : trimmed;
    const normalized = pattern.replace(/\\/g, '/').replace(/^\//, '');
    return {
      raw: trimmed,
      negated,
      pattern: normalized,
      regex: globToRegex(normalized),
      hasSlash: normalized.includes('/')
    };
  }).filter(Boolean);
}

function matchPattern(relPath, isDir, entryName, entry, patterns) {
  let ignored = false;
  const pathToMatch = isDir ? `${relPath}/` : relPath;
  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    const matchesPath = pattern.regex.test(relPath) || pattern.regex.test(pathToMatch);
    const matchesName = !pattern.hasSlash && pattern.regex.test(entryName);
    if (matchesPath || matchesName) {
      ignored = !pattern.negated;
    }
  }
  if (ignored) {
    entry.reason = 'ignored by pattern';
  }
  return ignored;
}

async function readIgnoreFile(root, filename) {
  const filePath = path.join(root, filename);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  } catch (error) {
    return [];
  }
}

function isBinaryExtension(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isUtf8(buffer) {
  if (buffer.includes(0)) {
    return false;
  }
  const text = buffer.toString('utf8');
  return Buffer.from(text, 'utf8').length === buffer.length;
}

function getTimestamp(repoRoot) {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  if (sourceDateEpoch) {
    const timestamp = Number(sourceDateEpoch) * 1000;
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }
  try {
    const commitTime = execFileSync('git', ['log', '-1', '--format=%cI'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    if (commitTime) {
      return commitTime;
    }
  } catch (error) {
    // ignore
  }
  return new Date().toISOString();
}

function getGitMetadata(repoRoot) {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    const dirtyOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    const dirty = dirtyOutput.trim().length > 0;
    return { branch, sha, dirty };
  } catch (error) {
    return null;
  }
}

async function collectFiles(repoRoot, options) {
  const ignoreFiles = await Promise.all([
    readIgnoreFile(repoRoot, '.gitignore'),
    readIgnoreFile(repoRoot, '.repo-pack-ignore')
  ]);

  const ignorePatterns = [
    ...compilePatterns(DEFAULT_IGNORE_PATTERNS),
    ...compilePatterns(ignoreFiles[0]),
    ...compilePatterns(ignoreFiles[1]),
    ...compilePatterns([options.outFile])
  ];

  const included = [];
  const skipped = [];
  let totalBytes = 0;

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      skipped.push({
        path: toPosixPath(path.relative(repoRoot, currentDir)) || '.',
        reason: `read error: ${error.message}`
      });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));
      const skipEntry = { path: relativePath, reason: '' };

      if (matchPattern(relativePath, entry.isDirectory(), entry.name, skipEntry, ignorePatterns)) {
        skipped.push(skipEntry);
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        skipped.push({ path: relativePath, reason: 'symbolic link' });
        continue;
      }

      if (isBinaryExtension(relativePath)) {
        skipped.push({ path: relativePath, reason: 'binary extension' });
        continue;
      }

      let buffer;
      try {
        buffer = await fs.readFile(absolutePath);
      } catch (error) {
        skipped.push({ path: relativePath, reason: `read error: ${error.message}` });
        continue;
      }

      if (!isUtf8(buffer)) {
        skipped.push({ path: relativePath, reason: 'non-utf8 or binary content' });
        continue;
      }

      const fileSizeKB = buffer.length / 1024;
      if (fileSizeKB > options.maxFileKB) {
        skipped.push({
          path: relativePath,
          reason: `exceeds maxFileKB (${options.maxFileKB})`
        });
        continue;
      }

      if (totalBytes + buffer.length > options.maxTotalBytes) {
        skipped.push({
          path: relativePath,
          reason: `exceeds maxTotalMB (${options.maxTotalMB})`
        });
        continue;
      }

      totalBytes += buffer.length;
      included.push({
        path: relativePath,
        bytes: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        contents: buffer.toString('utf8')
      });
    }
  }

  await walk(repoRoot);
  return { included, skipped, totalBytes };
}

function formatOutput({ repoName, repoRoot, gitInfo, limits, files, skipped, totalBytes }) {
  const lines = [];
  lines.push(`# Repo Pack: ${repoName}`);
  lines.push(`Generated: ${getTimestamp(repoRoot)}`);
  if (gitInfo) {
    lines.push(`Git: branch=${gitInfo.branch} sha=${gitInfo.sha} dirty=${gitInfo.dirty}`);
  }
  lines.push(`Limits: maxFileKB=${limits.maxFileKB}, maxTotalMB=${limits.maxTotalMB}`);
  lines.push('');
  lines.push('## File Tree (paths)');
  lines.push('```text');
  for (const file of files) {
    lines.push(file.path);
  }
  lines.push('```');
  lines.push('');
  lines.push('Files (contents)');
  lines.push('');

  for (const file of files) {
    lines.push(`FILE: ${file.path}`);
    lines.push(`\t• bytes: ${file.bytes}`);
    lines.push(`\t• sha256: ${file.sha256}`);
    lines.push('');
    lines.push(file.contents);
    lines.push('');
  }

  lines.push('Summary');
  lines.push('');
  lines.push(`Included files: ${files.length}`);
  lines.push(`Skipped files: ${skipped.length}`);
  lines.push(`Total included bytes: ${totalBytes}`);
  lines.push('');
  lines.push('Skipped (top reasons)');
  for (const entry of skipped) {
    lines.push(`\t• ${entry.path}: ${entry.reason}`);
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const repoName = path.basename(repoRoot);

  const limits = {
    maxFileKB: Number.isFinite(args.maxFileKB) && args.maxFileKB > 0 ? args.maxFileKB : DEFAULT_MAX_FILE_KB,
    maxTotalMB: Number.isFinite(args.maxTotalMB) && args.maxTotalMB > 0 ? args.maxTotalMB : DEFAULT_MAX_TOTAL_MB,
    maxTotalBytes: (Number.isFinite(args.maxTotalMB) && args.maxTotalMB > 0 ? args.maxTotalMB : DEFAULT_MAX_TOTAL_MB) * 1024 * 1024
  };

  const gitInfo = getGitMetadata(repoRoot);
  const outFile = toPosixPath(path.normalize(args.out));
  const { included, skipped, totalBytes } = await collectFiles(repoRoot, {
    ...limits,
    outFile
  });

  const output = formatOutput({
    repoName,
    repoRoot,
    gitInfo,
    limits,
    files: included,
    skipped,
    totalBytes
  });

  try {
    await fs.writeFile(path.join(repoRoot, args.out), output, 'utf8');
  } catch (error) {
    console.error(`Failed to write output: ${error.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Unexpected error: ${error.message}`);
  process.exitCode = 1;
});
