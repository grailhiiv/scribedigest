-- READ ONLY: Select the LIVE WordPress database in phpMyAdmin, then run.
-- Table prefix wp_ comes from the supplied backup. No passwords/hashes selected.
-- Preserve results before deleting new accounts. user_registered can be forged.

SELECT UTC_TIMESTAMP() AS captured_utc, NOW() AS database_local_time,
       DATABASE() AS selected_database;

-- All users and their stored role/capability assignments, bypassing WP UI filters.
SELECT u.ID, u.user_login, u.user_email, u.user_registered,
       m.meta_key AS capability_key, m.meta_value AS capabilities
FROM wp_users AS u
LEFT JOIN wp_usermeta AS m
  ON m.user_id = u.ID AND RIGHT(m.meta_key, 13) = '_capabilities'
ORDER BY u.ID DESC;

-- Application-password existence and declared array size; never outputs hash values.
SELECT m.umeta_id, m.user_id, u.user_login,
       SUBSTRING_INDEX(m.meta_value, '{', 1) AS array_header,
       CASE WHEN LOCATE('Site REST general', m.meta_value) > 0
              OR LOCATE('a48a7121-b8e4-4fcc-a674-e5869785df80', m.meta_value) > 0
            THEN 'KNOWN UNAUTHORIZED CREDENTIAL MARKER PRESENT'
            ELSE 'Review current application passwords' END AS finding
FROM wp_usermeta AS m
LEFT JOIN wp_users AS u ON u.ID = m.user_id
WHERE m.meta_key = '_application_passwords'
ORDER BY m.user_id, m.umeta_id;

-- Session existence/count only; no session-token material.
SELECT m.user_id, u.user_login,
       SUBSTRING_INDEX(m.meta_value, '{', 1) AS serialized_session_count
FROM wp_usermeta AS m
LEFT JOIN wp_users AS u ON u.ID = m.user_id
WHERE m.meta_key = 'session_tokens'
ORDER BY m.user_id;

SELECT option_name, option_value
FROM wp_options
WHERE option_name IN ('users_can_register', 'default_role', 'active_plugins');
