=== Scribe Flipbook ===
Contributors: scribedigest
Tags: pdf, flipbook, magazine
Requires at least: 6.5
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPL-2.0-or-later

Self-hosted PDF flipbooks with animated page turns, thumbnails, page navigation and fullscreen.

== Installation ==
1. Upload scribe-flipbook.zip in Plugins > Add New > Upload Plugin, then activate.
2. Open Flipbooks and click Add PDF. Upload or select a PDF, then Create flipbook.
3. Use the Active checkbox to activate or deactivate a publication. Replace PDF preserves its embed shortcode and accumulated views.
4. Click View to open the automatically created full-page reader. With pretty permalinks its address is /flipbook/your-title/.
5. Click Edit, then Edit beside Permalink below the title to change the address. Save with Update. Plain permalink sites use WordPress query URLs instead.
6. To embed the same viewer in an existing page, copy the Shortcode column into a WordPress Shortcode block. There is no Embed button.
7. Edit also lets you rename the flipbook and enable the optional PDF download link.

Example: [scribe_flipbook id="123"]

== Notes ==
PDFs stay in your WordPress Media Library. No Publuu account or external rendering service is required. JavaScript, PDF.js, its worker and page-turn library are bundled locally.
The upload size limit is set by your WordPress hosting configuration.
Original PDF URLs are public. Hiding the optional download link is not access control.
Use unlocked PDFs. Mixed-size pages fit the first page's aspect ratio. Scanned pages work.
Viewer pages are rendered as images; embedded PDF links, text selection, search and PDF bookmarks are not implemented. The original PDF remains available through the optional download link for accessible reading.
Pages render on demand into a bounded cache of ten images. Browsers may still download the full original PDF, depending on server range support. The admin library displays twenty publications per page; search covers all publications. Covers and page counts load for visible rows.
Views are approximate sessions, not unique visitors or audited analytics. Admin previews are excluded. Session storage and a 30-minute network-address limit reduce repeat counts. No raw network address is stored; rate-limit keys use a salted hash and expire after 30 minutes. View counting uses WordPress nonces, so expired cached pages can undercount.
If your site uses a page cache, purge affected pages after replacing a PDF or changing active status. Existing browser tabs must reload to receive changes. Inactive full-page reader URLs return 404; original PDF files remain public.
Print, audio, notes and zoom controls are intentionally omitted.
No data is deleted on deactivation or uninstall. Delete flipbooks and Media Library PDFs through WordPress when no longer needed.
Some hosts block module scripts, workers, or PDF requests; allow same-origin assets and blob: page images in your CSP (img-src). A media CDN must permit cross-origin PDF requests.
JavaScript modules are shipped with .js filenames to support hosts without .mjs MIME configuration. Failed reader initialization displays an error and a link to the original PDF. Reader page structure remains independent of your theme, though plugins adding global scripts/styles can still affect it.
Flipbook management requires an administrator (manage_options), including access through the direct edit screen. The viewer uses modern browser APIs; older browser compatibility is not guaranteed.

== Third-party software ==
Mozilla PDF.js (pdfjs-dist 6.4.299), Apache-2.0: https://github.com/mozilla/pdf.js
StPageFlip (page-flip 2.0.7), MIT: https://github.com/Nodlik/StPageFlip
License texts are included in assets/vendor/.
