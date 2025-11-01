# AGENTS.md - Technical Documentation for AI Agents & Developers

This document provides technical details about the `download-vercel-source` tool for AI agents and developers working with the codebase.

## Architecture Overview

### Core Components

1. **Configuration Management**
   - `.env` file loader with priority system
   - CLI argument parser
   - Environment variable support
   - Priority: CLI > ENV > .env > defaults

2. **Vercel API Integration**
   - Deployments API (v6) - List and fetch deployment info
   - File Tree API - Get directory structure
   - Files API (v7) - Download individual files with base64 decoding

3. **File Management**
   - Recursive directory traversal
   - Smart caching (skip existing files)
   - Atomic file writes
   - Tree structure generation

4. **Logging & Reporting**
   - Dual logging (console + file)
   - Verbose mode support
   - Statistics collection
   - Tree view visualization

## File Structure

```
vercel-deploy-source-downloader/
├── src/
│   └── vercel-deploy-source-downloader.ts    # Main script
├── package.json                                # NPM package config
├── .env.example                                # Example environment config
├── README.md                                   # User documentation
├── AGENTS.md                                   # This file
├── .gitignore                                  # Git ignore rules
└── LICENSE                                     # MIT license
```

## API Endpoints Used

### 1. List Deployments
```
GET https://api.vercel.com/v6/deployments?limit=100&teamId={teamId}
```
**Purpose:** Fetch available deployments, filter by project/state

**Response:**
```typescript
{
  deployments: Array<{
    uid: string;
    name: string;
    url: string;
    created: number;
    state: string;
  }>
}
```

### 2. Get Deployment Info
```
GET https://api.vercel.com/v13/deployments/{deploymentId}?teamId={teamId}
```
**Purpose:** Get specific deployment details

### 3. File Tree
```
GET https://vercel.com/api/file-tree/{deploymentUrl}?base=src&teamId={teamId}
```
**Purpose:** Get source file tree structure

**Response:**
```typescript
Array<{
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;  // For files: API URL to download
  children?: FileNode[];  // For directories
}>
```

### 4. Download File
```
GET https://vercel.com/api/v7/deployments/{deploymentId}/files/{fileHash}?teamId={teamId}
```
**Purpose:** Download file content (base64 encoded)

**Response:**
```typescript
{
  data: string;  // base64 encoded file content
}
```

## Key Functions

### `loadEnvFile()`
- Reads `.env` file from current directory
- Parses KEY=VALUE format
- Handles quoted values
- Only sets if not already in environment

### `parseArgs()`
- Loads .env first
- Parses CLI arguments
- Returns configuration object with priority handling

### `getLatestDeployment()`
- Fetches deployment list
- Filters by project name (if specified)
- Filters to READY state only
- Sorts by creation time (newest first)
- Returns deployment details

### `downloadFile(fileHash: string)`
- Downloads file via v7 API
- Decodes base64 response
- Returns raw buffer

### `processNode(node: FileNode)`
- Recursive tree traversal
- Creates directories
- Downloads files
- Skips lambdas
- Tracks downloaded/skipped files

### `generateTree(filePaths: string[])`
- Builds tree structure from file paths
- Sorts directories first, then files
- Generates ASCII tree with emoji icons
- Returns array of formatted lines

## Configuration Priority

1. **CLI Arguments** (highest priority)
   ```bash
   --deployment dpl_ABC --project name --team id
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
   ```

## Data Flow

```
1. Load .env → Parse CLI args → Validate token
                    ↓
2. Fetch deployment info (latest or specific)
                    ↓
3. Get file tree from Vercel API
                    ↓
4. Recursively traverse tree:
   - Create directories
   - Check if file exists
   - Download missing files
   - Log progress
                    ↓
5. Generate statistics:
   - Count files
   - Calculate sizes
   - Group by extension
   - Verify important files
                    ↓
6. Generate tree view
                    ↓
7. Write complete log to file
```

## File States

Each file goes through these states:

1. **Discovered** - Found in file tree
2. **Checked** - Local existence verified
3. **Skipped** - Already exists with content (cached)
4. **Downloading** - Fetching from API
5. **Downloaded** - Successfully saved
6. **Failed** - Error during download

## Error Handling

### API Errors
- Network failures → Retry not implemented, fails immediately
- 404 Not Found → Logs error, continues with other files
- Rate limiting → Fails with error message
- Auth errors → Fails immediately

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
- Could be improved with parallel downloads
- No rate limiting implemented

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
Currently hardcoded to `./out`. To change:
```typescript
const outputDir = join(process.cwd(), "custom-dir");
```

### Adding Parallel Downloads
Replace sequential loop with Promise.all():
```typescript
await Promise.all(
  fileTree.map(node => processNode(node, outputDir))
);
```

### Adding Progress Bar
Can integrate libraries like `cli-progress`:
```typescript
const bar = new cliProgress.SingleBar();
bar.start(totalFiles, 0);
// Update on each file
bar.increment();
bar.stop();
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

### Test Cases
```bash
# Success cases
npx tsx src/vercel-deploy-source-downloader.ts <valid-token>
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --deployment dpl_VALID
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --project valid-project

# Error cases
npx tsx src/vercel-deploy-source-downloader.ts invalid-token
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --deployment dpl_INVALID
npx tsx src/vercel-deploy-source-downloader.ts <valid-token> --project nonexistent
```

## Common Issues & Solutions

### Issue: Files contain `{"error": "not_found"}`
**Cause:** Using wrong API endpoint or deployment ID format
**Solution:** Script uses correct v7 endpoint with full deployment ID (dpl_xxx)

### Issue: Empty files downloaded
**Cause:** Files are lambda functions or build outputs
**Solution:** Script automatically skips lambdas, only downloads source

### Issue: Rate limiting
**Cause:** Too many API requests in short time
**Solution:** Implement exponential backoff or add delays between requests

### Issue: Large memory usage
**Cause:** Loading entire files into memory
**Solution:** Implement streaming for large files

## Future Enhancements

### Potential Features
1. **Parallel Downloads** - Speed up large projects
2. **Resume Support** - Continue interrupted downloads
3. **Incremental Updates** - Only download changed files
4. **Compression** - Compress downloaded files
5. **Watch Mode** - Automatically download on new deployments
6. **Diff Mode** - Show what changed between deployments
7. **Selective Download** - Download specific paths only
8. **Progress Bar** - Visual progress indicator
9. **Retry Logic** - Automatic retry on failures
10. **Webhook Integration** - Trigger on deployment events

## Dependencies

### Runtime Dependencies
None - uses only Node.js built-ins:
- `fs` - File system operations
- `path` - Path manipulation  
- `https` - HTTP requests

### Dev Dependencies
- `tsx` - TypeScript execution

## TypeScript Interfaces

### Core Types
```typescript
interface FileNode {
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;
  children?: FileNode[];
}

interface FileResponse {
  data: string; // base64 encoded
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

### Log File Format
All console output plus:
- Timestamp per entry (could be added)
- Full error stack traces
- Complete file list
- Tree view

## Contributing Guidelines

### Code Style
- Use TypeScript
- Arrow functions for consistency
- Async/await over promises
- Clear variable names
- Comments for complex logic

### Commit Messages
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for code refactoring
- `perf:` for performance improvements

### Pull Request Process
1. Update README.md if needed
2. Update AGENTS.md for technical changes
3. Test manually with various scenarios
4. Update version in package.json

## License

MIT - See LICENSE file for details

---

**Last Updated:** November 2025  
**Version:** 1.0.0  
**Maintainer:** Numan <ahmetnuman95@hotmail.com>

