# Download Vercel Source

A CLI tool to download source code from Vercel deployments. Interactive setup, automatic project/team detection, smart caching, progress tracking, and resume support.

![Demo](https://raw.githubusercontent.com/numanaral/vercel-deploy-source-downloader/main/assets/demo.gif)

## Quick Start

Just run the script — it walks you through everything interactively:

```bash
npx vercel-deploy-source-downloader
```

Or pass everything directly:

```bash
npx vercel-deploy-source-downloader <token> --deployment aBcxxxxxxxxxxxxxxxxxxxxyZa
```

For detailed configuration and advanced usage, see [Documentation](#documentation).

## Getting Your Vercel Token

Create or find your token at [vercel.com/account/tokens](https://vercel.com/account/tokens). The token needs access to the deployments you want to download.

If you add `VERCEL_TOKEN` to a `.env` file, the interactive setup will pre-fill it so you don't have to paste it every time.

## Finding Your Deployment ID

Copy the ID from your Vercel dashboard URL:

```
https://vercel.com/your-scope/your-project/aBcxxxxxxxxxxxxxxxxxxxxyZa/source
                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                           Copy this part
```

Works with or without the `dpl_` prefix. Project and team are auto-detected.

## Install

```bash
# No install needed
npx vercel-deploy-source-downloader

# Or install globally
npm install -g vercel-deploy-source-downloader
```

## Output

```
out/dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa/
├── source/          # Downloaded source files
└── download-log.txt # Full operation log
```

Re-running the same deployment prompts to resume or start fresh.

### Example

```
📦 Deployment ID:  dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa
🌐 Deployment URL: my-app-xyz.vercel.app
📁 Project:        my-project

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

✨ Download and verification complete!
📄 Full log saved to: out/dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa/download-log.txt
```

## Requirements

- Node.js >= 18.0.0

## Documentation

- [Configuration](docs/configuration.md) — Interactive mode, CLI args, env vars, team parameter
- [Finding Your Deployment ID](docs/finding-deployment-id.md) — How to get the ID, `dpl_` prefix, auto-detection
- [Troubleshooting](docs/troubleshooting.md) — Common errors and fixes
- [Advanced Usage](docs/advanced.md) — Resume, verbose mode, output structure, example output

## License

MIT

## Author

[Numan Aral](https://numanaral.dev?utm_source=vercel-deploy-source-downloader-github&utm_medium=readme&utm_campaign=vercel-deploy-source-downloader)
