/**
 * Decides which files of a repository are read, before anything is opened.
 *
 * Three rules, in order:
 *  1. Files that commonly hold secrets (.env, private keys, credential files) are never opened.
 *  2. Files that say nothing about the work (binaries, lockfiles, vendored and generated code) are skipped.
 *  3. Of the rest, the README, a few docs and the manifests come first, then a capped number of
 *     source files, preferring entry points and shallow paths, spread across directories.
 */
export const DEFAULT_LIMITS = {
    maxFiles: 40,
    maxFileChars: 6000,
    maxTotalChars: 60000,
    maxFileBytes: 200_000,
    maxPerDirectory: 6,
    includeSource: true,
};
const base = (p) => p.slice(p.lastIndexOf("/") + 1);
const ext = (p) => {
    const b = base(p);
    const i = b.lastIndexOf(".");
    return i > 0 ? b.slice(i + 1).toLowerCase() : "";
};
const depth = (p) => p.split("/").length - 1;
/** Opening these could expose a credential, so they are never read, whatever they contain. */
const SECRET_PRONE = [
    /(^|\/)\.env($|\.)/i, // .env, .env.local, .env.production, .env.example …
    /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg|kdbx|tfstate|tfvars)$/i,
    /\.tfstate\./i,
    /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)/i,
    /(^|\/)\.(npmrc|pypirc|netrc|git-credentials|htpasswd|dockercfg|pgpass|s3cfg)$/i,
    /(^|\/)\.docker\/config\.json$/i,
    /(^|\/)\.aws\//i,
    /(^|\/)\.ssh\//i,
    /(^|\/)kubeconfig/i,
    /(^|\/)\.kube\//i,
    /credential/i,
    /secret/i,
    /service[-_]?account.*\.json$/i,
    /(^|\/)settings\.local\.json$/i, // editor and agent settings that often carry tokens
    /(^|\/)firebase-adminsdk.*\.json$/i,
    /(^|\/)google-services\.json$/i,
    /(^|\/)GoogleService-Info\.plist$/i,
];
const BINARY = new Set(("png jpg jpeg gif webp avif bmp ico icns tif tiff psd ai sketch fig heic svgz " +
    "mp3 mp4 m4a wav ogg flac mov avi mkv webm " +
    "woff woff2 ttf otf eot " +
    "zip tar gz tgz bz2 xz 7z rar jar war ear whl gem nupkg " +
    "pdf doc docx xls xlsx ppt pptx odt key numbers pages " +
    "exe dll so dylib a o obj class pyc pyo wasm bin dat " +
    "sqlite sqlite3 db mdb parquet feather h5 hdf5 npy npz pkl pickle onnx pt pth ckpt safetensors").split(" "));
const LOCKFILES = new Set([
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "npm-shrinkwrap.json",
    "cargo.lock", "poetry.lock", "pipfile.lock", "uv.lock", "composer.lock", "gemfile.lock", "go.sum",
    "packages.lock.json", "pubspec.lock", "mix.lock", "flake.lock",
]);
const VENDORED = /(^|\/)(node_modules|vendor|bower_components|third_party|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|coverage|target|__pycache__|\.venv|venv|env|\.tox|\.git|Pods|\.gradle|\.idea|\.vscode|\.turbo|\.cache|\.vercel|\.terraform|DerivedData)\//;
const GENERATED = /(\.min\.(js|css)|\.map|\.snap|\.pb\.go|_pb2\.py|\.g\.dart|\.freezed\.dart|\.designer\.cs)$|(^|\/)(generated|__generated__|gen)\//i;
const TEST = /(^|\/)(__tests__|__mocks__|tests?|spec|specs|e2e|cypress|playwright|fixtures?)\/|\.(test|spec|stories)\.[a-z0-9]+$|_test\.(go|py|rb|exs)$|(^|\/)test_[^/]+\.py$/i;
const README = /^readme(\.(md|markdown|mdx|rst|txt|adoc))?$/i;
const DOCS = /^(architecture|design|overview|contributing|docs|readme)\.(md|mdx|rst|adoc)$/i;
/** Files that describe what the project is built with and how it runs. */
const MANIFEST = new RegExp("^(" +
    [
        "package\\.json", "tsconfig\\.json", "deno\\.jsonc?", "pyproject\\.toml", "requirements(-[a-z]+)?\\.txt", "setup\\.(py|cfg)",
        "pipfile", "cargo\\.toml", "go\\.mod", "gemfile", "composer\\.json", "pom\\.xml", "build\\.gradle(\\.kts)?",
        "settings\\.gradle(\\.kts)?", "[^/]+\\.csproj", "[^/]+\\.sln", "pubspec\\.yaml", "mix\\.exs", "makefile", "justfile",
        "dockerfile", "docker-compose\\.ya?ml", "compose\\.ya?ml", "vercel\\.json", "netlify\\.toml", "fly\\.toml",
        "render\\.yaml", "app\\.json", "serverless\\.ya?ml", "next\\.config\\.[cm]?[jt]s", "vite\\.config\\.[cm]?[jt]s",
        "schema\\.prisma", "schema\\.sql", "schema\\.graphql", "openapi\\.(ya?ml|json)", "swagger\\.(ya?ml|json)",
    ].join("|") +
    ")$", "i");
/** Source extensions and the language each one counts toward. */
export const LANGUAGE_BY_EXT = {
    ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
    js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", rb: "Ruby", java: "Java", kt: "Kotlin", kts: "Kotlin", swift: "Swift",
    cs: "C#", fs: "F#", php: "PHP", c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", m: "Objective-C",
    scala: "Scala", dart: "Dart", ex: "Elixir", exs: "Elixir", erl: "Erlang", clj: "Clojure", hs: "Haskell",
    lua: "Lua", r: "R", jl: "Julia", sql: "SQL", sh: "Shell", bash: "Shell", ps1: "PowerShell",
    vue: "Vue", svelte: "Svelte", astro: "Astro", css: "CSS", scss: "CSS", html: "HTML", sol: "Solidity",
    tf: "HCL", prisma: "Prisma", graphql: "GraphQL", proto: "Protocol Buffers",
};
const ENTRY = /^(index|main|app|server|cli|routes?|router|api|handlers?|schema|models?|page|layout|worker|pipeline|service|store|core|engine)\.[a-z0-9]+$/i;
const SOURCE_DIRS = /^(src|app|lib|server|cmd|pkg|internal|api|backend|frontend|packages|services|core)\//;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
export function isSecretProne(path) {
    return SECRET_PRONE.some((r) => r.test(path));
}
function classify(e, limits) {
    const b = base(e.path).toLowerCase();
    const x = ext(e.path);
    if (VENDORED.test(e.path))
        return "vendored";
    if (BINARY.has(x))
        return "binary";
    if (LOCKFILES.has(b) || x === "lock")
        return "lockfile";
    if (GENERATED.test(e.path))
        return "generated";
    if (e.size > limits.maxFileBytes)
        return "too-large";
    if (README.test(b))
        return depth(e.path) === 0 ? "readme" : "not-needed";
    if (DOCS.test(b) && depth(e.path) <= 1)
        return "docs";
    if (MANIFEST.test(b) && depth(e.path) <= 2)
        return "manifest";
    if (WORKFLOW.test(e.path))
        return "manifest";
    if (TEST.test(e.path))
        return "test";
    if (LANGUAGE_BY_EXT[x] && limits.includeSource)
        return "source";
    return "not-needed";
}
function sourceScore(p, size) {
    let s = -depth(p);
    if (ENTRY.test(base(p)))
        s += 3;
    if (SOURCE_DIRS.test(p))
        s += 1;
    if (size >= 800 && size <= 20_000)
        s += 1;
    if (/\.config\.[a-z]+$/i.test(p) || /\.d\.ts$/.test(p))
        s -= 2;
    return s;
}
/** Picks the files to read. Nothing here opens a file; it works from paths and sizes only. */
export function selectFiles(entries, limits = DEFAULT_LIMITS) {
    const neverRead = [];
    const skipped = [];
    const candidates = [];
    for (const e of entries) {
        if (isSecretProne(e.path)) {
            neverRead.push(e);
            continue;
        }
        const c = classify(e, limits);
        if (c === "readme" || c === "docs" || c === "manifest" || c === "source")
            candidates.push({ ...e, role: c });
        else
            skipped.push({ ...e, reason: c });
    }
    const docsFirst = (a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path);
    const readme = candidates.filter((c) => c.role === "readme").sort(docsFirst).slice(0, 1);
    const docs = candidates.filter((c) => c.role === "docs").sort(docsFirst).slice(0, 2);
    const manifests = candidates.filter((c) => c.role === "manifest").sort(docsFirst).slice(0, 12);
    const sources = candidates
        .filter((c) => c.role === "source")
        .sort((a, b) => sourceScore(b.path, b.size) - sourceScore(a.path, a.size) || a.path.localeCompare(b.path));
    const read = [];
    let budget = limits.maxTotalChars;
    const take = (p) => {
        const cost = Math.min(p.size, limits.maxFileChars);
        if (read.length >= limits.maxFiles || cost > budget)
            return false;
        read.push(p);
        budget -= cost;
        return true;
    };
    for (const p of [...readme, ...docs, ...manifests])
        if (!take(p))
            skipped.push({ ...p, reason: "budget" });
    const perDir = new Map();
    for (const p of sources) {
        const top = p.path.includes("/") ? p.path.slice(0, p.path.indexOf("/")) : ".";
        const n = perDir.get(top) ?? 0;
        if (n >= limits.maxPerDirectory || !take(p)) {
            skipped.push({ ...p, reason: "budget" });
            continue;
        }
        perDir.set(top, n + 1);
    }
    // Docs and manifests beyond the per-kind caps above.
    const accounted = new Set([...read.map((r) => r.path), ...skipped.map((s) => s.path)]);
    for (const c of candidates)
        if (!accounted.has(c.path))
            skipped.push({ ...c, reason: "budget" });
    return { read, neverRead, skipped };
}
