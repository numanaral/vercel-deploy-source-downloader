# AGENTS.md - Technical Documentation for AI Agents & Developers

This document provides technical details about the `vercel-deploy-source-downloader` tool for AI agents and developers working with the codebase.

## Architecture Overview

### Core Components

1. **Configuration Management**
   - `.env` file loader with priority system
   - CLI argument parser
   - Environment variable support
   - Priority: CLI > ENV > .env > defaults

2. **Vercel API Integration**
   - Deployments API (v6) - List and fetch deployment info
   - Deployments API (v13) - Get specific deployment details with auto-detection
   - Teams API (v2) - Resolve team scopes
   - File Tree API - Get directory structure (lazy-loaded per directory)
   - Files API (v7) - Download individual files (hash-based and path-based URLs)

3. **File Management**
   - Recursive directory traversal with lazy child loading
   - Smart caching (skip existing files)
   - Deployment-specific output folders (`out/{deploymentId}/source/`)
   - Resume support with pre-existing file count
   - Retry failed downloads (interactive + `--retry-failed` flag)

4. **Logging & Reporting**
   - Dual logging (console + file)
   - Append-mode log file with run separators (preserves history)
   - Verbose mode support
   - Statistics collection
   - Tree view visualization

5. **Progress Display**
   - Multi-line spinner with live counters (downloaded, skipped, failed)
   - TTY-aware (ANSI codes only when stdout is a terminal)
   - Spinner disabled in verbose mode (per-file log messages instead)

## File Structure

```
vercel-deploy-source-downloader/
├── src/
│   └── vercel-deploy-source-downloader.ts # Main script
├── docs/
│   ├── configuration.md                   # CLI args, env vars, interactive mode
│   ├── finding-deployment-id.md           # How to get deployment IDs
│   ├── advanced.md                        # Resume, retry, verbose, output structure
│   └── troubleshooting.md                 # Common errors and fixes
├── package.json                           # NPM package config
├── .env.example                           # Example environment config
├── README.md                              # User documentation
├── AGENTS.md                              # This file
├── CHANGELOG.md                           # Version history
├── PUBLISHING.md                          # NPM publishing guide
├── .gitignore                             # Git ignore rules
└── LICENSE                                # MIT license
```

## API Endpoints Used

### 1. List Deployments
```
GET https://api.vercel.com/v6/deployments?limit=100&teamId={teamId}
```
**Purpose:** Fetch available deployments, filter by project/state

### 2. Get Deployment Info
```
GET https://api.vercel.com/v13/deployments/{deploymentId}?teamId={teamId}
```
**Purpose:** Get specific deployment details. Tried with raw ID and `dpl_` prefix across personal account and all teams.

### 3. List Teams
```
GET https://api.vercel.com/v2/teams
```
**Purpose:** Resolve all team scopes for auto-detection.

### 4. File Tree
```
GET https://vercel.com/api/file-tree/{deploymentUrl}?base=src/{path}&teamId={teamId}
```
**Purpose:** Get source file tree structure. Directories are lazy-loaded — top-level returns immediate children only; subdirectories require separate requests with `base=src/{dirPath}`.

**Response:**
```typescript
Array<{
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;    // For files: download URL (hash-based or path-based)
  children?: FileNode[];  // For directories (may be absent — lazy-loaded)
}>
```

### 5. Download File

Two URL formats returned by the File Tree API:

**Hash-based** (older deployments):
```
https://vercel.com/api/v7/deployments/{deploymentId}/files/{hash}?teamId={teamId}
```

**Path-based** (newer deployments):
```
https://vercel.com/api/v7/deployments/{deploymentId}/files/get?path={filePath}
```

`resolveFileUrl(link)` normalizes both formats into a full URL with `teamId`.

**Response:** `{ data: string }` (base64 encoded). Some files (e.g. `.env*`) are blocked by Vercel with `{ error: { message: "Previewing this file is not supported." } }`.

## Key Functions

### `loadEnvFile()`
- Reads `.env` file from current directory
- Parses KEY=VALUE format
- Handles quoted values
- Only sets if not already in environment

### `parseArgs()`
- Loads .env first
- Parses CLI arguments (including `--retry-failed` flag)
- Returns configuration object with priority handling

### `getLatestDeployment()`
- Fetches deployment list
- Filters by project name (if specified)
- Filters to READY state only
- Sorts by creation time (newest first)
- Returns deployment details

### `resolveFileUrl(link: string): string | null`
- Normalizes file tree link into a full download URL
- Handles hash-based, full URL, and relative URL formats
- Appends `teamId` if missing

### `downloadFile(fileUrl: string): Promise<Buffer>`
- Downloads file via resolved URL
- Decodes base64 response
- Detects API error responses (e.g. blocked `.env*` files)
- Returns raw buffer

### `processNode(node, basePath, relativePath)`
- Recursive tree traversal
- Lazy-loads directory children (stores back into tree for retry)
- In retry mode: prunes directories that can't contain failed files
- Creates directories, downloads files, skips lambdas
- Tracks downloaded/skipped/failed files

### `generateTree(filePaths: string[], baseDir: string): string[]`
- Builds tree structure from file paths
- Sorts directories first, then files
- Generates ASCII tree with emoji icons
- Returns array of formatted lines

### `parsePreviousFailures(): Set<string>`
- Reads previous `download-log.txt` before it's overwritten
- Extracts relative paths of failed downloads via regex
- Used by resume prompt (Y/n/r) and `--retry-failed` flag

## Configuration Priority

1. **CLI Arguments** (highest priority)
   ```bash
   --deployment dpl_ABC --project name --team id --retry-failed --output ./out
   ```

2. **Environment Variables**
   ```bash
   VERCEL_DEPLOYMENT=dpl_ABC VERCEL_PROJECT=name
   ```

3. **`.env` File**
   ```env
   VERCEL_DEPLOYMENT=dpl_ABC
   VERCEL_PROJECT=name
   ```

4. **Defaults** (lowest priority)
   ```typescript
   deployment: "latest"
   project: ""
   team: ""
   output: "./out"
   ```

## Data Flow

```
1. Load .env → Parse CLI args → Validate token
                    ↓
2. Interactive setup (if no deployment ID configured)
   - Prompt for token, deployment ID, project, team
                    ↓
3. Resolve deployment (latest or specific)
   - Try raw ID and dpl_ prefix across personal + all teams
                    ↓
4. Fetch file tree from Vercel API
                    ↓
5. Parse previous log for failures (before overwriting)
                    ↓
6. Resume/retry/redo prompt (if previous download exists)
   - Y = resume, n = fresh start, r = retry failed only
                    ↓
7. Initialize log file (append or fresh based on choice)
                    ↓
8. Start spinner → Recursively traverse tree:
   - Create directories (lazy-load children as needed)
   - Check if file exists (skip if cached)
   - Download missing files
   - In retry mode: only process failed files
                    ↓
9. Stop spinner → Generate statistics:
   - Count files, calculate sizes, group by extension
                    ↓
10. Generate tree view → Show summary
                    ↓
11. If failures: interactive retry prompt
    - Retry immediately or print --retry-failed command
                    ↓
12. Write complete log to file (appended to existing)
```

## File States

Each file goes through these states:

1. **Discovered** - Found in file tree
2. **Checked** - Local existence verified
3. **Skipped** - Already exists with content (cached)
4. **Downloading** - Fetching from API
5. **Downloaded** - Successfully saved
6. **Failed** - Error during download (tracked for retry)

## Error Handling

### API Errors
- Network failures → Fails immediately
- 404 Not Found → Logs error, continues with other files
- Rate limiting → Fails with error message
- Auth errors → Fails immediately
- Blocked files (`.env*`) → Clear error message, continues

### Retry Mechanism
- Interactive prompt at end of download if any files failed
- `--retry-failed` flag to re-download only failed files from previous log
- Resume prompt offers retry option (Y/n/r) when previous failures detected

### File System Errors
- Permission denied → Logs error, continues
- Disk full → Fails immediately
- Invalid path → Logs error, skips file

## Performance Considerations

### Caching Strategy
- Files are checked for existence before download
- Only downloads if file doesn't exist or is empty
- Makes re-runs very fast (only new files)

### Network Optimization
- Sequential downloads (no parallelization)
- Lazy directory loading (only fetches subdirectories when traversed)
- Retry mode prunes irrelevant directories to minimize API calls

### Memory Usage
- Files downloaded to memory then written
- For large files, this could be optimized with streams
- Current limit: Node.js heap size

## Security Considerations

### Token Handling
- Never logged to console or file
- Should be in .env (gitignored)
- Passed via env or CLI only

### File Safety
- Creates directories recursively
- Uses absolute paths
- Overwrites existing empty files
- Skips existing non-empty files

### API Scope
- Only accesses deployments user has access to
- No write operations
- Read-only API calls

## Extending the Tool

### Adding New File Types
No special handling needed - automatically processes all file types.

### Custom Output Directory
Configurable via `--output` flag or `VERCEL_OUTPUT` environment variable. Defaults to `./out`.

### Adding Parallel Downloads
Replace sequential loop with Promise.all():
```typescript
await Promise.all(
  fileTree.map(node => processNode(node, outputDir))
);
```

## Testing

### Manual Testing Checklist
- [ ] Download with CLI token
- [ ] Download with .env token
- [ ] Download latest deployment
- [ ] Download specific deployment
- [ ] Download with project filter
- [ ] Download with team scope
- [ ] Re-run (should skip existing files)
- [ ] Verbose mode
- [ ] Invalid token (should fail gracefully)
- [ ] Missing deployment (should fail gracefully)
- [ ] Retry failed (--retry-failed with previous log)
- [ ] Interactive retry prompt after failures
- [ ] Resume prompt with Y/n/r when failures exist
- [ ] Piped output (spinner should not emit ANSI codes)

### Test Cases
```bash
# Success cases
npx tsx src/vercel-deploy-source-downloader.ts <valid-token>
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --deployment dpl_VALID
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --project valid-project

# Retry failed downloads
npx tsx src/vercel-deploy-source-downloader.ts --deployment dpl_VALID --retry-failed

# Error cases
npx tsx src/vercel-deploy-source-downloader.ts invalid-token
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --deployment dpl_INVALID
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --project nonexistent
```

## Common Issues & Solutions

### Issue: Files contain `{"error": "not_found"}`
**Cause:** Using wrong API endpoint or deployment ID format
**Solution:** Script uses correct v7 endpoint with full deployment ID (dpl_xxx)

### Issue: "Previewing this file is not supported"
**Cause:** Vercel blocks certain files (e.g. `.env*`) from their file preview API
**Solution:** This is a Vercel-side restriction. These files cannot be downloaded via the API.

### Issue: Empty files downloaded
**Cause:** Files are lambda functions or build outputs
**Solution:** Script automatically skips lambdas, only downloads source

### Issue: Rate limiting
**Cause:** Too many API requests in short time
**Solution:** Wait and retry with `--retry-failed`, or implement exponential backoff

### Issue: Large memory usage
**Cause:** Loading entire files into memory
**Solution:** Implement streaming for large files

## Future Enhancements

### Potential Features
1. **Parallel Downloads** - Speed up large projects
2. **Incremental Updates** - Only download changed files
3. **Compression** - Compress downloaded files
4. **Watch Mode** - Automatically download on new deployments
5. **Diff Mode** - Show what changed between deployments
6. **Selective Download** - Download specific paths only
7. **Webhook Integration** - Trigger on deployment events

## Dependencies

### Runtime Dependencies
None - uses only Node.js built-ins:
- `fs` - File system operations
- `path` - Path manipulation
- `https` - HTTP requests
- `readline` - Interactive prompts

### Dev Dependencies
- `tsx` - TypeScript execution
- `typescript` - Type checking and compilation
- `eslint` - Linting
- `prettier` - Code formatting

## TypeScript Interfaces

### Core Types
```typescript
interface FileNode {
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;
  children?: FileNode[];
}

interface Deployment {
  uid: string;
  name: string;
  url: string;
  created: number;
  state: string;
}

interface DeploymentsResponse {
  deployments: Deployment[];
}
```

## Logging Format

### Console Output (Verbose Mode)
```
✅ Downloaded: /full/path/to/file.ts
⏭️  Skipping (already exists): /full/path/to/cached.ts
❌ Failed to download /path/to/file.ts: Error message
```

### Spinner (Non-Verbose Mode)
```
   ⠹ Downloading...
   ✅ Downloaded: 42
   ⏭️  Skipped:    276
   ❌ Failed:     0
```

### Log File Format
- Append-mode: new runs add a separator with timestamp
- Contains all console output (verbose and non-verbose)
- Full error messages and stack traces
- Complete file list and tree view

## Contributing Guidelines

### Code Style
- Use TypeScript
- Arrow functions for consistency
- Async/await over promises
- Clear variable names
- Comments only for non-obvious logic

### Commit Messages
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for code refactoring
- `perf:` for performance improvements

### Pull Request Process
1. Update README.md if needed
2. Update AGENTS.md for technical changes
3. Update CHANGELOG.md for user-facing changes
4. Test manually with various scenarios
5. Update version in package.json

## License

MIT - See LICENSE file for details

---

**Last Updated:** February 2026
**Version:** 1.1.0
**Maintainer:** Numan <ahmetnuman95@hotmail.com>
