#!/usr/bin/env bun

import { $ } from "bun";
import { rmSync, existsSync } from "fs";

console.log("🧹 Cleaning dist directory...");
if (existsSync("./dist")) {
  rmSync("./dist", { recursive: true, force: true });
}

console.log("📦 Building ESM JavaScript with Bun...");
const esmBuildResult = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  external: ["ws"],
  minify: false,
  sourcemap: "external",
  splitting: false,
});

if (!esmBuildResult.success) {
  console.error("❌ ESM build failed!");
  for (const log of esmBuildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("📦 Building CJS JavaScript with Bun...");
const cjsBuildResult = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "cjs",
  external: ["ws"],
  minify: false,
  sourcemap: "external",
  splitting: false,
  naming: "[dir]/[name].cjs",
});

if (!cjsBuildResult.success) {
  console.error("❌ CJS build failed!");
  for (const log of cjsBuildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("📝 Generating TypeScript declarations...");
await $`tsc --project tsconfig.build.json`;

console.log("✅ Build complete!");
