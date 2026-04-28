#!/usr/bin/env node

// Postinstall hook: when installed globally in an openclaw environment,
// automatically copy this package into the openclaw extensions directory.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const OPENCLAW_DATA = process.env.OPENCLAW_HOME
  ? path.join(process.env.OPENCLAW_HOME, ".openclaw")
  : "/data/.openclaw";
const EXTENSIONS_DIR = path.join(OPENCLAW_DATA, "extensions");
const PLUGIN_ID = "openclaw-amiko";
const TARGET_DIR = path.join(EXTENSIONS_DIR, PLUGIN_ID);

function isOpenclawEnvironment() {
  return fs.existsSync(OPENCLAW_DATA) && fs.existsSync(EXTENSIONS_DIR);
}

function getPackageRoot() {
  return path.resolve(__dirname, "..");
}

const FILES_TO_COPY = [
  "dist",
  "hooks",
  "skills",
  "contracts",
  "openclaw.plugin.json",
  "package.json",
  "README.md",
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  if (!isOpenclawEnvironment()) {
    return;
  }

  const pkgRoot = getPackageRoot();
  const pkgJson = path.join(pkgRoot, "package.json");
  if (!fs.existsSync(pkgJson)) {
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
  const version = pkg.version;

  const existingPkgJson = path.join(TARGET_DIR, "package.json");
  if (fs.existsSync(existingPkgJson)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingPkgJson, "utf8"));
      if (existing.version === version) {
        console.log(`[openclaw-amiko] v${version} already installed in extensions, skipping.`);
        return;
      }
      console.log(`[openclaw-amiko] Upgrading ${existing.version} → ${version}`);
    } catch {}
  } else {
    console.log(`[openclaw-amiko] Installing v${version} into openclaw extensions`);
  }

  // Clean target and copy files
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  for (const entry of FILES_TO_COPY) {
    const src = path.join(pkgRoot, entry);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(TARGET_DIR, entry));
    }
  }

  // Install production dependencies
  try {
    execSync("npm install --omit=dev --ignore-scripts --no-package-lock", {
      cwd: TARGET_DIR,
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch (err) {
    console.error(`[openclaw-amiko] Failed to install dependencies: ${err.message}`);
    return;
  }

  console.log(`[openclaw-amiko] v${version} installed to ${TARGET_DIR}`);
  console.log(`[openclaw-amiko] Restart the gateway to load the new version.`);
}

main();
