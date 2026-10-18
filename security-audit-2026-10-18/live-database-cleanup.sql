-- Targeted Scribe Digest cleanup. NOT executed by Codex.
-- Select the correct WordPress database before importing this file.
-- Assumes the wp_ table prefix shown in the supplied backup.
-- Preserves historical security logs. Does not change Wordfence/activator settings.
-- The credential DELETE only applies when it is the user's sole application password.
-- If the verification query returns a remaining credential, review the current serialized
-- array with WordPress tooling; do not edit serialized strings with SQL REPLACE.

START TRANSACTION;

DELETE m
FROM wp_usermeta AS m
INNER JOIN wp_users AS u ON u.ID = m.user_id
WHERE u.user_login = 'scribedigest'
  AND m.meta_key = '_application_passwords'
  AND LEFT(m.meta_value, 5) = 'a:1:{'
  AND LOCATE('s:36:"a48a7121-b8e4-4fcc-a674-e5869785df80";', m.meta_value) > 0
  AND LOCATE('s:17:"Site REST general";', m.meta_value) > 0;
SELECT ROW_COUNT() AS unauthorized_application_password_rows_removed;

DELETE m
FROM wp_usermeta AS m
INNER JOIN wp_users AS u ON u.ID = m.user_id
WHERE u.user_login IN (
    'manager_867e63f47bd869fa',
    'support_86e2cdedc907fd21',
    'manager_a4ce9cbfbedef583',
    'support_ab8c2a9dfab9d1a0',
    'manager_87b252883981e390'
);
SELECT ROW_COUNT() AS suspicious_account_metadata_rows_removed;

DELETE FROM wp_users
WHERE user_login IN (
    'manager_867e63f47bd869fa',
    'support_86e2cdedc907fd21',
    'manager_a4ce9cbfbedef583',
    'support_ab8c2a9dfab9d1a0',
    'manager_87b252883981e390'
);
SELECT ROW_COUNT() AS suspicious_accounts_removed;

COMMIT;

-- Verification: both queries should return zero rows.
SELECT ID, user_login FROM wp_users
WHERE user_login IN (
    'manager_867e63f47bd869fa',
    'support_86e2cdedc907fd21',
    'manager_a4ce9cbfbedef583',
    'support_ab8c2a9dfab9d1a0',
    'manager_87b252883981e390'
);
SELECT user_id, meta_key, 'Target credential still present - further review required' AS result
FROM wp_usermeta
WHERE meta_key = '_application_passwords'
  AND LOCATE('a48a7121-b8e4-4fcc-a674-e5869785df80', meta_value) > 0;
