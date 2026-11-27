/**
 * Decides which files of a repository are read, before anything is opened.
 *
 * Three rules, in order:
 *  1. Files that commonly hold secrets (.env, private keys, credential files) are never opened.
 *  2. Files that say nothing about the work (binaries, lockfiles, vendored and generated code) are skipped.
 *  3. Of the rest, the README, a few docs and the manifests come first, then a capped number of
 *     source files, preferring entry points and shallow paths, spread across directories.
 *
 * That is the "import" profile. The "demo" profile (DEMO_LIMITS) keeps rules 1 and 2, also skips
 * data files, migrations and infrastructure, and reads more, favouring the files that say how the
 * app looks and works: styles and themes, pages and layout components, data models and prompts.
 */
export const DEFAULT_LIMITS = {
    maxFiles: 40,
    maxFileChars: 6000,
    maxTotalChars: 60000,
    maxFileBytes: 200_000,
    maxPerDirectory: 6,
    includeSource: true,
};
/** A deeper read, made only when the member asks for a demo of a project. */
export const DEMO_LIMITS = {
    profile: "demo",
    maxFiles: 150,
    maxFileChars: 8000,
    maxTotalChars: 250_000,
    maxFileBytes: 400_000,
    maxPerDirectory: 60,
    maxPerRole: { manifest: 10, docs: 8, model: 12, prompt: 12, source: 20 },
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
    if (limits.profile === "demo")
        return selectForDemo(entries, limits);
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
// ── Demo profile ────────────────────────────────────────────────────────────────────────────────
/** Real records live in data files, dumps and seeds, and they say little about how the app works. */
const DATA = /\.(csv|tsv|log|sql|ipynb|xml|jsonl|ndjson)$|(^|\/)(data|datasets?|seeds?|samples?|exports?|dumps?|backups?)\/|(^|\/)repomix-output[^/]*$/i;
const MIGRATIONS = /(^|\/)(migrations?|alembic|drizzle)\//i;
const INFRA = new RegExp("(^|/)(\\.github|deploy|infra|k8s|terraform|\\.husky|\\.devcontainer)/|(^|/)(" +
    [
        "dockerfile", "docker-compose[^/]*", "compose\\.ya?ml", "makefile", "justfile", "procfile", "\\.pre-commit-config\\.yaml",
        "\\.gitignore", "\\.gitattributes", "\\.dockerignore", "\\.editorconfig", "\\.eslintrc[^/]*", "\\.prettierrc[^/]*",
        "eslint\\.config\\.[a-z]+", "prettier\\.config\\.[a-z]+", "(vite|vitest|jest|playwright|postcss|next|nuxt|svelte|astro|webpack|rollup|babel)\\.config\\.[a-z]+",
        "tsconfig[^/]*\\.json", "jsconfig\\.json", "vercel\\.json", "netlify\\.toml", "fly\\.toml", "render\\.yaml",
        "railway\\.(toml|json)", "nixpacks\\.toml", "heroku\\.yml", "sentry\\.[a-z.]*config\\.[a-z]+", "instrumentation(-client)?\\.[a-z]+",
    ].join("|") +
    ")$", "i");
const DEMO_MANIFEST = /^(package\.json|components\.json|requirements(-[a-z]+)?\.txt|pyproject\.toml|cargo\.toml|composer\.json|pubspec\.yaml|deno\.jsonc?)$/i;
const STYLE_EXT = new Set(["css", "scss", "sass", "less", "styl"]);
const DOC_EXT = new Set(["md", "mdx", "markdown", "rst", "txt", "adoc"]);
const UI_EXT = new Set(["tsx", "jsx", "vue", "svelte", "astro", "html", "htm", "jinja", "j2", "njk", "hbs", "ejs", "erb"]);
const DEMO_TEXT = new Set([
    ...Object.keys(LANGUAGE_BY_EXT).filter((x) => x !== "sql"),
    ...STYLE_EXT, ...DOC_EXT, ...UI_EXT,
    "json", "jsonc", "toml", "yaml", "yml", "gql",
]);
/** What a file is for and how much it says about the app's screens, data and AI features. */
function demoRole(path) {
    const p = path.toLowerCase();
    const b = base(p);
    const x = ext(p);
    const d = depth(p);
    const shallow = Math.max(0, 6 - d) * 2;
    if (README.test(b))
        return { role: "readme", score: d === 0 ? 120 : 60 };
    if (!DEMO_TEXT.has(x))
        return null;
    if (DEMO_MANIFEST.test(b))
        return { role: "manifest", score: (d === 0 ? 95 : 85) - d };
    if (p.endsWith(".streamlit/config.toml") || /^tailwind\.config\.[a-z]+$/.test(b) || /(^|\/)themes?(\/|\.[a-z]+$)/.test(p))
        return { role: "style", score: 100 };
    if (STYLE_EXT.has(x))
        return { role: "style", score: 88 + shallow };
    if (/prompt/.test(p) && !UI_EXT.has(x))
        return { role: "prompt", score: 78 + shallow };
    if (DOC_EXT.has(x)) {
        if (/(changelog|history|license|licence|contributing|security|code_of_conduct)/.test(b))
            return null;
        if (/(prd|description|overview|guide|architecture|features|spec|design|product)/.test(b))
            return { role: "docs", score: 80 + shallow };
        return { role: "docs", score: 30 + shallow };
    }
    if (b === "schema.prisma" || /(^|\/)(models?|schemas?|types|entities)(\/|\.[a-z]+$)/.test(p))
        return { role: "model", score: 72 + shallow };
    if (/(^|\/)(src\/)?app\/(.*\/)?(page|layout)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)pages\/[^/]+\.(tsx|jsx|vue|svelte|astro|py)$/.test(p))
        return { role: "ui", score: 76 + shallow };
    if ((d <= 2 && /^(app|main|index|dashboard|home)\.(tsx|jsx|vue|svelte)$/.test(b)) || /^(app|streamlit_app|ui)\.py$/.test(b))
        return { role: "ui", score: 84 + shallow };
    if (UI_EXT.has(x) && /(sidebar|layout|nav|header|shell|topbar|menu)/.test(b))
        return { role: "ui", score: 82 + shallow };
    if (UI_EXT.has(x) && /(^|\/)(components?|views?|screens?|templates?|ui|widgets|routes)\//.test(p))
        return { role: "ui", score: 58 + shallow };
    if (UI_EXT.has(x) && x !== "tsx" && x !== "jsx")
        return { role: "ui", score: 52 + shallow };
    if (/(llm|openai|anthropic|claude|gpt|ollama|gemini)[^/]*\.[cm]?[jt]s$|(llm|openai|anthropic|claude|gpt|ollama|gemini)[^/]*\.py$/.test(b) ||
        /(^|[_.-])(ai|agents?)([_.-][^/]*)?\.([cm]?[jt]s|py)$/.test(b) ||
        /(^|\/)(agents?|llm|ai)\//.test(p))
        return { role: "prompt", score: 55 + shallow };
    if (/(^|\/)api\//.test(p))
        return { role: "source", score: 28 + shallow };
    return { role: "source", score: 24 + shallow };
}
function classifyForDemo(e, limits) {
    const b = base(e.path).toLowerCase();
    const x = ext(e.path);
    if (VENDORED.test(e.path))
        return "vendored";
    if (BINARY.has(x))
        return "binary";
    if (LOCKFILES.has(b) || x === "lock")
        return "lockfile";
    if (GENERATED.test(e.path) || /\.d\.[cm]?ts$/i.test(e.path))
        return "generated";
    if (TEST.test(e.path))
        return "test";
    if (DATA.test(e.path))
        return "data";
    if (MIGRATIONS.test(e.path))
        return "migration";
    if (INFRA.test(e.path))
        return "infrastructure";
    if (e.size > limits.maxFileBytes)
        return "too-large";
    const r = e.size > 0 ? demoRole(e.path) : null;
    if (!r)
        return "not-needed";
    if (!limits.includeSource && !["readme", "docs", "manifest", "style"].includes(r.role))
        return "not-needed";
    return r;
}
/**
 * The demo profile: every candidate scored by what it says about the app, read best first, within
 * the file, character, per-directory and per-kind limits.
 */
function selectForDemo(entries, limits) {
    const neverRead = [];
    const skipped = [];
    const candidates = [];
    for (const e of entries) {
        if (isSecretProne(e.path)) {
            neverRead.push(e);
            continue;
        }
        const c = classifyForDemo(e, limits);
        if (typeof c === "string")
            skipped.push({ ...e, reason: c });
        else
            candidates.push({ ...e, ...c });
    }
    candidates.sort((a, b) => b.score - a.score || a.size - b.size || a.path.localeCompare(b.path));
    const read = [];
    let budget = limits.maxTotalChars;
    const perDir = new Map();
    const perRole = new Map();
    for (const { score: _score, ...c } of candidates) {
        let cost = Math.min(c.size, limits.maxFileChars);
        const top = c.path.includes("/") ? c.path.slice(0, c.path.indexOf("/")) : ".";
        const cap = limits.maxPerRole?.[c.role];
        // Near the total, the next file is cut to what's left rather than passed over for smaller, less useful ones.
        const cutToFit = cost > budget && budget >= MIN_CUT;
        const full = read.length >= limits.maxFiles ||
            (cost > budget && !cutToFit) ||
            (perDir.get(top) ?? 0) >= limits.maxPerDirectory ||
            (cap !== undefined && (perRole.get(c.role) ?? 0) >= cap);
        if (full) {
            skipped.push({ ...c, reason: "budget" });
            continue;
        }
        if (cutToFit)
            cost = budget;
        read.push(cutToFit ? { ...c, cut: budget } : c);
        budget -= cost;
        perDir.set(top, (perDir.get(top) ?? 0) + 1);
        perRole.set(c.role, (perRole.get(c.role) ?? 0) + 1);
    }
    return { read, neverRead, skipped };
}
/** The least of a file worth reading when it has to be cut to fit the total. */
const MIN_CUT = 1000;
/** Most paths a demo digest lists. */
export const TREE_MAX = 400;
/**
 * The repository's file list for a demo digest: paths only, no contents, without vendored code or
 * secret-prone files; the shallowest first when it's long, then in path order.
 */
export function treeOverview(entries, max = TREE_MAX) {
    const paths = entries.map((e) => e.path).filter((p) => !VENDORED.test(p) && !isSecretProne(p));
    // Code-point order, as git lists files, so the list is the same on every machine.
    const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const kept = paths.length <= max ? [...paths] : [...paths].sort((a, b) => depth(a) - depth(b) || byPath(a, b)).slice(0, max);
    return kept.sort(byPath);
}
