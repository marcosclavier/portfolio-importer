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
export type FileEntry = {
    path: string;
    size: number;
};
export type Profile = "import" | "demo";
/** "style", "ui", "model" and "prompt" come from the demo profile only. */
export type Role = "readme" | "docs" | "manifest" | "source" | "style" | "ui" | "model" | "prompt";
/** "data", "migration" and "infrastructure" come from the demo profile only. */
export type SkipReason = "binary" | "lockfile" | "vendored" | "generated" | "test" | "data" | "migration" | "infrastructure" | "too-large" | "budget" | "not-needed";
/** `cut`: fewer characters kept than `maxFileChars`, for the file that fills the demo profile's total */
export type Picked = FileEntry & {
    role: Role;
    cut?: number;
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
    /** "import" (the default): a small sample to draft a project. "demo": a deeper read for the demo builder */
    profile?: Profile;
    /** Most files read from one repository */
    maxFiles: number;
    /** Characters kept from any one file; the rest is cut */
    maxFileChars: number;
    /** Characters kept across the whole repository */
    maxTotalChars: number;
    /** Larger files aren't opened at all */
    maxFileBytes: number;
    /** Most files taken from one top-level directory: source files in the import profile, any file in the demo profile */
    maxPerDirectory: number;
    /** Demo profile: most files of each kind, so data models or docs can't crowd out the screens */
    maxPerRole?: Partial<Record<Role, number>>;
    /** false: only the README, docs and manifests (no source code); in the demo profile, styles too */
    includeSource: boolean;
};
export declare const DEFAULT_LIMITS: Limits;
/** A deeper read, made only when the member asks for a demo of a project. */
export declare const DEMO_LIMITS: Limits;
/** Source extensions and the language each one counts toward. */
export declare const LANGUAGE_BY_EXT: Record<string, string>;
export declare function isSecretProne(path: string): boolean;
/** Picks the files to read. Nothing here opens a file; it works from paths and sizes only. */
export declare function selectFiles(entries: FileEntry[], limits?: Limits): Selection;
/** Most paths a demo digest lists. */
export declare const TREE_MAX = 400;
/**
 * The repository's file list for a demo digest: paths only, no contents, without vendored code or
 * secret-prone files; the shallowest first when it's long, then in path order.
 */
export declare function treeOverview(entries: FileEntry[], max?: number): string[];
