import { type Digest, type Receipt } from "./digest.js";
import { type Limits } from "./select.js";
/**
 * Reads a GitHub repository with a token the member gave us. Only three read-only endpoints are
 * called: the repository's details, its file list, and the raw contents of each selected file.
 * Pass `limits: DEMO_LIMITS` for the demo profile.
 */
export declare class GithubError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export declare function isRepoFullName(s: string): boolean;
type Options = {
    fetch?: typeof fetch;
    limits?: Limits;
    userAgent?: string;
    concurrency?: number;
};
export declare function readGithubRepo(fullName: string, token: string, opts?: Options): Promise<{
    digest: Digest;
    receipt: Receipt;
}>;
export {};
