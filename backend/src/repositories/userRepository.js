import { isSqlite } from '../config/mysql.js';

export async function upsertUserProfile(connection, uid, profile) {
  if (isSqlite()) {
    await connection.execute(
      `INSERT INTO users (id, email, username, full_name, cpf, phone, phone_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         username = excluded.username,
         full_name = excluded.full_name,
         cpf = excluded.cpf,
         phone = excluded.phone,
         phone_verified_at = COALESCE(excluded.phone_verified_at, users.phone_verified_at),
         updated_at = CURRENT_TIMESTAMP`,
      [uid, profile.email || '', profile.username, profile.name, profile.cpf, profile.phone, profile.phoneVerifiedAt || null]
    );
    return;
  }

  await connection.execute(
    `INSERT INTO users (id, email, username, full_name, cpf, phone, phone_verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       username = VALUES(username),
       full_name = VALUES(full_name),
       cpf = VALUES(cpf),
       phone = VALUES(phone),
       phone_verified_at = COALESCE(VALUES(phone_verified_at), phone_verified_at),
       updated_at = UTC_TIMESTAMP()`,
    [uid, profile.email || '', profile.username, profile.name, profile.cpf, profile.phone, profile.phoneVerifiedAt || null]
  );
}

export async function getUserProfile(connection, uid) {
  const [rows] = await connection.execute(
    `SELECT id, email, username, full_name AS name, cpf, phone, phone_verified_at AS phoneVerifiedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  return rows[0] || null;
}

export async function replaceAddresses(connection, uid, addresses) {
  await connection.execute('DELETE FROM user_addresses WHERE user_id = ?', [uid]);
  for (let index = 0; index < addresses.length; index += 1) {
    const address = addresses[index];
    await connection.execute(
      `INSERT INTO user_addresses
      (id, user_id, label, street, number, neighborhood, zip, complement, is_default, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [address.id, uid, address.label, address.street, address.number, address.neighborhood, address.zip, address.complement || '', address.isDefault ? 1 : 0, index]
    );
  }
}

export async function getAddresses(connection, uid) {
  const [rows] = await connection.execute(
    `SELECT id, label, street, number, neighborhood, zip, complement, is_default AS isDefault
     FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, sort_order ASC, created_at ASC`,
    [uid]
  );
  return rows.map((row) => ({ ...row, isDefault: Boolean(row.isDefault) }));
}

export async function listAdmins(connection) {
  const [rows] = await connection.execute('SELECT id, uid, email, role, created_by AS createdBy, created_at AS createdAt FROM admins ORDER BY email ASC LIMIT 200');
  return rows;
}

export async function upsertAdmin(connection, adminRecord) {
  if (isSqlite()) {
    await connection.execute(
      `INSERT INTO admins (id, uid, email, role, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON CONFLICT(id) DO UPDATE SET
         uid = excluded.uid,
         role = excluded.role,
         updated_at = CURRENT_TIMESTAMP`,
      [adminRecord.email, adminRecord.uid, adminRecord.email, adminRecord.role, adminRecord.createdBy]
    );
    return;
  }

  await connection.execute(
    `INSERT INTO admins (id, uid, email, role, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE uid = VALUES(uid), role = VALUES(role), updated_at = UTC_TIMESTAMP()`,
    [adminRecord.email, adminRecord.uid, adminRecord.email, adminRecord.role, adminRecord.createdBy]
  );
}
