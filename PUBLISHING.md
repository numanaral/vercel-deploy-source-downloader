# Publishing to NPM

Guide for publishing updates to the [`vercel-deploy-source-downloader`](https://www.npmjs.com/package/vercel-deploy-source-downloader) package on npm.

## Prerequisites

1. **npm login**: Run `npm login` and authenticate as `numanaral`
2. **Verify**: Run `npm whoami` to confirm you're logged in

## Publishing an Update

### 1. Make your changes in `src/`

Update the code, then update [CHANGELOG.md](CHANGELOG.md) with the new version's changes.

### 2. Bump the version

```bash
npm version patch   # 1.1.0 → 1.1.1 (bug fixes)
npm version minor   # 1.1.0 → 1.2.0 (new features)
npm version major   # 1.1.0 → 2.0.0 (breaking changes)
```

This updates `package.json` and creates a git tag automatically.

### 3. Test locally

```bash
# Preview what will be published
npm pack --dry-run

# Or test the full install from a tarball
npm pack
npm install /path/to/vercel-deploy-source-downloader-<version>.tgz
```

### 4. Publish

```bash
npm publish
```

The `prepublishOnly` script runs `npm run build` automatically, so the latest code is always compiled before publishing.

### 5. Push to GitHub

```bash
git push && git push --tags
```

### 6. Verify

```bash
# Check on npm
open https://www.npmjs.com/package/vercel-deploy-source-downloader

# Test the published version
npx vercel-deploy-source-downloader@latest
```

## Using the Published Package

```bash
# Run directly with npx (no install needed)
npx vercel-deploy-source-downloader

# Or install globally
npm install -g vercel-deploy-source-downloader
vercel-deploy-source-downloader
```

## Package Configuration

Key `package.json` fields:

| Field | Purpose |
|---|---|
| `name` | Package name on npm |
| `version` | Semantic version (x.y.z) |
| `description` | Shows in npm search results |
| `main` | Entry point for `require()` |
| `bin` | CLI command mapping |
| `files` | What to include in the npm package |
| `keywords` | For npm search discovery |
| `repository` | GitHub link |
| `engines` | Minimum Node.js version |

## Troubleshooting

### "You do not have permission to publish"
- Make sure you're logged in: `npm whoami`
- Verify you own the package: `npm owner ls vercel-deploy-source-downloader`

### "EPERM" or cache errors
- Fix npm cache: `sudo chown -R $(id -u):$(id -g) ~/.npm`

### Testing before publish
- Use `npm pack --dry-run` to see what would be included
- Use `npm publish --dry-run` to test without actually publishing

## Version History

See [CHANGELOG.md](CHANGELOG.md) for the full version history.
