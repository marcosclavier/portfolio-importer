import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { promisify } from "node:util";
import { buildDigest } from "./digest.js";
import { DEFAULT_LIMITS, selectFiles } from "./select.js";
const run = promisify(execFile);
/**
 * Reads a repository on this machine. Only files git tracks are considered, so anything in
 * .gitignore (build output, local .env files) is never even listed. Symbolic links aren't followed.
 * Pass DEMO_LIMITS for the demo profile.
 */
export async function readLocalRepo(dir, limits = DEFAULT_LIMITS) {
    const root = await realpath(dir);
    let listed;
    try {
        listed = (await run("git", ["-C", root, "ls-files", "-z"], { maxBuffer: 64 * 1024 * 1024 })).stdout;
    }
    catch {
        throw new Error(`${dir} isn't a git repository. Run this inside one: only files git tracks are read.`);
    }
    const tree = [];
    for (const path of listed.split("\0").filter(Boolean)) {
        try {
            const st = await lstat(join(root, path));
            if (st.isFile())
                tree.push({ path, size: st.size });
        }
        catch {
            // Deleted but not yet committed; skip it.
        }
    }
    const selection = selectFiles(tree, limits);
    const contents = new Map();
    for (const p of selection.read) {
        const full = await realpath(join(root, p.path)).catch(() => null);
        if (!full || !(full === root || full.startsWith(root + sep)))
            continue;
        contents.set(p.path, await readFile(full, "utf8"));
    }
    const meta = await localMeta(root);
    if (limits.profile === "demo") {
        const owner = await remoteOwner(root);
        if (owner)
            meta.owner = owner;
    }
    return buildDigest(meta, tree, selection, contents, limits);
}
/**
 * The account in the "origin" remote's URL (github.com/<owner>/<repo>), read from the local git
 * config without any network request. Only the owner is taken, so a token in the URL never is.
 */
async function remoteOwner(root) {
    try {
        const url = (await run("git", ["-C", root, "remote", "get-url", "origin"])).stdout.trim();
        return url.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[:/]([A-Za-z0-9][A-Za-z0-9_.-]{0,38})\/[^/]+$/)?.[1];
    }
    catch {
        return undefined; // No remote.
    }
}
async function localMeta(root) {
    const meta = { name: basename(root), description: "", homepage: "", private: true };
    try {
        const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        if (typeof pkg.name === "string" && pkg.name)
            meta.name = pkg.name;
        if (typeof pkg.description === "string")
            meta.description = pkg.description;
        if (typeof pkg.homepage === "string" && pkg.homepage.startsWith("https://"))
            meta.homepage = pkg.homepage;
    }
    catch {
        // Not a Node project; the folder name will do.
    }
    try {
        const { stdout } = await run("git", ["-C", root, "log", "--reverse", "--format=%cI"], { maxBuffer: 16 * 1024 * 1024 });
        const dates = stdout.trim().split("\n").filter(Boolean);
        if (dates.length) {
            meta.createdAt = dates[0];
            meta.pushedAt = dates[dates.length - 1];
        }
    }
    catch {
        // No commits yet.
    }
    return meta;
}
