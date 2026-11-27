import { buildDigest } from "./digest.js";
import { DEFAULT_LIMITS, selectFiles } from "./select.js";
/**
 * Reads a GitHub repository with a token the member gave us. Only three read-only endpoints are
 * called: the repository's details, its file list, and the raw contents of each selected file.
 * Pass `limits: DEMO_LIMITS` for the demo profile.
 */
export class GithubError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
const FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
export function isRepoFullName(s) {
    return FULL_NAME.test(s) && !s.endsWith("/.") && !s.endsWith("/..");
}
export async function readGithubRepo(fullName, token, opts = {}) {
    if (!isRepoFullName(fullName))
        throw new GithubError("Not a repository name", 400);
    const f = opts.fetch ?? fetch;
    const limits = opts.limits ?? DEFAULT_LIMITS;
    const headers = (accept) => ({
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": opts.userAgent ?? "portfolio-importer",
    });
    const get = async (path, accept = "application/vnd.github+json") => {
        const res = await f(`https://api.github.com${path}`, { headers: headers(accept), signal: AbortSignal.timeout(10_000) });
        if (!res.ok)
            throw new GithubError(`GitHub answered ${res.status} for ${path.split("?")[0]}`, res.status);
        return res;
    };
    const repo = (await (await get(`/repos/${fullName}`)).json());
    const branch = encodeURIComponent(repo.default_branch);
    const treeRes = (await (await get(`/repos/${fullName}/git/trees/${branch}?recursive=1`)).json());
    const tree = treeRes.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, size: t.size ?? 0 }));
    const selection = selectFiles(tree, limits);
    const contents = new Map();
    const queue = [...selection.read];
    const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
            const path = p.path.split("/").map(encodeURIComponent).join("/");
            try {
                const res = await get(`/repos/${fullName}/contents/${path}?ref=${branch}`, "application/vnd.github.raw");
                contents.set(p.path, await res.text());
            }
            catch (e) {
                if (!(e instanceof GithubError && e.status === 404))
                    throw e;
            }
        }
    };
    // The demo profile reads up to 150 files, so it asks for more of them at once.
    await Promise.all(Array.from({ length: opts.concurrency ?? (limits.profile === "demo" ? 8 : 4) }, worker));
    const meta = {
        name: repo.full_name,
        description: repo.description ?? "",
        homepage: repo.homepage ?? "",
        private: repo.private,
        createdAt: repo.created_at,
        pushedAt: repo.pushed_at,
        topics: repo.topics ?? [],
        ...(limits.profile === "demo" && repo.owner?.login ? { owner: repo.owner.login } : {}),
    };
    return buildDigest(meta, tree, selection, contents, limits, { treeTruncated: treeRes.truncated });
}
