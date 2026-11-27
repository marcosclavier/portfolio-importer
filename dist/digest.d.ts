import { type SecretHit } from "./secrets.js";
import { type FileEntry, type Limits, type Profile, type Role, type Selection, type SkipReason } from "./select.js";
export declare const DIGEST_FORMAT = "portfolio-digest/1";
/** A digest made with the demo profile. Its own format, so it can't be mistaken for an import digest. */
export declare const DEMO_DIGEST_FORMAT = "portfolio-demo-digest/1";
export type RepoMeta = {
    /** "owner/name" on GitHub, or the folder or package name locally */
    name: string;
    description: string;
    homepage: string;
    private: boolean;
    createdAt?: string;
    pushedAt?: string;
    topics?: string[];
    /** Demo profile only: the account that owns the repository, so its name can be kept out of the demo */
    owner?: string;
};
/** What may be sent on: a description of the repository plus excerpts with secrets removed. */
export type Digest = {
    format: typeof DIGEST_FORMAT | typeof DEMO_DIGEST_FORMAT;
    repo: RepoMeta;
    /** Share of source bytes per language, largest first */
    languages: {
        language: string;
        share: number;
    }[];
    /** Top-level directories and how many files each holds */
    layout: {
        dir: string;
        files: number;
    }[];
    stats: {
        files: number;
        testFiles: number;
        bytes: number;
    };
    files: {
        path: string;
        role: Role;
        content: string;
        truncated: boolean;
    }[];
    /** Demo profile only: the file list (paths, no contents), so the model sees the project's shape */
    tree?: string[];
};
/** Everything the importer did with a repository, for the member to check. Never holds file contents. */
export type Receipt = {
    repo: string;
    createdAt: string;
    /** Set for a demo read */
    profile?: Profile;
    read: {
        path: string;
        role: Role;
        bytes: number;
        charsKept: number;
        truncated: boolean;
        linesRemoved: number;
    }[];
    neverRead: {
        path: string;
    }[];
    skipped: Partial<Record<SkipReason, number>>;
    secrets: (SecretHit & {
        path: string;
    })[];
    charsKept: number;
    /** GitHub sends at most 100,000 entries of a tree; larger repositories are read from what came back */
    treeTruncated?: boolean;
};
/** Text files only: anything with a NUL byte in its first few kilobytes is treated as binary. */
export declare function looksBinary(text: string): boolean;
/**
 * Builds the digest and its receipt from the selected files' contents.
 * `contents` holds only files from `selection.read`; anything else is ignored.
 */
export declare function buildDigest(meta: RepoMeta, tree: FileEntry[], selection: Selection, contents: Map<string, string>, limits?: Limits, extra?: {
    treeTruncated?: boolean;
}): {
    digest: Digest;
    receipt: Receipt;
};
/** The digest as model input. Excerpts are data, wrapped so they can't pose as instructions. */
export declare function digestToPrompt(d: Digest): string;
