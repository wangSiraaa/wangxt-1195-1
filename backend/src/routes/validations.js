const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { deviation_id, status, executor, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT v.*,
    u.name as executor_name, u.department as executor_dept,
    d.code as deviation_code, d.title as deviation_title, d.severity as deviation_severity
    FROM validations v
    LEFT JOIN users u ON v.executor_id = u.id
    LEFT JOIN deviations d ON v.deviation_id = d.id
    WHERE 1=1`;
  const params = [];
  if (deviation_id) { sql += ' AND v.deviation_id = ?'; params.push(deviation_id); }
  if (status) { sql += ' AND v.status = ?'; params.push(status); }
  if (executor) { sql += ' AND v.executor_id = ?'; params.push(executor); }
  const total = db.prepare(sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
  sql += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const validations = db.prepare(sql).all(...params);
  res.json({ validations, total });
});

router.get('/:id', authenticate, (req, res) => {
  const validation = db.prepare(`SELECT v.*,
    u.name as executor_name, u.department as executor_dept,
    d.code as deviation_code, d.title as deviation_title
    FROM validations v
    LEFT JOIN users u ON v.executor_id = u.id
    LEFT JOIN deviations d ON v.deviation_id = d.id
    WHERE v.id = ?`).get(req.params.id);
  if (!validation) return res.status(404).json({ error: '验证记录不存在' });
  const evidences = db.prepare(`SELECT ev.*, u.name as uploader_name FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by_id = u.id WHERE ev.validation_id = ? ORDER BY ev.created_at DESC`).all(req.params.id);
  res.json({ validation, evidences });
});

router.post('/', authenticate, requireRoles('validation', 'qa', 'admin'), (req, res) => {
  const { deviation_id, title, description, protocol, executor_id, plan_start_date, plan_end_date } = req.body;
  if (!deviation_id || !title || !description || !executor_id) {
    return res.status(400).json({ error: '偏差ID、标题、描述、执行人为必填' });
  }
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(deviation_id);
  if (!deviation) return res.status(404).json({ error: '偏差不存在' });
  if (!['measures_implementing', 'validation_pending', 'validating'].includes(deviation.status)) {
    return res.status(400).json({ error: '当前阶段不可新增验证' });
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO validations
    (id, deviation_id, title, description, protocol, executor_id, plan_start_date, plan_end_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(id, deviation_id, title, description, protocol || '', executor_id, plan_start_date || null, plan_end_date || null);
  const validation = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  res.status(201).json({ validation });
});

router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const validation = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  if (!validation) return res.status(404).json({ error: '验证记录不存在' });
  if (['passed', 'failed'].includes(validation.status) && req.user.role !== 'admin') {
    return res.status(403).json({ error: '已出结果的验证不可编辑' });
  }
  const { title, description, protocol, executor_id, plan_start_date, plan_end_date, evidence_urls } = req.body;
  db.prepare(`UPDATE validations SET title = ?, description = ?, protocol = ?, executor_id = ?, plan_start_date = ?, plan_end_date = ?, evidence_urls = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(title || validation.title, description || validation.description,
      protocol || validation.protocol, executor_id || validation.executor_id,
      plan_start_date || validation.plan_start_date, plan_end_date || validation.plan_end_date,
      evidence_urls || validation.evidence_urls, id);
  const updated = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  res.json({ validation: updated });
});

router.post('/:id/start', authenticate, requireRoles('validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const validation = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  if (!validation) return res.status(404).json({ error: '验证记录不存在' });
  if (!['pending', 'needs_retest'].includes(validation.status)) {
    return res.status(400).json({ error: '当前状态不可启动验证' });
  }
  db.prepare(`UPDATE validations SET status = 'in_progress', actual_start_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  const updated = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  res.json({ validation: updated });
});

router.post('/:id/result', authenticate, requireRoles('validation', 'qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const { status, result_summary, result_details, non_conformance } = req.body;
  const validation = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  if (!validation) return res.status(404).json({ error: '验证记录不存在' });
  if (validation.status !== 'in_progress') {
    return res.status(400).json({ error: '仅进行中的验证可提交结果' });
  }
  if (!['passed', 'failed', 'needs_retest'].includes(status)) {
    return res.status(400).json({ error: '验证结果状态无效' });
  }
  db.prepare(`UPDATE validations SET status = ?, result_summary = ?, result_details = ?, non_conformance = ?, actual_end_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, result_summary || '', result_details || '', non_conformance || '', id);
  const updated = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  res.json({ validation: updated });
});

router.delete('/:id', authenticate, requireRoles('qa', 'validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const validation = db.prepare('SELECT * FROM validations WHERE id = ?').get(id);
  if (!validation) return res.status(404).json({ error: '验证记录不存在' });
  if (['passed', 'failed'].includes(validation.status)) {
    return res.status(403).json({ error: '已出结果的验证不可删除' });
  }
  db.prepare('DELETE FROM validations WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

module.exports = router;
