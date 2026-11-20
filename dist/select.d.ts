/**
 * Decides which files of a repository are read, before anything is opened.
 *
 * Three rules, in order:
 *  1. Files that commonly hold secrets (.env, private keys, credential files) are never opened.
 *  2. Files that say nothing about the work (binaries, lockfiles, vendored and generated code) are skipped.
 *  3. Of the rest, the README, a few docs and the manifests come first, then a capped number of
 *     source files, preferring entry points and shallow paths, spread across directories.
 */
export type FileEntry = {
    path: string;
    size: number;
};
export type Role = "readme" | "docs" | "manifest" | "source";
export type SkipReason = "binary" | "lockfile" | "vendored" | "generated" | "test" | "too-large" | "budget" | "not-needed";
export type Picked = FileEntry & {
    role: Role;
};
export type Selection = {
    read: Picked[];
    /** Never opened because they commonly hold secrets. Listed in full on the receipt. */
    neverRead: FileEntry[];
    skipped: (FileEntry & {
        reason: SkipReason;
    })[];
};
export type Limits = {
    /** Most files read from one repository */
    maxFiles: number;
    /** Characters kept from any one file; the rest is cut */
    maxFileChars: number;
    /** Characters kept across the whole repository */
    maxTotalChars: number;
    /** Larger files aren't opened at all */
    maxFileBytes: number;
    /** Most source files taken from one top-level directory */
    maxPerDirectory: number;
    /** false: only the README, docs and manifests (no source code) */
    includeSource: boolean;
};
export declare const DEFAULT_LIMITS: Limits;
/** Source extensions and the language each one counts toward. */
export declare const LANGUAGE_BY_EXT: Record<string, string>;
export declare function isSecretProne(path: string): boolean;
/** Picks the files to read. Nothing here opens a file; it works from paths and sizes only. */
export declare function selectFiles(entries: FileEntry[], limits?: Limits): Selection;
