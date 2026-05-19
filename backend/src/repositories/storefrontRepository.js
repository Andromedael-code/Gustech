function safeJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function getStorefrontSetting(connection, key) {
  const [rows] = await connection.execute(
    `SELECT settings_key AS settingsKey, settings_json AS settingsJson, updated_at AS updatedAt
     FROM storefront_settings
     WHERE settings_key = ?
     LIMIT 1`,
    [key]
  );

  if (!rows[0]) return null;

  return {
    settingsKey: rows[0].settingsKey,
    settingsJson: safeJsonObject(rows[0].settingsJson),
    updatedAt: rows[0].updatedAt
  };
}

export async function upsertStorefrontSetting(connection, key, value) {
  await connection.execute(
    `INSERT INTO storefront_settings (settings_key, settings_json, updated_at)
     VALUES (?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       settings_json = VALUES(settings_json),
       updated_at = UTC_TIMESTAMP()`,
    [key, JSON.stringify(value || {})]
  );
}
