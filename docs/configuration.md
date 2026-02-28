# Configuration

There are three ways to configure the tool. They can be mixed — CLI args take highest priority.

## Interactive Mode

Runs automatically when no deployment ID is configured (via CLI, env, or `.env`). Prompts for:

1. **Vercel token** — with a link to create one
2. **Deployment ID** — press Enter for `latest`
3. **Project name** — optional, auto-detected
4. **Team** — optional, auto-detected

If a token is found in the environment, it's shown pre-filled (masked) so you can press Enter to reuse it:

```
Step 1: Vercel API Token
   Found token in environment: vcp_xx...xx0m

   Vercel token (Enter to use above):
```

**Tip:** Store your token in a `.env` file so you only need to enter the deployment ID each time:

```env
VERCEL_TOKEN=your_token_here
```

## CLI Arguments

```bash
npx vercel-deploy-source-downloader [token] [options]
```

| Option | Description | Default |
|---|---|---|
| `--deployment <id>` | Deployment ID (with or without `dpl_` prefix) | `latest` |
| `--project <name>` | Project name | auto-detect |
| `--team <slug-or-id>` | Team slug (e.g. `numanaral`) or ID (e.g. `team_xxx`) | auto-detect |
| `--output <path>` | Output directory | `./out` |
| `--verbose` | Show per-file progress, file tree, and skipped files in console | off |
| `--retry-failed` | Re-download only files that failed in a previous run | off |

## Environment Variables / `.env` File

Create a `.env` file (see `.env.example`):

```env
VERCEL_TOKEN=your_token_here
VERCEL_DEPLOYMENT=aBcxxxxxxxxxxxxxxxxxxxxyZa
```

| Variable | Description | Default |
|---|---|---|
| `VERCEL_TOKEN` | Vercel API token ([create one](https://vercel.com/account/tokens)) | — |
| `VERCEL_DEPLOYMENT` | Deployment ID or `latest` | `latest` |
| `VERCEL_PROJECT` | Project name (optional, auto-detected) | — |
| `VERCEL_TEAM` | Team slug or ID (optional, auto-detected) | — |
| `VERCEL_OUTPUT` | Output directory path | `./out` |

## Priority Order

1. CLI arguments (highest)
2. Environment variables
3. `.env` file
4. Defaults (lowest)

## Team Parameter

The `--team` flag and `VERCEL_TEAM` variable accept either format:

- **Slug** — the short name from the URL, e.g. `numanaral`
- **ID** — the full team ID, e.g. `team_xxxxxxxxxxxxxxxxxxxxxxxx`

Both work identically with the Vercel API. Use whichever is easier to find. In most cases you don't need to provide this at all — it's auto-detected from the deployment ID.

## Usage Examples

```bash
# Interactive — prompts for everything
npx vercel-deploy-source-downloader

# Specific deployment
npx vercel-deploy-source-downloader <token> --deployment aBcxxxxxxxxxxxxxxxxxxxxyZa

# Specific project's latest deployment
npx vercel-deploy-source-downloader <token> --project my-project

# Explicit team (slug or ID)
npx vercel-deploy-source-downloader <token> --deployment <id> --team numanaral

# Verbose output
npx vercel-deploy-source-downloader <token> --verbose

# Custom output directory
npx vercel-deploy-source-downloader <token> --output ./my-source

# Token from .env, deployment from CLI
npx vercel-deploy-source-downloader --deployment aBcxxxxxxxxxxxxxxxxxxxxyZa

# Token from CLI, project from env
VERCEL_PROJECT=my-project npx vercel-deploy-source-downloader <token>

# Retry only previously failed files
npx vercel-deploy-source-downloader --deployment <id> --retry-failed
```
