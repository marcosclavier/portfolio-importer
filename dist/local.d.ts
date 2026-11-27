import { type Digest, type Receipt } from "./digest.js";
import { type Limits } from "./select.js";
/**
 * Reads a repository on this machine. Only files git tracks are considered, so anything in
 * .gitignore (build output, local .env files) is never even listed. Symbolic links aren't followed.
 * Pass DEMO_LIMITS for the demo profile.
 */
export declare function readLocalRepo(dir: string, limits?: Limits): Promise<{
    digest: Digest;
    receipt: Receipt;
}>;
