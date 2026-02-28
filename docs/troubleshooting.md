# Troubleshooting

## "Deployment not found"

The tool automatically tries the deployment ID with and without `dpl_` prefix across your personal account and all teams. If it still fails:

- Double-check the deployment ID from the Vercel dashboard URL
- Ensure your token has access to that deployment
- Try providing `--team` explicitly with your team slug or ID

## "No deployments found"

- Verify the project name is correct
- Check that there are READY deployments
- Ensure your token has access to the project

## Files are empty or contain error JSON

- Your token might not have sufficient permissions
- The deployment may have been deleted

## Failed downloads

If files fail to download, the tool prompts you to retry immediately. If you skip the prompt, you can retry later with `--retry-failed`:

```bash
npx tsx src/vercel-deploy-source-downloader.ts --deployment <id> --retry-failed
```

This reads the previous `download-log.txt` and only re-downloads the files that failed.

## Rate limiting

The tool downloads files sequentially. If you hit rate limits, wait a few minutes and retry (or use `--retry-failed`).
