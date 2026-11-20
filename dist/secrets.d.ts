/**
 * Finds likely credentials in text and removes the lines that hold them.
 *
 * It errs toward removing too much: a removed line costs a little context, a missed key could cost
 * someone their account. Findings record the line number and the kind of secret, never the value.
 */
export type SecretHit = {
    line: number;
    kind: string;
};
/** Every line that looks like it holds a secret. A private key block counts as one hit. */
export declare function findSecrets(text: string): SecretHit[];
/**
 * Replaces each line holding a likely secret with a marker. Private key blocks are removed whole,
 * from BEGIN to END.
 */
export declare function redactSecrets(text: string): {
    text: string;
    hits: SecretHit[];
    linesRemoved: number;
};
