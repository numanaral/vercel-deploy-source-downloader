# Advanced Usage

## Output Structure

Files are organized into a deployment-specific folder:

```
out/{deployment-id}/
├── source/          # Downloaded source files
└── download-log.txt # Full operation log
```

Each deployment gets its own folder, so downloading multiple deployments won't overwrite each other.

## What Gets Downloaded

The tool downloads **source code** from your Vercel deployment:

- Source files (`.ts`, `.tsx`, `.js`, `.jsx`, etc.)
- Configuration files (`package.json`, `tsconfig.json`, etc.)
- Static assets
- Database schemas

Lambda functions and build outputs are skipped automatically.

## Re-runs and Resume

If a previous download exists for the same deployment, the tool shows how many files are already present and asks what to do.

When there are **no previous failures**:

```
📂 Previous download detected for this deployment.
   178 file(s) already downloaded.

   Enter to continue where you left off, or 'n' to re-download from scratch.

   Continue? (Y/n):
```

- **Enter** or **Y** — continue where you left off (already downloaded files are skipped)
- **n** — clear the folder and re-download from scratch

When there **are previous failures** (detected from the log file):

```
📂 Previous download detected for this deployment.
   178 file(s) already downloaded.
   2 file(s) failed in previous run.

   Y = resume (skip existing, download remaining)
   n = re-download everything from scratch
   r = retry failed only

   Choice (Y/n/r):
```

- **Enter** or **Y** — resume (skip existing, download remaining)
- **n** — clear the folder and re-download everything from scratch
- **r** — only re-download the files that failed previously

## Retrying Failed Downloads

If any files fail to download, the tool prompts you to retry immediately:

```
❌ Failed downloads: 1
   .env.example

   1 file(s) failed. Retry now? (Y/n):
```

- **Enter** or **Y** — retry the failed files right away
- **n** — skip retry; the tool prints a command you can run later:

```
   To retry later: npx tsx src/vercel-deploy-source-downloader.ts --deployment <id> --retry-failed
```

The `--retry-failed` flag reads the previous `download-log.txt`, finds which files failed, and only re-downloads those — skipping everything else.

## Verbose Mode

Use `--verbose` to see detailed output in the console:

- Per-file download/skip status
- Full file structure tree
- Skipped files list

Without `--verbose`, the console shows a spinner with download/skip counts and a summary. The log file always contains full details.

## Example Output

```
📦 Deployment ID:  dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa
🌐 Deployment URL: my-app-xyz.vercel.app
📁 Project:        my-project
👥 Team:           team_xxx

⬇️  Downloading files...
   ⠹ Downloading...
   ✅ Downloaded: 42
   ⏭️ Skipped:    276
   ❌ Failed:     0

🎉 All files processed successfully!

📁 Total files: 318
   ✅ Downloaded: 42
   ⏭️ Skipped: 276
   ❌ Failed: 0
💾 Total size: 5.79 MB

📈 File types breakdown:
   ts               122 files
   tsx              106 files
   md                38 files

✨ Download and verification complete!
📄 Full log saved to: out/dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa/download-log.txt
   (Use --verbose to see file tree and skipped files)
```

## Getting Your Vercel Token

1. Go to [Vercel Account Tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Give it a name and appropriate scope
4. Copy the token

**Security Note:** Never commit your `.env` file or share your token publicly.
