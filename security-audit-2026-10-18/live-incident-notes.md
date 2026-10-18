# Live incident inspection

CloudPanel site inspected with owner authorization on October 18, 2026.

- Live users: owner scribedigest ID 1; unauthorized manager_867e63f47bd869fa ID 11 and support_86e2cdedc907fd21 ID 12, both administrator. Registered timestamps shown by DB: 2026-10-18 08:04:39 and 08:04:40.
- Site REST general has reappeared on user 1; users 11 and 12 each have one application password.
- Live .user.ini points only to root wordfence-waf.php, whose visible code loads normal Wordfence bootstrap. Root index.php is the normal WordPress entry point.
- CloudPanel site cron list empty; SHOW TRIGGERS and SHOW EVENTS returned zero rows for the live WordPress database.
- Access log: repetitive POST / from 193.24.211.113, 200 with small responses, including 2026-10-18 08:17:47-08:18:32 UTC. Investigative lead; no request bodies available in this view.
- Site snapshot created at /home/scribedigest/htdocs/archive.zip, sibling to public site directory, 587.9 MB per File Manager.
- Cloudflare blocked File Manager download of wp-config.php, Ray ID a4c62b6b4a4573ef. No attempt made to disable/bypass WAF.
- Public homepage currently displays three Nice day strings with random suffixes; source not yet located.

No remediation has yet been completed.


UPDATE: Confirmed malware found and fixed; see CONFIRMED-MALWARE-AND-FIXES.md. Earlier inconclusive conclusions are superseded. Five live loaders neutralized, nginx blocks verified, two rogue accounts permanently deleted with authorization, owner application password revoked, core reinstalled.
