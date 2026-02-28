# Changelog

## 1.1.0

![Demo](https://raw.githubusercontent.com/numanaral/vercel-deploy-source-downloader/main/assets/demo.gif)

### Features
- Interactive setup wizard — prompts for token, deployment ID, project, and team when not configured
- Auto-detection of project and team from deployment ID (no need to specify them manually)
- Deployment ID works with or without the `dpl_` prefix, and directly from dashboard URLs
- Deployment-specific output folders (`out/{deploymentId}/source/`) to prevent overwrites
- Resume support — detects previous downloads, shows file count, and asks to continue or start fresh
- Retry failed downloads — interactive prompt at end of download, plus `--retry-failed` CLI flag
- Multi-line spinner progress display with live counters (replaces misleading progress bar)
- `--output` flag and `VERCEL_OUTPUT` env var for custom output directory

### Fixes
- Validate file tree API response before iterating (fixes [#1](https://github.com/numanaral/vercel-deploy-source-downloader/issues/1))
- Path-based download URL support for newer Vercel deployments (fixes [#2](https://github.com/numanaral/vercel-deploy-source-downloader/issues/2))
- Clear error messages for Vercel API restrictions (e.g. `.env*` files blocked from preview)
- Append-mode log file — preserves download history across runs instead of overwriting
- TTY-aware spinner — ANSI escape codes only emitted when stdout is a terminal
- Spinner properly cleaned up on errors

## 1.0.1

### Features
- Download source files from Vercel deployments
- Support for latest or specific deployment IDs
- Project and team filtering
- Smart caching — skip existing files on re-runs
- Verbose mode with per-file download/skip status
- File tree visualization in log output
- Dual logging — console output and persistent log file
- File type breakdown statistics
