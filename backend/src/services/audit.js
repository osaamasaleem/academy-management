import { pool } from '../config/db.js';

export async function logAudit({ actorId, actor_id, action, entityType, entity_type, entityId = null, entity_id = null, details = null }) {
  try {
    const finalActorId = actorId !== undefined ? actorId : actor_id;
    const finalEntityType = entityType !== undefined ? entityType : entity_type;
    const finalEntityId = entityId !== null ? entityId : entity_id;

    const query = `
      INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5);
    `;
    await pool.query(query, [finalActorId, action, finalEntityType, finalEntityId, details ? JSON.stringify(details) : null]);
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
}
