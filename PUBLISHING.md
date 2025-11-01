# Publishing to NPM

This document explains how to publish the `download-vercel-source` package to npm.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **npm login**: Run `npm login` and authenticate with your credentials
3. **Package name availability**: Verify the name is available at https://www.npmjs.com/package/download-vercel-source

## Project Structure

```
vercel-deploy-source-downloader/
├── src/                           # Source TypeScript files
│   └── vercel-deploy-source-downloader.ts
├── dist/                          # Compiled JavaScript (gitignored, created on build)
│   ├── vercel-deploy-source-downloader.js
│   ├── vercel-deploy-source-downloader.d.ts
│   └── *.map files
├── package.json                   # Package configuration
├── tsconfig.json                  # TypeScript configuration
├── .npmignore                     # Files to exclude from npm package
├── .gitignore                     # Files to exclude from git
├── README.md                      # User documentation
├── LICENSE                        # MIT license
└── .env.example                   # Example environment file
```

## Publishing Steps

### 1. Check Your Account
```bash
npm whoami
# Should show: numanaral
```

### 2. Update Version (if needed)
```bash
# For first publish, version 1.0.0 is already set
# For future updates:
npm version patch   # 1.0.0 → 1.0.1 (bug fixes)
npm version minor   # 1.0.0 → 1.1.0 (new features)
npm version major   # 1.0.0 → 2.0.0 (breaking changes)
```

### 3. Build the Package
```bash
npm run build
```

This will compile TypeScript to JavaScript in the `dist/` directory.

### 4. Test the Package Locally
```bash
# See what will be published
npm pack --dry-run

# Or create a tarball to inspect
npm pack
tar -tzf download-vercel-source-1.0.0.tgz
```

### 5. Test Installation Locally
```bash
# In another directory, test installing from the tarball
npm install /path/to/download-vercel-source-1.0.0.tgz

# Or use npm link
npm link
# Then in another project:
npm link download-vercel-source
```

### 6. Publish to npm
```bash
# First time publish
npm publish

# If the package name is taken, you can publish under a scope:
npm publish --access public

# For testing, you can publish to npm's test registry:
npm publish --dry-run
```

### 7. Verify Publication
```bash
# Check on npm website
open https://www.npmjs.com/package/download-vercel-source

# Or test installation
npx download-vercel-source@latest --help
```

## Using the Published Package

Once published, users can run it with:

```bash
# Run directly with npx (no installation needed)
npx download-vercel-source <token>
npx download-vercel-source <token> --deployment dpl_ABC --verbose

# Or install globally
npm install -g download-vercel-source
download-vercel-source <token>

# Or install locally in a project
npm install download-vercel-source
npx download-vercel-source <token>
```

## Automated Publishing

The `package.json` includes a `prepublishOnly` script that automatically runs `npm run build` before publishing, ensuring the latest code is compiled.

## Future Updates

To publish updates:

1. Make your changes in `src/`
2. Update version: `npm version patch` (or minor/major)
3. Build: `npm run build` (or just run npm publish, it will build automatically)
4. Publish: `npm publish`
5. Git commit and push: `git push && git push --tags`

## Package Configuration

Key `package.json` fields for npm:

- **name**: Package name on npm
- **version**: Semantic version (x.y.z)
- **description**: Shows in search results
- **main**: Entry point for `require()`
- **bin**: CLI command mapping
- **files**: What to include in package
- **keywords**: For npm search
- **repository**: GitHub link
- **author**: Your name/email
- **license**: MIT

## Troubleshooting

### "You do not have permission to publish"
- Make sure you're logged in: `npm whoami`
- Check if name is taken: https://www.npmjs.com/package/download-vercel-source
- If taken, use a scoped package: `@numanaral/download-vercel-source`

### "EPERM" or cache errors
- Fix npm cache: `sudo chown -R $(id -u):$(id -g) ~/.npm`

### "Package name too similar to existing package"
- Choose a different name or use a scope

### Testing before publish
- Use `npm pack --dry-run` to see what would be included
- Use `npm publish --dry-run` to test without actually publishing

## GitHub Repository

Don't forget to:
1. Create a GitHub repository at: https://github.com/numanaral/download-vercel-source
2. Push your code:
```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:numanaral/download-vercel-source.git
git push -u origin main
```

3. Add a GitHub Action for automated publishing (optional)

## Version History

- **1.0.0** - Initial release
  - Download source files from Vercel deployments
  - Support for latest or specific deployment IDs
  - Project and team filtering
  - Verbose mode
  - Tree view of downloaded files

