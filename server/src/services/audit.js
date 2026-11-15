// Records a security-relevant action. Never put passwords or tokens in details.
export async function audit(q, { companyId = null, actorUserId = null, action, details = {}, ip = null }) {
  await q.query(
    `INSERT INTO audit_logs (company_id, actor_user_id, action, details, ip_address)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [companyId, actorUserId, action, JSON.stringify(details), ip],
  );
}
