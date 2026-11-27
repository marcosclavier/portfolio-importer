import { redactSecrets } from "./secrets.js";
import { DEFAULT_LIMITS, LANGUAGE_BY_EXT, TREE_MAX, treeOverview } from "./select.js";
export const DIGEST_FORMAT = "portfolio-digest/1";
/** A digest made with the demo profile. Its own format, so it can't be mistaken for an import digest. */
export const DEMO_DIGEST_FORMAT = "portfolio-demo-digest/1";
const TEST_PATH = /(^|\/)(__tests__|tests?|spec|specs|e2e|cypress|playwright)\/|\.(test|spec)\.[a-z0-9]+$|_test\.(go|py|rb|exs)$|(^|\/)test_[^/]+\.py$/i;
const EXCLUDED_FROM_STATS = /(^|\/)(node_modules|vendor|dist|build|out|\.next|coverage|target|__pycache__|\.venv|venv|\.git)\//;
function languages(tree) {
    const bytes = new Map();
    let total = 0;
    for (const f of tree) {
        if (EXCLUDED_FROM_STATS.test(f.path))
            continue;
        const b = f.path.slice(f.path.lastIndexOf("/") + 1);
        const lang = LANGUAGE_BY_EXT[b.includes(".") ? b.slice(b.lastIndexOf(".") + 1).toLowerCase() : ""];
        if (!lang)
            continue;
        bytes.set(lang, (bytes.get(lang) ?? 0) + f.size);
        total += f.size;
    }
    return [...bytes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([language, n]) => ({ language, share: total ? Math.round((n / total) * 100) : 0 }))
        .filter((l) => l.share > 0);
}
function layout(tree) {
    const counts = new Map();
    for (const f of tree) {
        if (EXCLUDED_FROM_STATS.test(f.path))
            continue;
        const dir = f.path.includes("/") ? f.path.slice(0, f.path.indexOf("/")) : ".";
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([dir, files]) => ({ dir, files }));
}
/** Text files only: anything with a NUL byte in its first few kilobytes is treated as binary. */
export function looksBinary(text) {
    return text.slice(0, 8000).includes("\u0000");
}
/**
 * Builds the digest and its receipt from the selected files' contents.
 * `contents` holds only files from `selection.read`; anything else is ignored.
 */
export function buildDigest(meta, tree, selection, contents, limits = DEFAULT_LIMITS, extra = {}) {
    const files = [];
    const read = [];
    const secrets = [];
    const skipped = {};
    for (const s of selection.skipped)
        skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
    let charsKept = 0;
    for (const p of selection.read) {
        const raw = contents.get(p.path);
        if (raw === undefined || looksBinary(raw)) {
            skipped[raw === undefined ? "not-needed" : "binary"] = (skipped[raw === undefined ? "not-needed" : "binary"] ?? 0) + 1;
            continue;
        }
        // Redact the whole file before cutting it, so a key split across the cut can't survive.
        const red = redactSecrets(raw);
        const keep = Math.min(limits.maxFileChars, p.cut ?? Infinity);
        const truncated = red.text.length > keep;
        const content = truncated ? red.text.slice(0, keep) : red.text;
        for (const h of red.hits)
            secrets.push({ path: p.path, ...h });
        files.push({ path: p.path, role: p.role, content, truncated });
        read.push({ path: p.path, role: p.role, bytes: p.size, charsKept: content.length, truncated, linesRemoved: red.linesRemoved });
        charsKept += content.length;
    }
    const demo = limits.profile === "demo";
    const digest = {
        format: demo ? DEMO_DIGEST_FORMAT : DIGEST_FORMAT,
        repo: meta,
        languages: languages(tree),
        layout: layout(tree),
        stats: {
            files: tree.filter((f) => !EXCLUDED_FROM_STATS.test(f.path)).length,
            testFiles: tree.filter((f) => TEST_PATH.test(f.path) && !EXCLUDED_FROM_STATS.test(f.path)).length,
            bytes: tree.reduce((n, f) => n + f.size, 0),
        },
        files,
        ...(demo ? { tree: treeOverview(tree) } : {}),
    };
    const receipt = {
        repo: meta.name,
        createdAt: new Date().toISOString(),
        ...(demo ? { profile: "demo" } : {}),
        read,
        neverRead: selection.neverRead.map((f) => ({ path: f.path })),
        skipped,
        secrets,
        charsKept,
        ...(extra.treeTruncated ? { treeTruncated: true } : {}),
    };
    return { digest, receipt };
}
/** Keeps excerpt text from closing the tags around it. */
const fence = (s) => s.replace(/<\/(file|repository)/gi, "<\\/$1");
const attr = (s) => s.replace(/["<>&\n]/g, " ");
/** The digest as model input. Excerpts are data, wrapped so they can't pose as instructions. */
export function digestToPrompt(d) {
    const r = d.repo;
    return [
        `<repository name="${attr(r.name)}" private="${r.private}">`,
        `<description>${fence(r.description)}</description>`,
        r.homepage ? `<homepage>${fence(r.homepage)}</homepage>` : "",
        r.topics?.length ? `<topics>${fence(r.topics.join(", "))}</topics>` : "",
        `<languages>${d.languages.map((l) => `${l.language} ${l.share}%`).join(", ")}</languages>`,
        `<layout>${d.layout.map((l) => `${attr(l.dir)} (${l.files} files)`).join(", ")}</layout>`,
        `<stats>${d.stats.files} files, ${d.stats.testFiles} test files</stats>`,
        d.tree?.length ? `<file_list>\n${fence(d.tree.join("\n"))}${d.tree.length >= TREE_MAX ? "\n… and more" : ""}\n</file_list>` : "",
        ...d.files.map((f) => `<file path="${attr(f.path)}" role="${f.role}"${f.truncated ? ' truncated="true"' : ""}>\n${fence(f.content)}\n</file>`),
        `</repository>`,
    ]
        .filter(Boolean)
        .join("\n");
}
