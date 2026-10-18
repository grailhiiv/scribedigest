> SUPERSEDED: Confirmed remote-code backdoors were subsequently found in the plugins backup and live site. Read CONFIRMED-MALWARE-AND-FIXES.md for the corrected findings and remediation.

# Scribe Digest: second source review

Reviewed October 18, 2026. Scope: the five backup files currently supplied in Downloads. Original files were not modified in this pass. No backup PHP was executed and no live website/database was accessed.

## Result

No confirmed administrator-recreation backdoor was identified in the backed-up source during this second pass. The continuing live incident is unresolved. This is not a clean bill of health or proof that every included plugin is free of exploitable vulnerabilities.

## Important change in the supplied database

The current Downloads db.gz is byte-identical to the cleaned gzip produced earlier (SHA-256 cd26568fc238571c45734ac16a2f32bb9064d957a09458d1ee889880b5ada6e8). Its SQL is also identical to that cleaned output. The four ZIPs match their earlier audit hashes.

The current database contains only user ID 1, scribedigest. None of the five suspicious usernames has a current user row. There are no _application_passwords rows in the supplied database: the Site REST general credential is already removed. Compared with the first database reviewed, the only changed table is wp_usermeta, with that one row removed.

Historical Wordfence login/issue records still describe the suspicious users. Historical logs do not mean the accounts still exist in this dump. This file is a modified October 18 04:09 UTC backup, not a new capture of the site's latest injected accounts.

## Additional source checks completed

1. Re-scanned PHP source for user creation, password changes, role/capability changes, authentication-cookie creation, direct user-table access, public AJAX actions, and dynamic function invocation. The normalization pass also checked common hex/octal string escapes and adjacent quoted-string concatenation. This is heuristic normalization, not exhaustive PHP interpretation.
2. Traced the explicit wp_insert_user call in plugins/updraftplus/central/modules/users.php:450. Its add_user method checks create_users/is_super_admin at lines 422-425. The remote listener can select the paired user context. The saved updraft_central_localkeys option exists but its value is empty, providing no saved pairing key in this dump. No evidence connects this normal user-management feature to the injected accounts.
3. Inspected UpdraftClone's automatic-login code. Its instantiation requires UPDRAFTPLUS_THIS_IS_CLONE; handling also requires an auto-login key and uc_allow_auto_login user metadata. No uc_allow_auto_login metadata was found. The omitted wp-config.php means clone-related constants cannot be verified from this backup.
4. Inspected scanner AJAX registration and request guards. The reviewed scan/file/install action classes require the plugin's capability and a scan nonce. These files did not reveal an account-creation payload. This limited tracing does not certify all scanner functionality as vulnerability-free.
5. Parsed stored WordPress roles as serialized data, without PHP unserialize execution. Subscriber, contributor, author, and editor do not have the checked administrative permissions create_users, promote_users, edit_users, manage_options, install_plugins, or edit_plugins. The standard editor unfiltered_html permission is present. Public registration remains disabled and default_role is subscriber.
6. Parsed cron as serialized data and inspected callback names. Some hooks refer to WordPress core or previously installed plugins absent from the supplied plugin archive. A cron name alone is not executable PHP and does not prove persistence. No identified cron payload creates the suspicious users.
7. Decoded 50 long base64-looking candidates in database option values, including gzip decoding where the header matched. No checked PHP-loader/account-creation/known-attacker markers were found in those decoded values. This does not exhaust all possible encodings or all database content.
8. Searched all archive entries outside the original text classification for PHP opening tags. Remaining matches were translation strings and documentation examples; no additional disguised executable PHP payload was identified by this check.
9. Rechecked exact suspicious usernames and the unauthorized application's name/UUID in source. One username occurs in wflogs/config-synced.php inside a stored failed-login/block description. It is data about an attack, not code creating that account.

## Previous file comparisons still apply

The unchanged ZIPs retain the previously established exact official-release matches for Wordfence, WPForms Lite, Rank Math, AddToAny, TinyPNG, Disable Media Sizes, and CLP Varnish Cache. File Upload Types differs only in readme.txt among the compared files. Kadence theme functions.php differs from the official 1.5.2 distribution only in whitespace.

The reviewed Perfmatters upload snippets contain CSS/configuration. The scanner's flagged anonymousfox string is inside a Wordfence firewall comparison. These findings do not explain account recreation.

ACF Pro and Perfmatters still contain the previously documented license-response modifications. No account-creation payload was identified in those modifications. Equivalent premium/custom vendor packages were not available for a full authenticity comparison. The activator was left unchanged as requested.

## Exact archive boundary

The others ZIP contains only:

- wp-content/index.php when restored (stored as index.php; its entire content is the usual Silence is golden stub).
- wp-content/wflogs/ firewall configuration, rule, and data files.

It does not contain the site's root index.php. No supplied archive contains .user.ini, wordfence-waf.php, wp-config.php, wp-admin, or wp-includes. The root files shown in the user's File Manager screenshots therefore cannot be inspected through these ZIPs.

## What remains unresolved

A source that recreates users could be malicious code outside the backup, an exploitable path in installed software, a compromised session/integration, direct database access, or hosting-level access. This review does not establish which one applies. Removing the visible user rows does not identify the writer.

The next evidence that can distinguish these possibilities is a current capture of the injected user rows plus a current full-site filesystem archive including hidden/root files and request logs around the recreation time. A repeated scan of the same older wp-content backup cannot demonstrate the current live writer.

## Supporting local artifacts

- second-pass-patterns.json: broad search hits, including expected code and false positives. Not a malware verdict list.
- second-pass-input-verification.json: ZIP hashes against the original audit and identification of the changed database input.
- second-pass-summary.json: machine-readable second-pass conclusions.

No live cleanup or patch was performed. No finding here establishes eradication.
