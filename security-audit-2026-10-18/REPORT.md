> SUPERSEDED: Confirmed remote-code backdoors were subsequently found in the plugins backup and live site. Read CONFIRMED-MALWARE-AND-FIXES.md for the corrected findings and remediation.

# Scribe Digest backup security inspection

Date: October 18, 2026. Times below use Asia/Taipei (UTC+08:00).

## Verdict

The supplied backup contains confirmed evidence of repeated suspicious account access, an administrator application password that the owner confirms they did not create, and code that deliberately excludes itself from Wordfence scanning. Do not restore this backup wholesale into a public site.

**The PHP or other entry point responsible for repeatedly creating administrator accounts was not identified in these files.** The application password is a confirmed unauthorized access mechanism; its creation mechanism and actual use are not established. Its last-used fields are empty. Removing it alone does not establish that the site is clean.

The original five backups were left unchanged. Nothing from the backups was executed, installed, or imported into WordPress/MySQL. No live-site remediation was performed.

## 1. Critical: unauthorized administrator application password

Evidence: database table wp_usermeta, umeta_id 153, user_id 1, meta_key _application_passwords.

- Name: Site REST general.
- UUID: a48a7121-b8e4-4fcc-a674-e5869785df80.
- Created: October 18, 2026, 11:36:40 AM Taiwan time.
- Owner explicitly confirmed during this review that they did not create it.
- last_used and last_ip: NULL. No recorded use is not proof of non-use, particularly on a compromised system.

Application passwords authenticate external clients with the associated user's permissions. Here the associated user, scribedigest (ID 1), has the administrator role. The database stores the verifier/hash; restoring that row reinstates the credential if application-password authentication is available and the holder still knows the original secret. Changing only the ordinary login password is insufficient as a cleanup strategy: revoke application passwords explicitly.

The same administrator also has 82 stored session records, all unexpired at the backup timestamp. A restored session record can preserve a usable session if its cookie and WordPress authentication keys/salts also remain valid. These records do not establish 82 attackers or 82 distinct people.

**Action:** revoke Site REST general in Users > Profile > Application Passwords; review/revoke other application passwords, destroy existing sessions, reset administrator credentials, and rotate WordPress authentication keys/salts. Recheck after any database restore. These changes have not been executed.

## 2. High: Wordfence scan exclusion and license manipulation

Evidence: plugins ZIP, plugins/wordfence-activator/main.php.

- Lines 17–47: directly writes to the Wordfence configuration table. Lines 24–25 specify scan_exclude and /wordfence-activator/*.
- The code appends the exclusion repeatedly when the setting already exists.
- Lines 53 onward overwrite Wordfence API/license state, including isPaid and renewal settings.
- Database wp_options.active_plugins confirms this plugin was active.
- Database wp_wfconfig.scan_exclude contains the exclusion 2,042 times (decoded from the SQL hexadecimal value). This confirms the behavior affected the stored configuration; the pattern's precise matching behavior was not runtime-tested.

This is deliberate scanner-exclusion behavior and an untrustworthy security modification. **No administrator-creation routine or remote-command loader was found in this activator's reviewed files.** It is not proven to be the creator of the recurring accounts.

**Action:** exclude this activator from the rebuilt site, install Wordfence from its official source, and remove the persisted scan exclusion. Deactivating the plugin alone leaves the database setting behind. Do not rely on the modified premium/license display as assurance of protection.

## 3. High: repeated account identities and successful logins

The database's Wordfence records support the reported recurrence, beyond merely showing failed password guessing:

| Username | Recorded successful logins | Nonzero user IDs seen |
|---|---:|---|
| manager_867e63f47bd869fa | 32 | 23, 27, 31, 37, 41 |
| support_86e2cdedc907fd21 | 32 | 24, 28, 36, 38, 42 |
| manager_a4ce9cbfbedef583 | 12 | 25, 29, 33, 39 |
| support_ab8c2a9dfab9d1a0 | 12 | 26, 30, 34, 40 |
| manager_87b252883981e390 | 1 | 35 |

The first two identities appear in wp_wfissues IDs 41 and 42 as administrator accounts created outside WordPress's normal creation tracking. Those findings identify user IDs 37 and 38. Later login records recognize the same names under IDs 41 and 42. Changing IDs are consistent with deletion and recreation; the logs do not identify which script, request, or actor created them.

The recorded activity spans October 17–18. The first manager login was October 17 at 2:15:46 PM Taiwan time. The latest recognized attempts for the first manager/support pair were October 18 at 11:36:47 and 11:36:49 AM, seconds after the unauthorized application password's creation. Timing proximity is an investigative lead, not proof of causation.

At backup time wp_users contains only scribedigest, and its next AUTO_INCREMENT is 43. The suspicious accounts themselves are absent from the backed-up users table. Restoring this table does not directly restore those account rows; another surviving credential, entry point, or exploit could recreate them.

Recorded client IPs include proxy/CDN addresses. They should not be treated as attacker-origin addresses without trusted forwarding-header and server-log correlation.

## 4. Important missing evidence: site-root .user.ini

Wordfence finding 39 reports a publicly accessible file at /home/scribedigest/htdocs/scribedigest.com/.user.ini. That file is absent from all supplied ZIPs.

A .user.ini can be legitimate PHP configuration, including a Wordfence firewall auto_prepend_file directive. It can also point PHP at malicious code. **This report does not classify the missing file as malware.** Its contents, any prepend/append target, and applicable parent-directory PHP configuration require inspection.

The supplied archives contain wp-content components. They do not include the WordPress root, wp-admin, wp-includes, wp-config.php, root wordfence-waf.php, server/PHP configuration, OS scheduled tasks, or SSH credentials. A fresh WordPress installation in an existing directory may leave unrelated root files or external persistence in place.

The stored backup header identifies nginx. Apache .htaccess protection inside uploads is not sufficient evidence of protection under nginx; the actual nginx/PHP execution rules must be checked.

## 5. Altered commercial plugins: provenance concerns, not a proven account-creation payload

- plugins/perfmatters/perfmatters.php, lines 21–53: inserts a fixed license key, intercepts license HTTP requests, fabricates a valid/lifetime response, and writes license-status options.
- plugins/advanced-custom-fields-pro/acf.php, lines 924–941: intercepts vendor HTTP requests, fabricates license/update responses, and writes license options.

These changes establish that these copies contain license-response modifications. They do not, by themselves, prove account injection or remote execution. Replace them with trusted vendor releases during recovery. The custom bundled Kadence Blocks package, commercial UpdraftPlus copy, and local scanner were not authenticated against equivalent vendor distributions. Their absence of identified malware in this static review is not a clean bill of health.

Wordfence's database also flags Kadence Blocks Pro as vulnerable. Because this package is customized and retains a version label, the stored alert alone cannot establish whether a specific vulnerable code path remains or whether exploitation occurred. The linked advisory could not be independently retrieved during this review. Validate the relevant code or use an appropriate supported vendor release.

## 6. Checks that narrow the search

Official WordPress release checksums were fetched and compared locally; the backup contents were not uploaded to a scanner.

- Exact full-package matches: Wordfence 9.0.2, WPForms Lite 2.0.2.2, Rank Math 1.0.280, AddToAny 1.8.18, TinyPNG 3.8.1, Disable Media Sizes 2.6, and CLP Varnish Cache 1.1.1.
- File Upload Types 1.5.0: all 38 other files match; readme.txt differs. No extra/missing package files. The fetched official readme also has different contributor/tested-version metadata. A readme mismatch alone is not an executable backdoor.
- Kadence theme 1.5.2 compared with the official ZIP: 551 files match exactly; functions.php differs only in whitespace; no extra/missing files. Wordfence's modified-theme finding is not evidence of malware in this particular file.
- The three PHP-named files in uploads are Perfmatters CSS snippet/cache files. Their reviewed contents contain configuration/CSS, rather than an identified account-creation payload.
- Stored snippets include active custom CSS and inactive Publuu viewer JavaScript. No malicious PHP snippet was identified.
- Registration is disabled and the default role is subscriber. No obvious public-registration-to-administrator setting was found.
- No conventional PHP web shell/admin-creation loader was identified by the source scans and contextual review. Search hits in security signatures, logs, normal vendor libraries, and validators were distinguished from executable malicious logic.

An official checksum match establishes correspondence to that release, not freedom from vulnerabilities. Media checks included raw marker searches; this was not an exhaustive steganographic analysis or dynamic execution of every asset.

## Recovery priorities

1. Restrict public access while investigating. Preserve host access/error logs and a full filesystem snapshot before cleanup.
2. Revoke the unauthorized application password and existing sessions; reset WordPress, hosting/CloudPanel, SFTP/SSH, database, and relevant integration credentials. Review unfamiliar SSH keys and scheduled tasks. Enable administrator MFA.
3. Build in an empty, isolated site directory using trusted WordPress, plugin, and theme distributions. Omit wordfence-activator; replace altered commercial packages.
4. Migrate reviewed content/media and required settings selectively. Do not wholesale restore old executable plugin/theme folders, user credentials/sessions, Wordfence exclusions, or unreviewed scheduled tasks. Preserve needed custom design work through a separate review.
5. Inspect the missing root/PHP/server files and establish nginx rules that prevent direct execution of untrusted uploads without breaking legitimate plugin behavior.
6. Correlate logs around account recreation and October 18 11:36:40 AM Taiwan time. Monitor user IDs, application passwords, file changes, and admin-role changes after restoration before returning to normal access.

## Evidence needed to identify the creator

A full site filesystem archive, including hidden files and the WordPress root, is the next useful artifact: especially .user.ini, any auto_prepend_file/auto_append_file targets, wp-config.php, wordfence-waf.php, wp-admin, wp-includes, mu-plugins, and drop-ins. Also obtain nginx access/error logs, PHP logs, and hosting/OS cron entries covering October 17–18. Redact secrets from configuration files before sharing while retaining paths and executable/configuration directives. Do not execute suspicious PHP to inspect it.

## Method and artifacts

Inspected 15,901 ZIP entries; scanned 11,166 text/code files; decoded the 40,827,145-byte SQL dump as data and parsed 49,693 inserted rows across 54 populated tables (91 table schemas). UpdraftPlus row estimates differ from inserted counts in some actively changing tables; estimates are not treated as exact counts. Static review cannot prove eradication or establish the initial entry point without missing host evidence.

- archive-inventory.json: archive SHA-256 hashes and entry inventory.
- findings-evidence.json: structured findings, account history, credential metadata without the password hash, and package comparison results.
- official-checksum-comparison.json and theme-comparison.json: comparison details and source URLs.
- source-excerpts/: inert .txt excerpts with line numbers; visible license values redacted.
- pattern-hits.json: raw heuristic search hits, including false positives; not a malware verdict list.

## References

- WordPress application passwords: https://developer.wordpress.org/advanced-administration/security/application-passwords/
- WordPress hacked-site recovery: https://wordpress.org/documentation/article/faq-my-site-was-hacked/
- WordPress hardening: https://developer.wordpress.org/advanced-administration/security/hardening/
- Official Kadence release comparison: https://downloads.wordpress.org/theme/kadence.1.5.2.zip

All case-specific findings above come from the supplied backup and the owner's confirmation. Recommendations do not imply live-site changes were made.
