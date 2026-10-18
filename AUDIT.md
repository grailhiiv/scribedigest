# Scribe Flipbook audit — 2026-10-18

## Reader and library update — 1.1.0

Each published flipbook now has a full-viewport reader at its native WordPress permalink, normally `/flipbook/your-title/`. The native editor's Edit permalink control changes its slug. Existing shortcodes continue to work. The library now has a read-only Shortcode column, a styled accessible Status switch, and View / Replace PDF / Edit actions; the Embed button and panel are removed.

The reader starts through a classic `viewer.js` loader that catches module loading failures. All shipped JavaScript modules and the PDF worker now use `.js` filenames, avoiding dependence on a server's `.mjs` MIME setup. A failed initialization shows an error and the original PDF link; document loading has a deadline. This addresses the silent loading failure path in the screenshot, but the user's specific production server and original PDF were not accessed.

Local verification for this release: Add PDF opened the actual WordPress Media Library; selecting a PDF and clicking Create flipbook created a second publication and a distinct public URL. The full-page reader displayed the sample PDF, centered its cover, and navigated to a two-page spread. The native permalink editor saved `quarterly-2026`, and that new URL loaded. The Status switch changed state. An intentionally missing runtime module displayed the error and original-PDF fallback rather than remaining on Loading PDF. HTTP checks passed for inactive reader 404 without PDF data, reactivation, shortcode column, removal of Embed, and JavaScript MIME types. Vendor SHA-256 checks and PHP/JavaScript syntax checks passed. These checks use a synthetic sample PDF, not the user's original publication.

Current test commands: `node qa/reader-check.mjs`, `node qa/add-pdf-regression.mjs`, and `node scripts/verify-vendor.mjs`. Details below describe earlier audit stages and their respective versions.

Reviewed versions 1.0.1 and 1.0.2. Fixes are included in 1.0.2 and the rebuilt `scribe-flipbook.zip`.

## Add PDF correction — 1.0.3

The user reported that Add PDF did nothing after installing 1.0.2. The earlier audit did not fully verify this click through the upload/create workflow after its final changes. Its API upload tests did not establish that the UI click handler loaded on the user's host.

The admin script had a static PDF.js import before any event handlers. Failure to load or evaluate that module could therefore disable Add PDF and every other library action. Version 1.0.3 moves core actions into a regular `library.js` script and loads PDF.js dynamically only for previews. WordPress media-editor dependencies are declared explicitly. Add PDF and Replace PDF also have native editor links as a fallback when JavaScript is unavailable.

`node qa/add-pdf-regression.mjs` passed: the script binds Add PDF, opens a simulated WordPress media picker, and submits the create request even when PDF module loading fails. It also preserves the native link when the WordPress media API is absent. This is a regression test with stubs, not browser end-to-end proof.

A fresh browser upload verification was attempted but Computer Use stopped because it could not confidently determine the current browser URL. The failure on the user's actual host has not been directly observed; the module dependency failure is a source-confirmed failure path, not a confirmed hosting diagnosis. Installable ZIP rebuilt as 1.0.3.

Scope: the plugin PHP, admin JavaScript/CSS, viewer JavaScript/CSS, bundled dependencies, and ZIP contents. Other plugins and the production website were not audited or modified.

## Findings fixed

| Priority | Finding | Fix and evidence |
| --- | --- | --- |
| P2 | The library required an administrator, but the underlying custom post type used ordinary post capabilities. Authors could access creation through core paths. | All flipbook capabilities now require `manage_options`; the save handler checks it too. A real Author account could satisfy the creation capability before the change and cannot afterward. |
| P2 | Initial reader opens were not counted. The analytics code was accidentally inside the page-jump function. | Counting now runs after the current page image renders, with an in-flight guard and session deduplication. Browser opens of fresh six-page, single-page, and 157-page fixtures each produced one view. Reloading the six-page fixture left its count at one. |
| P2 | Page-turn animation clones could lose their artwork: the flip library uses `cloneNode(true)`, which does not preserve canvas bitmap content. | PDF pages now become lossless PNG images before insertion. Image clones retain their source. The cache retains at most ten page images and revokes discarded blob URLs. Desktop navigation to the final spread and a portrait page turn were checked in the browser. Mid-animation pixel comparison was not performed. |
| P2 | The admin queried every publication and eagerly opened each PDF. A large library could cause unnecessary downloads; metadata-save failures could also prevent cover rendering. | Twenty publications per page, server-side search across publications, and sequential inspection of visible rows. PDF loading and admin AJAX have timeouts. Saving page metadata is independent of cover rendering. A 22-item fixture search returned 20 rows on page one and two on page two. A damaged PDF did not prevent later covers from rendering. |
| P2 | Viewer CSS was enqueued only when the shortcode rendered, which can happen after the head in classic templates. | The small viewer stylesheet is now queued through `wp_enqueue_scripts`; PDF libraries remain conditional. The classic-template fixture lacked viewer CSS in its head before the change and includes it afterward. |
| P3 | Integer inputs were coerced with `absint`, and status values were loosely accepted. Script module attributes were edited with a position-dependent regex. | AJAX IDs and page counts now require valid integers, status accepts only `0` or `1`, and the native save path validates the attachment ID. Module tags use WordPress's HTML tag processor. Negative, array, fractional, invalid attachment, and invalid status requests were rejected; a reordered script tag retained exactly one module type attribute. |

Additional reliability changes: a failed page render no longer aborts the remaining render queue; viewer sizing responds to window/fullscreen changes; workers, observers, requests, and image URLs are cleaned up on normal page exit. The back/forward cache is preserved.

## Security review

Management AJAX checks both a nonce and administrative capabilities. Attachment selection checks PDF MIME metadata, attachment type, and edit permission. Native saves check a nonce and capabilities. Output containing titles and URLs is escaped. The counter query uses a prepared statement. No obvious backdoor, shell execution, remote code loader, or unauthenticated library-write path was identified in the reviewed plugin source.

Both PDF loaders retain `isEvalSupported: false`. The historical PDF.js advisory explains why this setting matters: [Mozilla advisory GHSA-wgrm-67xf-hhpq](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq). The bundled version is 6.4.299. `npm audit` reported zero known vulnerabilities in the installed dependency tree at audit time; this is not proof that dependencies have no undiscovered vulnerabilities.

All 203 bundled dependency files were compared with installed package files using SHA-256 and matched. License files are included. The packaged ZIP contains only the plugin, excluding QA helpers, test PDFs, node_modules, and unrelated workspace files.

## Verification

- Disposable WordPress Playground: WordPress 7.1.3, PHP 8.3.
- 40 integration assertions passed: real PDF uploads, creation/replacement, stable flipbook IDs, stale page-count rejection, malformed request rejection, CSRF checks, guest write denial, active/inactive embedding, classic-template assets, Author capability restriction, module attributes, search, and pagination.
- Browser: six-page and single-page rendering; a synthetic 157-page PDF navigated to pages 156–157, with Next disabled on the last spread; a damaged PDF displayed an error with navigation disabled.
- Browser-triggered view counts: six-page = 1, single-page = 1, 157-page = 1, damaged = 0. The six-page count remained 1 after reload. Admin previews did not add views.
- Admin browser: damaged file showed “PDF unavailable”; the following three fixture covers and page counts still loaded.
- A 390px iframe rendered a portrait page and initiated a page turn. This is a narrow viewport check, not a physical-device gesture test.
- PHP lint and JavaScript syntax checks passed.

Repeatable integration tests: `node qa/audit-check.mjs`. Vendor integrity check: `node scripts/verify-vendor.mjs`. These use disposable QA fixtures; never mount `qa/mu` on production. Earlier `qa/api-check.mjs` is retained as an initial smoke test and assumes its original fixture IDs; use the newer audit test for repeatable coverage.

## Remaining limitations

- **Public PDFs:** inactive status hides the embed; it does not revoke the Media Library file URL. This plugin is for public publications, not confidential or paid-access documents.
- **Caching:** replacing a PDF or changing status may require purging cached pages. Cached view nonces can expire and undercount. Already-open viewers require a reload.
- **Approximate views:** session storage and a 30-minute salted network-address hash reduce repeats. Shared networks can undercount; concurrent requests or deliberate requests can distort totals. This is not audited analytics.
- **Accessibility:** rendered page images have page labels but no PDF text layer. Screen readers cannot read magazine text from those images. Provide an accessible original PDF or equivalent HTML; the optional download link is available for that purpose.
- PDF links, text selection, bookmarks, and search are not implemented. Mixed page sizes fit the first page's aspect ratio. Print, audio, notes, and zoom remain omitted as requested.
- Strict CSP must allow same-origin scripts/workers and `blob:` page images. Media CDNs must permit PDF CORS requests. Modern browser APIs are required.
- PHP 7.4 and WordPress 6.5 minimum versions were not runtime-tested. Physical touch devices, password-protected PDFs, production caching/CDNs/CSP, damaged individual pages inside an otherwise valid PDF, and the user's original magazine were not verified. Long-document testing used simple synthetic pages, not a production-size image-heavy magazine.
- Several admin/viewer strings still use English directly; complete localization is not implemented.

Implementation references: `scribe-flipbook.php` (`register`, `library`, `posted_integer`, `save`, `module_tag`, `viewer_style`), `assets/viewer.mjs` (`recordView`, rendering/cache handling), and `assets/library.mjs` (timeouts and visible-row inspection).

Reference API: [WordPress HTML tag processor](https://developer.wordpress.org/reference/classes/wp_html_tag_processor/), [WordPress frontend enqueue hook](https://developer.wordpress.org/reference/hooks/wp_enqueue_scripts/).
