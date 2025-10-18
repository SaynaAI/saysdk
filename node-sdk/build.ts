#!/usr/bin/env bun

import { $ } from "bun";
import { rmSync, existsSync } from "fs";

console.log("🧹 Cleaning dist directory...");
if (existsSync("./dist")) {
  rmSync("./dist", { recursive: true, force: true });
}

console.log("📦 Building JavaScript with Bun...");
const buildResult = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "external",
  splitting: false,
});

if (!buildResult.success) {
  console.error("❌ Build failed!");
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("📝 Generating TypeScript declarations...");
await $`tsc --project tsconfig.json`;

console.log("✅ Build complete!");
