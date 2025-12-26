"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZipArchive = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function listPaths(root) {
    const results = [];
    const walk = (dir) => {
        const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            results.push(fullPath);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
        }
    };
    walk(root);
    return results;
}
function createEntry(entryPath, root) {
    const stats = node_fs_1.default.statSync(entryPath);
    const entryName = node_path_1.default.relative(root, entryPath).split(node_path_1.default.sep).join("/");
    return {
        entryName,
        isDirectory: stats.isDirectory(),
        getData: () => (stats.isDirectory() ? Buffer.alloc(0) : node_fs_1.default.readFileSync(entryPath)),
    };
}
class ZipArchive {
    stagedEntries = [];
    entries = [];
    constructor(zipPath) {
        if (zipPath) {
            const tempDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "soustack-zip-"));
            (0, node_child_process_1.execFileSync)("unzip", ["-qq", zipPath, "-d", tempDir]);
            this.entries = listPaths(tempDir).map((entryPath) => createEntry(entryPath, tempDir));
        }
    }
    addFile(entryName, data) {
        this.stagedEntries.push({ entryName, data });
    }
    writeZip(targetPath) {
        const workDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "soustack-zip-build-"));
        for (const entry of this.stagedEntries) {
            const destination = node_path_1.default.join(workDir, entry.entryName.split("/").join(node_path_1.default.sep));
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(destination), { recursive: true });
            node_fs_1.default.writeFileSync(destination, entry.data);
        }
        const cwd = process.cwd();
        process.chdir(workDir);
        try {
            (0, node_child_process_1.execFileSync)("zip", ["-qr", targetPath, "."]);
        }
        finally {
            process.chdir(cwd);
        }
    }
    getEntries() {
        return this.entries;
    }
}
exports.ZipArchive = ZipArchive;
