// Creates an in-app notification for every admin of a company.
export async function notify(q, { companyId, type, title, message, severity = 'info' }) {
  await q.query(
    `INSERT INTO notifications (company_id, type, title, message, severity) VALUES ($1, $2, $3, $4, $5)`,
    [companyId, type, title, message, severity],
  );
}
