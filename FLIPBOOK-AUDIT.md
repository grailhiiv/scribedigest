# Flipbook audit

Reviewed November 9, 2026. Scope: standalone admin authentication, PDF upload and storage, reader delivery, title editing, and iframe embedding. This is a focused source and functional review, not a penetration test or a guarantee of security.

## Remaining findings

### High — Large uploads can consume much more memory than the PDF size

`app/api/books/route.ts` buffers multipart form data and then loads the PDF into memory for validation. A 300 MiB file may require several copies in memory, and concurrent uploads can exhaust a small server. The limit depends on `Content-Length` and is not a streaming byte limit. Before public deployment, restrict upload access and size at the reverse proxy, set an appropriate request timeout and server memory limit, and plan a streaming upload and background validation pipeline.

### Medium — Login lockout is global and only lasts for the process lifetime

`app/api/login/route.ts` uses one in-memory counter for all login attempts. Eight sign-in attempts can temporarily block the administrator, and restarting or running multiple instances resets or separates the counter. Before exposing the admin login publicly, configure durable rate limiting at a trusted reverse proxy, preferably with per-client controls, and restrict admin access where practical.

### Medium — Sessions cannot be revoked individually

`lib/auth.ts` issues a signed session cookie for 12 hours. Signing out removes the current browser cookie but does not revoke a copied token. Rotating `SESSION_SECRET` invalidates all existing sessions. Server-side session tracking is needed for individual revocation.

### Intended publication behavior — Reader links and source PDFs are public

Anyone with a reader or PDF URL can access and share it. There are no private publications, password protection, or expiring links. Embed code uses the current site's origin, so it should be copied after deployment on the intended HTTPS subdomain. The reverse proxy must allow the reader to be framed by embedding sites; restrictive `X-Frame-Options` or `frame-ancestors` headers can prevent embeds.

## Changes and verification

- The PDF endpoint streams the file and supports single byte-range requests, rather than reading every PDF entirely into server memory for each reader request.
- Library storage errors other than a missing directory are surfaced rather than displayed as an empty library.
- Title changes require an authenticated, same-origin request, validate input, and replace metadata atomically. Missing publications return 404.
- Embed code escapes publication titles before placing them in an HTML attribute.
- In an isolated local library, sign-in, PDF upload, title change and persistence after reload, embed-code generation, and a reader embedded on a different local origin were checked. PDF byte-range delivery and rejection of an unauthenticated title change were also checked.
- A full 300 MiB upload, production reverse-proxy settings, multiple concurrent uploads, and cross-browser/device coverage have not been tested.

## November 9 security hardening update

Small login, upload initialization, and title-change requests now enforce limits on the bytes actually received. General response headers reduce MIME sniffing and restrict sensitive browser features; login and admin pages additionally disallow framing and caching, while public reader embeds remain permitted. PDF structure validation does not scan for malware.

The older large-upload finding above refers to a previous endpoint. Uploads now use bounded chunks, but final PDF validation still reads the full PDF into memory; concurrent large uploads can exhaust server resources. The process-local login limit and lack of individual session revocation also remain open. Turnstile is required for sign-in and requires configuration; Cloudflare rate limiting must be configured separately.
