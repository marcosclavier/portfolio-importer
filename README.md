# portfolio-importer

The code [Portfolio Studio](https://gitportfolio.dev) uses to read a repository when you import it as a portfolio project, or when you ask for a demo of one. It's open source so you can check exactly what happens to your code.

It works from the file list first, before opening anything. This is the import read:

1. **Files that commonly hold secrets are never opened**: `.env` files (including `.env.example`), private keys and certificates (`*.pem`, `*.key`, `id_rsa`…), credential and service-account files, `.npmrc`, `.netrc`, Terraform state, editor and agent settings such as `settings.local.json`. They're listed on the receipt so you can see they were left alone.
2. **Files that say nothing about your work are skipped**: binaries, images, lockfiles, `node_modules`, build output, minified and generated code. Tests are counted but not read.
3. **A small sample is read**: the README, up to two docs, the manifests (`package.json`, `pyproject.toml`, `Dockerfile`, CI workflows…), then source files, preferring entry points and shallow paths, at most 6 per top-level folder. Limits: 40 files, 6,000 characters per file, 60,000 in total.
4. **Secrets are removed from what was read**: any line that looks like a key, token, private key, connection string with a password, or hard-coded credential is replaced with `[line removed: possible <kind>]`, before anything is cut short or sent on. See [`src/secrets.ts`](src/secrets.ts) for the patterns.
5. **You get a receipt**: every file read and how much of it was kept, every file never opened, how many were skipped and why, and each possible secret by file, line and kind. The receipt never contains file contents or secret values.

The result is a *digest*: the repository's description, languages, layout, file counts and the redacted excerpts. That is all that goes to the AI that drafts your project.

## The demo read

Studio's demo builder (in development, not open to members yet) makes a working scale model of a project from a description it writes, with made-up sample data. To describe the screens, it needs to see more of the app than an import does, so it uses a second, deeper read: the *demo profile* (`DEMO_LIMITS` in [`src/select.ts`](src/select.ts)). It runs only when you ask for a demo, never on import.

- **The same rules 1, 2, 4 and 5 apply**: secret-prone files are never opened, secrets are removed from what is read, and you get the same receipt.
- **More is skipped**: data files, dumps and seed folders (`*.csv`, `*.sql`, logs, notebooks, `data/`, `seeds/`, `fixtures/`…), because real records live there; database migrations; and infrastructure (CI workflows, Docker files, deploy and build-tool config).
- **More is read, chosen for how the app looks and works**: styles and theme files first, then pages, layouts and navigation components, data models and schemas, prompts and AI code, the README and product docs, and a few other source files. Limits: 150 files, 8,000 characters per file, 250,000 in total, at most 60 files per top-level folder, and of each kind at most 10 manifests, 8 docs, 12 data models, 12 prompt files and 20 other source files. When the total is nearly used up, the last file is cut short to fit.
- **The digest also lists file paths** (no contents; at most 400, shallowest first, without vendored code or secret-prone files), so the AI sees the project's shape, and the account that owns the repository, so Studio can offer to keep that name out of the demo. Locally, the owner comes from the `origin` remote's URL in your git config, and only the owner is taken from it.

## Run it on your own machine

Nothing leaves your computer. It reads only files git tracks, never follows symbolic links out of the folder, makes no network requests, and writes one file:

```bash
cd your-project
npx github:marcosclavier/portfolio-importer               # writes portfolio-digest.json
npx github:marcosclavier/portfolio-importer --no-source   # README, docs and manifests only
npx github:marcosclavier/portfolio-importer --demo        # the demo read; writes portfolio-demo-digest.json
```

Read `portfolio-digest.json`, then upload it in Studio under Projects, Import, From your computer. Studio runs the secret check again on what you upload. A demo digest is uploaded when you build a demo, once the demo builder opens.

## How Portfolio Studio uses it

- **Public repositories** are read with your GitHub sign-in token, which GitHub limits to public data.
- **Private repositories** are read only through the Portfolio Studio GitHub App, which you install on the repositories you choose. It asks for read-only access to their contents (plus the read-only metadata GitHub requires of every app) and nothing else, its tokens expire after 8 hours, and uninstalling it ends access. Repositories owned by an organization need the owner's approval.
- The digest is sent to Claude to draft a project description. Your code is not stored: Studio keeps the draft you confirm and the receipt, nothing else.
- For a demo, the demo digest is sent to Claude to plan and describe the demo. Your code is not stored either: Studio keeps the demo's description (with made-up sample data), its plan, the receipt, and the names and words to keep out of it.

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
