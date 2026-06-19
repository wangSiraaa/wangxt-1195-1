const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();

function checkOverdueMeasures() {
  const now = new Date().toISOString().split('T')[0];
  const overdue = db.prepare(`UPDATE corrective_measures SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
    WHERE deadline < ? AND status IN ('pending', 'in_progress')`).run(now);
  if (overdue.changes > 0) {
    const stmt = db.prepare(`SELECT m.id, m.deviation_id, m.description, m.deadline, d.code, d.title
      FROM corrective_measures m JOIN deviations d ON m.deviation_id = d.id
      WHERE m.status = 'overdue' AND m.id IN (
        SELECT id FROM corrective_measures WHERE deadline < ? AND status = 'overdue'
      )`);
    const list = stmt.all(now);
    for (const m of list) {
      const existingEsc = db.prepare(`SELECT COUNT(*) as cnt FROM escalations WHERE measure_id = ?`).get(m.id).cnt;
      if (existingEsc === 0) {
        const qaUser = db.prepare(`SELECT qa_evaluator_id FROM deviations WHERE id = ?`).get(m.deviation_id);
        if (qaUser && qaUser.qa_evaluator_id) {
          db.prepare(`INSERT INTO escalations (id, deviation_id, measure_id, level, reason, from_user_id, to_user_id, status)
            VALUES (?, ?, ?, 2, ?, ?, ?, 'pending')`).run(
            uuidv4(), m.deviation_id, m.id,
            `措施执行超期：截止日期${m.deadline}，当前状态超期。措施：${m.description.substring(0, 100)}`,
            'system', qaUser.qa_evaluator_id
          );
        }
      }
    }
  }
  return overdue.changes;
}

router.get('/check-overdue', authenticate, (req, res) => {
  const count = checkOverdueMeasures();
  res.json({ overdueUpdated: count });
});

router.get('/', authenticate, (req, res) => {
  checkOverdueMeasures();
  const { deviation_id, status, responsible, type, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT m.*,
    u.name as responsible_name, u.department as responsible_dept,
    v.name as verified_by_name,
    d.code as deviation_code, d.title as deviation_title, d.severity as deviation_severity
    FROM corrective_measures m
    LEFT JOIN users u ON m.responsible_id = u.id
    LEFT JOIN users v ON m.verified_by_id = v.id
    LEFT JOIN deviations d ON m.deviation_id = d.id
    WHERE 1=1`;
  const params = [];
  if (deviation_id) { sql += ' AND m.deviation_id = ?'; params.push(deviation_id); }
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  if (responsible) { sql += ' AND m.responsible_id = ?'; params.push(responsible); }
  if (type) { sql += ' AND m.type = ?'; params.push(type); }
  const total = db.prepare(sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
  sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const measures = db.prepare(sql).all(...params);
  res.json({ measures, total });
});

router.get('/:id', authenticate, (req, res) => {
  const measure = db.prepare(`SELECT m.*,
    u.name as responsible_name, u.department as responsible_dept,
    v.name as verified_by_name,
    d.code as deviation_code, d.title as deviation_title
    FROM corrective_measures m
    LEFT JOIN users u ON m.responsible_id = u.id
    LEFT JOIN users v ON m.verified_by_id = v.id
    LEFT JOIN deviations d ON m.deviation_id = d.id
    WHERE m.id = ?`).get(req.params.id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  const evidences = db.prepare(`SELECT ev.*, u.name as uploader_name FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by_id = u.id WHERE ev.measure_id = ? ORDER BY ev.created_at DESC`).all(req.params.id);
  res.json({ measure, evidences });
});

router.post('/', authenticate, (req, res) => {
  const { deviation_id, type, description, responsible_id, deadline } = req.body;
  if (!deviation_id || !type || !description || !responsible_id || !deadline) {
    return res.status(400).json({ error: '偏差ID、类型、描述、负责人、截止日期为必填' });
  }
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(deviation_id);
  if (!deviation) return res.status(404).json({ error: '偏差不存在' });
  if (!['measures_pending', 'measures_implementing', 'root_cause_analysis'].includes(deviation.status)) {
    return res.status(400).json({ error: '当前状态不可新增措施' });
  }
  if (!['correction', 'preventive'].includes(type)) {
    return res.status(400).json({ error: '措施类型无效' });
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO corrective_measures
    (id, deviation_id, type, description, responsible_id, deadline, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
    .run(id, deviation_id, type, description, responsible_id, deadline);
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  res.status(201).json({ measure });
});

router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  if (['completed', 'verified'].includes(measure.status) && req.user.role !== 'admin') {
    return res.status(403).json({ error: '已完成/已验证措施不可编辑' });
  }
  const { description, responsible_id, deadline, evidence_urls } = req.body;
  db.prepare(`UPDATE corrective_measures SET description = ?, responsible_id = ?, deadline = ?, evidence_urls = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(description || measure.description, responsible_id || measure.responsible_id,
      deadline || measure.deadline, evidence_urls || measure.evidence_urls, id);
  const updated = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  res.json({ measure: updated });
});

router.post('/:id/start', authenticate, (req, res) => {
  const { id } = req.params;
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  if (measure.responsible_id !== req.user.id && !['admin', 'qa'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅负责人可启动措施' });
  }
  if (!['pending', 'overdue'].includes(measure.status)) {
    return res.status(400).json({ error: '当前状态不可启动' });
  }
  db.prepare(`UPDATE corrective_measures SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  const updated = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  res.json({ measure: updated });
});

router.post('/:id/complete', authenticate, (req, res) => {
  const { id } = req.params;
  const { completion_note } = req.body;
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  if (measure.responsible_id !== req.user.id && !['admin', 'qa'].includes(req.user.role)) {
    return res.status(403).json({ error: '仅负责人可完成措施' });
  }
  if (!['in_progress', 'overdue'].includes(measure.status)) {
    return res.status(400).json({ error: '当前状态不可完成' });
  }
  db.prepare(`UPDATE corrective_measures SET status = 'completed', actual_completion_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  const updated = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  res.json({ measure: updated });
});

router.post('/:id/verify', authenticate, requireRoles('qa', 'validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const { verification_result, passed } = req.body;
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  if (measure.status !== 'completed') {
    return res.status(400).json({ error: '仅已完成措施可验证' });
  }
  if (passed) {
    db.prepare(`UPDATE corrective_measures SET status = 'verified', verification_result = ?, verification_date = CURRENT_TIMESTAMP, verified_by_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(verification_result || '', req.user.id, id);
  } else {
    db.prepare(`UPDATE corrective_measures SET status = 'in_progress', verification_result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(verification_result || '验证未通过，需重新执行', id);
  }
  const updated = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  res.json({ measure: updated });
});

router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const measure = db.prepare('SELECT * FROM corrective_measures WHERE id = ?').get(id);
  if (!measure) return res.status(404).json({ error: '措施不存在' });
  if (['completed', 'verified'].includes(measure.status)) {
    return res.status(403).json({ error: '已完成措施不可删除' });
  }
  db.prepare('DELETE FROM corrective_measures WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

module.exports = router;
