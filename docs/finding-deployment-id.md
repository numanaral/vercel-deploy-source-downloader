# Finding Your Deployment ID

## From the Vercel Dashboard

1. Open your project on [vercel.com](https://vercel.com)
2. Click on the deployment you want to download
3. Look at the URL in your browser:

```
https://vercel.com/numanaral/my-project/aBcxxxxxxxxxxxxxxxxxxxxyZa/source
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is your deployment ID
```

4. Copy that ID and use it.

## `dpl_` Prefix

The Vercel dashboard URL shows the deployment ID **without** the `dpl_` prefix. The API expects it **with** the prefix. The tool handles this automatically — both formats work:

```bash
# Without prefix (as copied from the URL)
npx vercel-deploy-source-downloader <token> --deployment aBcxxxxxxxxxxxxxxxxxxxxyZa

# With prefix
npx vercel-deploy-source-downloader <token> --deployment dpl_aBcxxxxxxxxxxxxxxxxxxxxyZa
```

## Auto-Detection of Project and Team

When you provide a deployment ID, the tool **automatically resolves** the project name and team from the Vercel API. You don't need to provide `--project` or `--team` unless auto-detection fails.

The tool tries the deployment ID (with and without `dpl_` prefix) across your personal account and all your teams until it finds a match. If you have many teams and want to speed things up, you can provide `--team` explicitly.
