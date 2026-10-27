// Shared by explicit administrator actions and automatic review.
export function audit(db, actor, action, targetType, targetId, details) {
  db.prepare('INSERT INTO admin_audit (actor_id,actor_name,action,target_type,target_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(actor.id, actor.username, action, targetType, String(targetId), JSON.stringify(details), Date.now());
}
