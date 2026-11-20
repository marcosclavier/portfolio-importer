/**
 * Finds likely credentials in text and removes the lines that hold them.
 *
 * It errs toward removing too much: a removed line costs a little context, a missed key could cost
 * someone their account. Findings record the line number and the kind of secret, never the value.
 */

export type SecretHit = { line: number; kind: string };

type Rule = { kind: string; re: RegExp };

const RULES: Rule[] = [
  { kind: "private key", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/ },
  { kind: "AWS access key", re: /\b(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  { kind: "GitHub token", re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { kind: "GitLab token", re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { kind: "Slack webhook", re: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/ },
  { kind: "Stripe key", re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/ },
  { kind: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{20,}\b/ },
  { kind: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: "OpenAI API key", re: /\bsk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/ },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: "Google OAuth secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { kind: "Twilio key", re: /\bSK[0-9a-f]{32}\b/ },
  { kind: "SendGrid key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  { kind: "Mailgun key", re: /\bkey-[0-9a-f]{32}\b/ },
  { kind: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { kind: "Hugging Face token", re: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { kind: "Shopify token", re: /\bshp(at|ca|pa|ss)_[a-fA-F0-9]{32}\b/ },
  { kind: "Discord or Telegram bot token", re: /\b([MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}|\d{8,10}:AA[A-Za-z0-9_-]{33})\b/ },
  { kind: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  // scheme://user:password@host, for databases, queues, caches and SMTP
  { kind: "connection string with a password", re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/"'`]+:[^\s@/"'`]{3,}@[^\s"'`]+/i },
  { kind: "password in a URL", re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/:[^\s@/"'`]{3,}@/i },
];

/** `password = "…"`, `apiKey: '…'`, `SECRET_TOKEN="…"` with a real-looking value. */
const ASSIGNMENT = /(pass(word|wd)?|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|token)["'`]?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i;
const PLACEHOLDER = /^(your|my|xxx|changeme|change[_-]?me|example|placeholder|dummy|sample|fake|test|todo|none|null|undefined|redacted|secret|password|\*+|<|\$\{|\{\{|%\(|process\.env|os\.environ|env\(|import\.meta)/i;

function lineHit(line: string): string | null {
  for (const r of RULES) if (r.re.test(line)) return r.kind;
  const m = ASSIGNMENT.exec(line);
  if (m) {
    const value = m[3] ?? "";
    if (!PLACEHOLDER.test(value) && !/example|placeholder|xxxx/i.test(value) && /[A-Za-z]/.test(value) && /[0-9]/.test(value)) return "hard-coded credential";
  }
  return null;
}

/** Every line that looks like it holds a secret. A private key block counts as one hit. */
export function findSecrets(text: string): SecretHit[] {
  return redactSecrets(text).hits;
}

/**
 * Replaces each line holding a likely secret with a marker. Private key blocks are removed whole,
 * from BEGIN to END.
 */
export function redactSecrets(text: string): { text: string; hits: SecretHit[]; linesRemoved: number } {
  const lines = text.split("\n");
  const hits: SecretHit[] = [];
  let removed = 0;
  let inKey = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (inKey) {
      lines[i] = "";
      removed++;
      if (/-----END [A-Z0-9 ]*PRIVATE KEY( BLOCK)?-----/.test(line)) inKey = false;
      continue;
    }
    const kind = lineHit(line);
    if (!kind) continue;
    hits.push({ line: i + 1, kind });
    lines[i] = `[line removed: possible ${kind}]`;
    removed++;
    if (kind === "private key" && !/-----END [A-Z0-9 ]*PRIVATE KEY/.test(line)) inKey = true;
  }
  return { text: lines.join("\n"), hits, linesRemoved: removed };
}
