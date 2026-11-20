#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readLocalRepo } from "./local.js";
import { DEFAULT_LIMITS } from "./select.js";

const HELP = `Usage: npx github:marcosclavier/portfolio-importer [folder] [options]

Builds a digest of a git repository on this machine, for importing into Portfolio Studio
without giving it access to your code. Nothing is sent anywhere: it writes one file you
can read, then upload yourself.

Options
  --out <file>   Where to write the digest (default: portfolio-digest.json)
  --no-source    Only the README, docs and manifests; no source files
  -h, --help     Show this help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "portfolio-digest.json" },
    "no-source": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const dir = resolve(positionals[0] ?? ".");
const limits = { ...DEFAULT_LIMITS, includeSource: !values["no-source"] };

try {
  const { digest, receipt } = await readLocalRepo(dir, limits);
  const out = resolve(values.out!);
  await writeFile(out, JSON.stringify({ digest, receipt }, null, 2) + "\n");

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const lines = [
    `Read ${receipt.read.length} files from ${digest.repo.name} (${kb(receipt.charsKept)} kept):`,
    ...receipt.read.map((r) => `  ${r.path}${r.truncated ? " (cut short)" : ""}${r.linesRemoved ? `, ${r.linesRemoved} line(s) removed` : ""}`),
  ];
  if (receipt.neverRead.length) {
    lines.push("", `Never opened, because files like these often hold secrets (${receipt.neverRead.length}):`, ...receipt.neverRead.map((n) => `  ${n.path}`));
  }
  if (receipt.secrets.length) {
    lines.push(
      "",
      "Possible secrets found and removed from the digest. If any of these is a real key, it is in your",
      "git history: rotate it, whether or not you upload anything.",
      ...receipt.secrets.map((s) => `  ${s.path}:${s.line}  ${s.kind}`),
    );
  }
  const skipped = Object.entries(receipt.skipped).map(([reason, n]) => `${n} ${reason}`);
  if (skipped.length) lines.push("", `Skipped: ${skipped.join(", ")}.`);
  lines.push("", `Wrote ${out}`, "Read it, then upload it in Studio: Projects, Import, From your computer.");
  process.stdout.write(lines.join("\n") + "\n");
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
