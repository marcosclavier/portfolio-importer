# portfolio-importer

The code [Portfolio Studio](https://gitportfolio.dev) uses to read a repository when you import it as a portfolio project. It's open source so you can check exactly what happens to your code.

It works from the file list first, before opening anything:

1. **Files that commonly hold secrets are never opened**: `.env` files (including `.env.example`), private keys and certificates (`*.pem`, `*.key`, `id_rsa`…), credential and service-account files, `.npmrc`, `.netrc`, Terraform state, editor and agent settings such as `settings.local.json`. They're listed on the receipt so you can see they were left alone.
2. **Files that say nothing about your work are skipped**: binaries, images, lockfiles, `node_modules`, build output, minified and generated code. Tests are counted but not read.
3. **A small sample is read**: the README, up to two docs, the manifests (`package.json`, `pyproject.toml`, `Dockerfile`, CI workflows…), then source files, preferring entry points and shallow paths, at most 6 per top-level folder. Limits: 40 files, 6,000 characters per file, 60,000 in total.
4. **Secrets are removed from what was read**: any line that looks like a key, token, private key, connection string with a password, or hard-coded credential is replaced with `[line removed: possible <kind>]`, before anything is cut short or sent on. See [`src/secrets.ts`](src/secrets.ts) for the patterns.
5. **You get a receipt**: every file read and how much of it was kept, every file never opened, how many were skipped and why, and each possible secret by file, line and kind. The receipt never contains file contents or secret values.

The result is a *digest*: the repository's description, languages, layout, file counts and the redacted excerpts. That is all that goes to the AI that drafts your project.

## Run it on your own machine

Nothing leaves your computer. It reads only files git tracks, never follows symbolic links out of the folder, makes no network requests, and writes one file:

```bash
cd your-project
npx github:marcosclavier/portfolio-importer            # writes portfolio-digest.json
npx github:marcosclavier/portfolio-importer --no-source   # README, docs and manifests only
```

Read `portfolio-digest.json`, then upload it in Studio under Projects, Import, From your computer. Studio runs the secret check again on what you upload.

## How Portfolio Studio uses it

- **Public repositories** are read with your GitHub sign-in token, which GitHub limits to public data.
- **Private repositories** are read only through the Portfolio Studio GitHub App, which you install on the repositories you choose. It asks for read-only access to their contents (plus the read-only metadata GitHub requires of every app) and nothing else, its tokens expire after 8 hours, and uninstalling it ends access. Repositories owned by an organization need the owner's approval.
- The digest is sent to Claude to draft a project description. Your code is not stored: Studio keeps the draft you confirm and the receipt, nothing else.

You can't verify from outside what any hosted service runs. That's why the command above exists: with it, your code never reaches us at all.

## Limits

Secret detection matches patterns, so it can miss a credential in an unusual format. Treat anything that was ever committed to a repository as exposed and rotate it, whether or not you use this tool.

## Develop

```bash
npm ci
npm run check   # type check and tests
npm run build   # dist/ is committed so the package installs from GitHub
```

MIT licensed.
