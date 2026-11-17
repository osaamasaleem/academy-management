import { pool } from '../config/db.js';

export async function logAudit({ actorId, action, entityType, entityId = null, details = null }) {
  try {
    const query = `
      INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5);
    `;
    await pool.query(query, [actorId, action, entityType, entityId, details ? JSON.stringify(details) : null]);
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
}
