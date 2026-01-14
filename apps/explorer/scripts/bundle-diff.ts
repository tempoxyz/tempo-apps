#!/usr/bin/env node
/**
 * Bundle size analysis and diff tool
 *
 * Usage:
 *   pnpm bundle:diff                    - Build and show bundle sizes (diff against baseline if exists)
 *   pnpm bundle:save                    - Build and save current sizes as baseline
 *
 * CI flags:
 *   --ci                                - Output markdown for GitHub PR comments
 *   --baseline <file>                   - Read baseline from specific file path
 *   --output <file>                     - Write current stats to file (for caching)
 *   --skip-build                        - Skip build step (use existing stats.json)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const BASELINE_FILE = ".bundle-baseline.json";
const STATS_FILE = "stats.json";

interface CIOptions {
  ci: boolean;
  baselinePath: string | null;
  outputPath: string | null;
  skipBuild: boolean;
  save: boolean;
}

function parseArgs(args: string[]): CIOptions {
  const options: CIOptions = {
    ci: false,
    baselinePath: null,
    outputPath: null,
    skipBuild: false,
    save: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--ci") {
      options.ci = true;
    } else if (arg === "--baseline" && args[i + 1]) {
      options.baselinePath = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      options.outputPath = args[++i];
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--save") {
      options.save = true;
    }
  }

  return options;
}

interface ChunkInfo {
  label: string;
  size: number;
  gzipSize: number;
  brotliSize: number;
}

interface BundleStats {
  timestamp: string;
  total: { size: number; gzip: number; brotli: number };
  chunks: ChunkInfo[];
}

// Visualizer raw-data format
interface VisualizerData {
  version: number;
  tree: TreeNode;
  nodeParts: Record<string, NodePart>;
}

interface TreeNode {
  name: string;
  uid?: string;
  children?: TreeNode[];
}

interface NodePart {
  renderedLength: number;
  gzipLength: number;
  brotliLength: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / k ** i;
  return `${value.toFixed(1)} ${sizes[i]}`;
}

function formatDelta(current: number, baseline: number): string {
  const delta = current - baseline;
  const percent = baseline > 0 ? ((delta / baseline) * 100).toFixed(1) : "N/A";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${formatBytes(delta)} (${sign}${percent}%)`;
}

function parseStats(statsPath: string): BundleStats {
  const raw = JSON.parse(readFileSync(statsPath, "utf-8")) as VisualizerData;

  // Build chunk-level aggregates from the tree and nodeParts
  const chunks: ChunkInfo[] = [];
  const nodeParts = raw.nodeParts || {};

  // Get chunk names from the tree (first level children of root)
  const chunkNodes = raw.tree?.children || [];

  for (const chunkNode of chunkNodes) {
    const chunkName = chunkNode.name;
    let chunkSize = 0;
    let chunkGzip = 0;
    let chunkBrotli = 0;

    // Recursively collect all uids in this chunk's subtree
    const uids = collectUids(chunkNode);
    for (const uid of uids) {
      const part = nodeParts[uid];
      if (part) {
        chunkSize += part.renderedLength || 0;
        chunkGzip += part.gzipLength || 0;
        chunkBrotli += part.brotliLength || 0;
      }
    }

    if (chunkSize > 0) {
      chunks.push({
        label: chunkName,
        size: chunkSize,
        gzipSize: chunkGzip,
        brotliSize: chunkBrotli,
      });
    }
  }

  // Calculate totals from all nodeParts
  let totalSize = 0;
  let totalGzip = 0;
  let totalBrotli = 0;
  for (const part of Object.values(nodeParts)) {
    totalSize += part.renderedLength || 0;
    totalGzip += part.gzipLength || 0;
    totalBrotli += part.brotliLength || 0;
  }

  // Sort by size descending
  chunks.sort((a, b) => b.size - a.size);

  return {
    timestamp: new Date().toISOString(),
    total: { size: totalSize, gzip: totalGzip, brotli: totalBrotli },
    chunks,
  };
}

function collectUids(node: TreeNode): string[] {
  const uids: string[] = [];
  if (node.uid) {
    uids.push(node.uid);
  }
  if (node.children) {
    for (const child of node.children) {
      uids.push(...collectUids(child));
    }
  }
  return uids;
}

// Strip content hash from chunk names for comparison
// e.g., "assets/main-CHVKdefL.js" -> "assets/main.js"
function normalizeChunkName(name: string): string {
  // Match patterns like "-CHVKdefL" or "_CHVKdefL" before .js/.css extension
  return name.replace(/[-_][A-Za-z0-9_-]{6,12}(\.(js|css))$/, "$1");
}

function printStats(stats: BundleStats, baseline?: BundleStats): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Bundle Size Analysis");
  console.log("=".repeat(60));

  console.log("\nCurrent Build:");
  console.log(
    `  Total:  ${formatBytes(stats.total.size)} (gzip: ${formatBytes(
      stats.total.gzip
    )}, brotli: ${formatBytes(stats.total.brotli)})`
  );

  if (stats.chunks.length > 0) {
    console.log("\n  Top chunks:");
    const topChunks = stats.chunks.slice(0, 10);
    for (const chunk of topChunks) {
      const displayName = normalizeChunkName(chunk.label);
      const name =
        displayName.length > 40
          ? `...${displayName.slice(-37)}`
          : displayName.padEnd(40);
      console.log(
        `    ${name}  ${formatBytes(chunk.size).padStart(
          10
        )}  (gzip: ${formatBytes(chunk.gzipSize)})`
      );
    }
    if (stats.chunks.length > 10) {
      console.log(`    ... and ${stats.chunks.length - 10} more chunks`);
    }
  }

  if (baseline) {
    console.log(`\n${"-".repeat(60)}`);
    console.log("Comparison to baseline:");
    console.log(
      `  Total:   ${formatDelta(stats.total.size, baseline.total.size)}`
    );
    console.log(
      `  Gzip:    ${formatDelta(stats.total.gzip, baseline.total.gzip)}`
    );
    console.log(
      `  Brotli:  ${formatDelta(stats.total.brotli, baseline.total.brotli)}`
    );

    // Find significant changes by comparing normalized chunk names
    const changes: {
      name: string;
      delta: number;
      current: number;
      baseline: number;
    }[] = [];

    // Build maps using normalized names
    const baselineMap = new Map<string, ChunkInfo>();
    for (const chunk of baseline.chunks) {
      const normalName = normalizeChunkName(chunk.label);
      // If multiple chunks normalize to same name, sum them
      const existing = baselineMap.get(normalName);
      if (existing) {
        existing.size += chunk.size;
        existing.gzipSize += chunk.gzipSize;
        existing.brotliSize += chunk.brotliSize;
      } else {
        baselineMap.set(normalName, { ...chunk, label: normalName });
      }
    }

    const currentMap = new Map<string, ChunkInfo>();
    for (const chunk of stats.chunks) {
      const normalName = normalizeChunkName(chunk.label);
      const existing = currentMap.get(normalName);
      if (existing) {
        existing.size += chunk.size;
        existing.gzipSize += chunk.gzipSize;
        existing.brotliSize += chunk.brotliSize;
      } else {
        currentMap.set(normalName, { ...chunk, label: normalName });
      }
    }

    for (const [normalName, chunk] of currentMap) {
      const baseChunk = baselineMap.get(normalName);
      if (baseChunk) {
        const delta = chunk.size - baseChunk.size;
        if (Math.abs(delta) > 1024) {
          // Only show changes > 1KB
          changes.push({
            name: normalName,
            delta,
            current: chunk.size,
            baseline: baseChunk.size,
          });
        }
      } else {
        // New chunk
        if (chunk.size > 1024) {
          changes.push({
            name: `${normalName} (new)`,
            delta: chunk.size,
            current: chunk.size,
            baseline: 0,
          });
        }
      }
    }

    for (const [normalName, baseChunk] of baselineMap) {
      if (!currentMap.has(normalName)) {
        // Removed chunk
        if (baseChunk.size > 1024) {
          changes.push({
            name: `${normalName} (removed)`,
            delta: -baseChunk.size,
            current: 0,
            baseline: baseChunk.size,
          });
        }
      }
    }

    if (changes.length > 0) {
      console.log("\n  Chunk changes (>1KB):");
      changes.sort((a, b) => a.delta - b.delta);
      for (const change of changes.slice(0, 15)) {
        const name =
          change.name.length > 35
            ? `...${change.name.slice(-32)}`
            : change.name.padEnd(35);
        const sign = change.delta >= 0 ? "+" : "";
        console.log(
          `    ${name}  ${sign}${formatBytes(change.delta).padStart(10)}`
        );
      }
      if (changes.length > 15) {
        console.log(`    ... and ${changes.length - 15} more changes`);
      }
    } else {
      console.log("\n  No significant chunk changes (all <1KB)");
    }

    console.log(`\n  Baseline from: ${baseline.timestamp}`);
  } else {
    console.log(
      "\n  No baseline found. Run 'pnpm bundle:save' to save current as baseline."
    );
  }

  console.log(`\n${"=".repeat(60)}\n`);
}

// Format delta for markdown table
function formatDeltaMd(current: number, baseline: number): string {
  const delta = current - baseline;
  const percent = baseline > 0 ? ((delta / baseline) * 100).toFixed(1) : "0.0";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${formatBytes(delta)} (${sign}${percent}%)`;
}

// Generate markdown output for CI PR comments
function generateMarkdown(stats: BundleStats, baseline?: BundleStats): string {
  const lines: string[] = [];

  lines.push("## Bundle Size Report\n");

  if (baseline) {
    // Show comparison table
    lines.push("| Metric | Size | Δ Change |");
    lines.push("|--------|------|----------|");
    lines.push(
      `| Total | ${formatBytes(stats.total.size)} | ${formatDeltaMd(
        stats.total.size,
        baseline.total.size
      )} |`
    );
    lines.push(
      `| Gzip | ${formatBytes(stats.total.gzip)} | ${formatDeltaMd(
        stats.total.gzip,
        baseline.total.gzip
      )} |`
    );
    lines.push(
      `| Brotli | ${formatBytes(stats.total.brotli)} | ${formatDeltaMd(
        stats.total.brotli,
        baseline.total.brotli
      )} |`
    );

    // Find chunk changes
    const changes: { name: string; delta: number }[] = [];

    const baselineMap = new Map<string, ChunkInfo>();
    for (const chunk of baseline.chunks) {
      const normalName = normalizeChunkName(chunk.label);
      const existing = baselineMap.get(normalName);
      if (existing) {
        existing.size += chunk.size;
      } else {
        baselineMap.set(normalName, { ...chunk, label: normalName });
      }
    }

    const currentMap = new Map<string, ChunkInfo>();
    for (const chunk of stats.chunks) {
      const normalName = normalizeChunkName(chunk.label);
      const existing = currentMap.get(normalName);
      if (existing) {
        existing.size += chunk.size;
      } else {
        currentMap.set(normalName, { ...chunk, label: normalName });
      }
    }

    for (const [normalName, chunk] of currentMap) {
      const baseChunk = baselineMap.get(normalName);
      if (baseChunk) {
        const delta = chunk.size - baseChunk.size;
        if (Math.abs(delta) > 1024) {
          changes.push({ name: normalName, delta });
        }
      } else if (chunk.size > 1024) {
        changes.push({ name: `${normalName} (new)`, delta: chunk.size });
      }
    }

    for (const [normalName, baseChunk] of baselineMap) {
      if (!currentMap.has(normalName) && baseChunk.size > 1024) {
        changes.push({
          name: `${normalName} (removed)`,
          delta: -baseChunk.size,
        });
      }
    }

    if (changes.length > 0) {
      lines.push("\n<details>");
      lines.push("<summary>Chunk changes (>1KB)</summary>\n");
      lines.push("| Chunk | Change |");
      lines.push("|-------|--------|");

      changes.sort((a, b) => a.delta - b.delta);
      for (const change of changes.slice(0, 20)) {
        const sign = change.delta >= 0 ? "+" : "";
        lines.push(`| ${change.name} | ${sign}${formatBytes(change.delta)} |`);
      }
      if (changes.length > 20) {
        lines.push(`| *...and ${changes.length - 20} more* | |`);
      }

      lines.push("\n</details>");
    }

    lines.push(
      `\n*Compared against main branch (baseline from ${new Date(
        baseline.timestamp
      ).toLocaleString()})*`
    );
  } else {
    // No baseline available
    lines.push(
      "No baseline available to compare against. Bundle stats will be cached when this PR is merged to main.\n"
    );
    lines.push(
      `**Current build:** ${formatBytes(stats.total.size)} (gzip: ${formatBytes(
        stats.total.gzip
      )}, brotli: ${formatBytes(stats.total.brotli)})`
    );
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const rootDir = resolve(import.meta.dirname, "..");
  const statsPath = resolve(rootDir, STATS_FILE);
  const defaultBaselinePath = resolve(rootDir, BASELINE_FILE);

  // Run the build with JSON output (unless skipped)
  if (!options.skipBuild) {
    if (!options.ci) {
      console.log("Building with bundle analysis...\n");
    }
    try {
      execSync("pnpm bundle:analyze:json", {
        cwd: rootDir,
        stdio: options.ci ? "pipe" : "inherit",
        env: { ...process.env },
      });
    } catch {
      console.error("Build failed!");
      process.exit(1);
    }
  }

  // Check if stats file was generated
  if (!existsSync(statsPath)) {
    console.error(
      `\nError: ${STATS_FILE} was not generated. Check the build output.`
    );
    process.exit(1);
  }

  // Parse the stats
  const stats = parseStats(statsPath);

  // Load baseline from specified path or default
  let baseline: BundleStats | undefined;
  const baselinePathToUse = options.baselinePath || defaultBaselinePath;
  if (existsSync(baselinePathToUse)) {
    try {
      baseline = JSON.parse(
        readFileSync(baselinePathToUse, "utf-8")
      ) as BundleStats;
    } catch {
      if (!options.ci) {
        console.warn("Warning: Could not parse baseline file, ignoring.");
      }
    }
  }

  // Output results
  if (options.ci) {
    // CI mode: output markdown
    console.log(generateMarkdown(stats, baseline));
  } else {
    // Interactive mode: print formatted stats
    printStats(stats, baseline);
  }

  // Save stats to output file if specified
  if (options.outputPath) {
    writeFileSync(options.outputPath, JSON.stringify(stats, null, 2));
    if (!options.ci) {
      console.log(`Saved stats to ${options.outputPath}`);
    }
  }

  // Save as baseline if requested (legacy --save flag)
  if (options.save) {
    writeFileSync(defaultBaselinePath, JSON.stringify(stats, null, 2));
    if (!options.ci) {
      console.log(`Saved current stats as baseline to ${BASELINE_FILE}`);
      console.log("Commit this file to track bundle size changes.\n");
    }
  }

  // Clean up stats file (it's in gitignore anyway)
  try {
    unlinkSync(statsPath);
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
