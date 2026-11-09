# Scribe Flipbook — standalone

A Next.js app for publishing PDF flipbooks without WordPress. The admin dashboard and sign-in use Tailwind CSS and shadcn/ui components, with layouts adapted from [shadcn-admin](https://github.com/satnaing/shadcn-admin). The reader is adapted from the Scribe Flipbook plugin in this repository.

## Run locally

Requires Node.js 22 or newer and npm.

```powershell
cd "D:\Codex\Scribe Digest"
npm install
npm run setup
npm run dev
```

Enter an admin username and a password of at least 12 characters when prompted. The setup command creates `.env.local` and will not overwrite an existing file. Password input is visible in the terminal. Restart the app after changing configuration. Configure Turnstile as described below, then open http://localhost:3000 and sign in. Upload an unlocked PDF (maximum 300 MB), then use the actions in the library to open it, edit its title, or copy an iframe embed code. Reader links use eight-digit IDs, for example `https://flipbook.scribedigest.com/12345678`; old `/flipbook/<UUID>` links continue to redirect. Reader links and PDFs are public to anyone who has the link. Eight-digit IDs are easier to guess and are not a privacy control. Embed code uses the address currently in the browser, so generate it from the final HTTPS subdomain, not localhost.

## Production

Run `npm ci`, then `npm run build` and `npm start` on a Node server behind an HTTPS reverse proxy for the chosen subdomain. Configure the admin variables from `.env.local` securely on the server, and protect and back up that file. Use a long unique password. Secure cookies require HTTPS in production.

By default PDFs and metadata are stored on the server filesystem in `data/books`. Set `DATA_DIR` to an **absolute path on a persistent, writable disk**, outside the public web root. Back up that directory. Ephemeral/serverless filesystems and multiple app instances do not provide shared durable storage; use one persistent server for this version. Uploads are sent in chunks of up to 8 MiB; configure the reverse proxy to allow those requests and enough time for PDF processing and transfer to storage. PDF validation still loads the full document into memory, and uploads temporarily occupy disk space. Interrupted uploads can leave files under `DATA_DIR/uploads`; periodically remove old, inactive upload directories. Rate limiting is process-local and resets on restart; add durable rate limiting at the proxy before exposing the login publicly. Configure the proxy to overwrite forwarded host headers, and limit direct access to the app server.

For production, enforce durable login rate limits at the reverse proxy, restrict access to the admin where practical, and protect the origin server from direct access. Signing out only removes the current cookie; rotate the session secret to revoke all previously issued sessions.

### Login protection with Cloudflare Turnstile

Create a Turnstile widget for the hostname serving the app, then set these server environment variables (the secret must remain private):

```dotenv
TURNSTILE_SITE_KEY=<widget-site-key>
TURNSTILE_SECRET_KEY=<widget-secret-key>
TURNSTILE_HOSTNAME=flipbook.example.com
```

Use the exact hostname without a scheme or port. The app checks the token on the server and requires its hostname and `login` action to match. Login fails closed if configuration is missing or Cloudflare verification is unavailable. Restart after changes. For local development, create a widget that explicitly allows `localhost` and use `TURNSTILE_HOSTNAME=localhost`; do not use Cloudflare's always-pass test keys in production. Cloudflare's dummy test secret returns `example.com` and omits the action, so it is not accepted by the production verifier.

In Cloudflare Security > Security rules, create a rate-limiting rule for the deployed hostname and path `/api/login`, counting by client IP, and block excessive requests (for example, more than 5 per minute, where the plan supports it). Restrict the origin so clients cannot bypass Cloudflare, and configure the proxy to overwrite forwarded headers. Supported rule fields and thresholds vary by plan; on Free, match the path and scope it to the intended zone. The app also applies a shared process-local limit of 8 attempts per 15 minutes as a backstop; it resets on restart and can temporarily block all users, so it does not replace Cloudflare's rule. No Cloudflare rule is created automatically.

### Cloudflare R2

Create a bucket-scoped R2 API token with object read and write permissions. Add the following to `.env.local` on the server (never commit the file or share the secret):

```dotenv
STORAGE_DRIVER=r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=<bucket-name>
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
```

Use the account-level S3 endpoint without the bucket name at the end. Restart the app after changing the configuration. New PDFs are stored privately in R2 and served through the app; old local books stay local. Titles, ID mappings, and other metadata remain on the server, so back up the complete `DATA_DIR` as well as the R2 bucket. Existing books retain their original storage keys. Deleting a book deletes its PDF from its original storage and then removes its local metadata; previously cached copies may remain until they expire. Configure an R2 lifecycle rule to abort incomplete multipart uploads as an additional safeguard.

This version creates, reads, renames, replaces the PDF for, and deletes publications and generates iframe embed code. Replacing a PDF keeps the publication title and link and updates its page count. It does not yet import existing WordPress books, generate actual cover thumbnails, provide folders, track views, or implement advanced Publuu features. PDF URLs are public and should contain only material intended for readers. Embedding requires the hosting proxy to permit framing of the reader URL; global X-Frame-Options or Content-Security-Policy frame-ancestors restrictions may block it. See [FLIPBOOK-AUDIT.md](./FLIPBOOK-AUDIT.md) for the remaining operational risks.

The vendored reader is GPL-2.0-or-later, as is the source plugin. Its PDF.js and PageFlip vendors retain their respective license notices.
