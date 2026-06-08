# Cloudflare Pages Deployment

This project is configured for Nuxt + Nitro with the `cloudflare_pages` preset.

## Pages

- Framework preset: `Nuxt`
- Production branch: `master`
- Build command: `npm run build:pages`
- Build output directory: `dist`

## Node Version

Set this in Cloudflare Pages:

- `NODE_VERSION=20`

Also enable:

- `Node.js compatibility`

## Initial Deployment

1. In Cloudflare Pages, choose `Connect to Git`
2. Connect the GitHub repository `eldermass/t-king`
3. Use the build settings above
4. Save and deploy

## Notes

- The Nuxt server routes deploy with Pages Functions
- Quote and stock profile APIs still fetch upstream data at runtime

## PushDeer Notifier Worker

The site remains on Cloudflare Pages. Background reminders are handled by a separate Cloudflare Worker.

### Worker

- Worker name: `t-king-pushdeer-notifier-v`
- Worker config file: `wrangler.wecom.toml`

Deploy with:

```bash
npx wrangler deploy --config wrangler.wecom.toml
```

### Runtime Secret

Configure this secret on the worker:

- `NOTIFIER_RUN_TOKEN`

### Trigger via cron-job.org

The worker no longer relies on Cloudflare Cron Triggers. Use `cron-job.org` to call the manual endpoint.

- URL: `https://t-king-pushdeer-notifier-v.a285653184.workers.dev/__run`
- Method: `GET`
- Header: `Authorization: Bearer <NOTIFIER_RUN_TOKEN>`

Example:

```bash
curl -X GET "https://t-king-pushdeer-notifier-v.a285653184.workers.dev/__run" -H "Authorization: Bearer tk-run-20260605-test"
```

To inspect recent runs:

```bash
curl -X GET "https://t-king-pushdeer-notifier-v.a285653184.workers.dev/__status" -H "Authorization: Bearer tk-run-20260605-test"
```
