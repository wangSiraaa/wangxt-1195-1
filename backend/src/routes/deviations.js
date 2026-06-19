const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();

const STATUS_FLOW = {
  draft: ['submitted'],
  submitted: ['root_cause_pending', 'root_cause_analysis'],
  root_cause_pending: ['root_cause_analysis'],
  root_cause_analysis: ['measures_pending'],
  measures_pending: ['measures_implementing'],
  measures_implementing: ['validation_pending'],
  validation_pending: ['validating'],
  validating: ['closed'],
  closed: [],
  cancelled: []
};

function generateDeviationCode() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as cnt FROM deviations WHERE strftime('%Y%m', created_at) = ?")
    .get(`${year}${month}`).cnt + 1;
  return `DEV-${year}${month}-${String(count).padStart(4, '0')}`;
}

function addApproval(deviationId, stage, approverId, action, comment) {
  db.prepare(`INSERT INTO approvals (id, deviation_id, stage, approver_id, action, comment) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), deviationId, stage, approverId, action, comment);
}

router.get('/', authenticate, (req, res) => {
  const { status, severity, reporter, qa_evaluator, verification_engineer, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT d.*,
    r.name as reporter_name, r.department as reporter_dept,
    q.name as qa_evaluator_name,
    v.name as verification_engineer_name,
    a.name as root_cause_analyst_name,
    c.name as closed_by_name
    FROM deviations d
    LEFT JOIN users r ON d.reporter_id = r.id
    LEFT JOIN users q ON d.qa_evaluator_id = q.id
    LEFT JOIN users v ON d.verification_engineer_id = v.id
    LEFT JOIN users a ON d.root_cause_analyst_id = a.id
    LEFT JOIN users c ON d.closed_by_id = c.id
    WHERE 1=1`;
  const params = [];
  if (status) {
    sql += ' AND d.status = ?';
    params.push(status);
  }
  if (severity) {
    sql += ' AND d.severity = ?';
    params.push(severity);
  }
  if (reporter) {
    sql += ' AND d.reporter_id = ?';
    params.push(reporter);
  }
  if (qa_evaluator) {
    sql += ' AND d.qa_evaluator_id = ?';
    params.push(qa_evaluator);
  }
  if (verification_engineer) {
    sql += ' AND d.verification_engineer_id = ?';
    params.push(verification_engineer);
  }
  if (keyword) {
    sql += ' AND (d.code LIKE ? OR d.title LIKE ? OR d.description LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  const total = db.prepare(sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
  sql += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const deviations = db.prepare(sql).all(...params);
  res.json({ deviations, total, page: Number(page), pageSize: Number(pageSize) });
});

router.get('/stats', authenticate, (req, res) => {
  const stats = {};
  stats.byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM deviations GROUP BY status`).all();
  stats.bySeverity = db.prepare(`SELECT severity, COUNT(*) as count FROM deviations GROUP BY severity`).all();
  stats.total = db.prepare(`SELECT COUNT(*) as count FROM deviations`).get().count;
  stats.overdueMeasures = db.prepare(`SELECT COUNT(*) as count FROM corrective_measures WHERE status = 'overdue' OR (deadline < date('now') AND status NOT IN ('completed', 'verified'))`).get().count;
  stats.pendingValidation = db.prepare(`SELECT COUNT(*) as count FROM validations WHERE status IN ('pending', 'in_progress')`).get().count;
  res.json({ stats });
});

router.get('/:id', authenticate, (req, res) => {
  const deviation = db.prepare(`SELECT d.*,
    r.name as reporter_name, r.department as reporter_dept,
    q.name as qa_evaluator_name,
    v.name as verification_engineer_name,
    a.name as root_cause_analyst_name,
    c.name as closed_by_name
    FROM deviations d
    LEFT JOIN users r ON d.reporter_id = r.id
    LEFT JOIN users q ON d.qa_evaluator_id = q.id
    LEFT JOIN users v ON d.verification_engineer_id = v.id
    LEFT JOIN users a ON d.root_cause_analyst_id = a.id
    LEFT JOIN users c ON d.closed_by_id = c.id
    WHERE d.id = ?`).get(req.params.id);
  if (!deviation) {
    return res.status(404).json({ error: '偏差记录不存在' });
  }
  const approvals = db.prepare(`SELECT a.*, u.name as approver_name, u.role as approver_role
    FROM approvals a LEFT JOIN users u ON a.approver_id = u.id
    WHERE a.deviation_id = ? ORDER BY a.created_at DESC`).all(req.params.id);
  const measures = db.prepare(`SELECT m.*, u.name as responsible_name, v.name as verified_by_name
    FROM corrective_measures m
    LEFT JOIN users u ON m.responsible_id = u.id
    LEFT JOIN users v ON m.verified_by_id = v.id
    WHERE m.deviation_id = ? ORDER BY m.created_at`).all(req.params.id);
  const validations = db.prepare(`SELECT v.*, u.name as executor_name
    FROM validations v LEFT JOIN users u ON v.executor_id = u.id
    WHERE v.deviation_id = ? ORDER BY v.created_at`).all(req.params.id);
  const escalations = db.prepare(`SELECT e.*, fu.name as from_user_name, tu.name as to_user_name, m.description as measure_desc
    FROM escalations e
    LEFT JOIN users fu ON e.from_user_id = fu.id
    LEFT JOIN users tu ON e.to_user_id = tu.id
    LEFT JOIN corrective_measures m ON e.measure_id = m.id
    WHERE e.deviation_id = ? ORDER BY e.created_at DESC`).all(req.params.id);
  const evidences = db.prepare(`SELECT ev.*, u.name as uploader_name
    FROM evidences ev LEFT JOIN users u ON ev.uploaded_by_id = u.id
    WHERE ev.deviation_id = ? ORDER BY ev.created_at DESC`).all(req.params.id);
  res.json({ deviation, approvals, measures, validations, escalations, evidences });
});

router.post('/', authenticate, requireRoles('production', 'qa', 'validation', 'admin'), (req, res) => {
  const { title, description, department, product, batch_no, occurrence_date } = req.body;
  if (!title || !description || !occurrence_date) {
    return res.status(400).json({ error: '标题、描述和发生日期为必填项' });
  }
  const id = uuidv4();
  const code = generateDeviationCode();
  const result = db.prepare(`INSERT INTO deviations
    (id, code, title, description, department, product, batch_no, occurrence_date, reporter_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
    .run(id, code, title, description, department || req.user.department, product || '', batch_no || '', occurrence_date, req.user.id);
  addApproval(id, 'creation', req.user.id, 'submit', '创建偏差记录');
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.status(201).json({ deviation });
});

router.put('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) {
    return res.status(404).json({ error: '偏差记录不存在' });
  }
  if (deviation.status !== 'draft' && deviation.reporter_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅草稿状态可编辑' });
  }
  const { title, description, department, product, batch_no, occurrence_date } = req.body;
  db.prepare(`UPDATE deviations SET title = ?, description = ?, department = ?, product = ?, batch_no = ?, occurrence_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(title || deviation.title, description || deviation.description,
      department || deviation.department, product || deviation.product,
      batch_no || deviation.batch_no, occurrence_date || deviation.occurrence_date, id);
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/submit', authenticate, (req, res) => {
  const { id } = req.params;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (deviation.status !== 'draft') return res.status(400).json({ error: '仅草稿状态可提交' });
  if (deviation.reporter_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅提交人可提交' });
  }
  db.prepare(`UPDATE deviations SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  addApproval(id, 'submit', req.user.id, 'submit', req.body.comment || '提交偏差，等待QA评审');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/qa-evaluate', authenticate, requireRoles('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const { severity, qa_evaluation, verification_engineer_id } = req.body;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (!['submitted'].includes(deviation.status)) {
    return res.status(400).json({ error: '当前状态不允许QA评审' });
  }
  if (!severity || !['minor', 'major', 'critical'].includes(severity)) {
    return res.status(400).json({ error: '严重程度选择无效' });
  }
  const nextStatus = severity === 'critical' ? 'root_cause_analysis' : 'root_cause_pending';
  db.prepare(`UPDATE deviations SET
    severity = ?, qa_evaluation = ?, qa_evaluator_id = ?, qa_evaluation_date = CURRENT_TIMESTAMP,
    verification_engineer_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .run(severity, qa_evaluation || '', req.user.id, verification_engineer_id || null, nextStatus, id);
  addApproval(id, 'qa_evaluate', req.user.id, 'approve', `QA评审：${severity}。${qa_evaluation || ''}`);
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/save-root-cause', authenticate, requireRoles('qa', 'validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const { root_cause } = req.body;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (!['root_cause_pending', 'root_cause_analysis'].includes(deviation.status)) {
    return res.status(400).json({ error: '当前状态不可编辑根因' });
  }
  if (!root_cause || !root_cause.trim()) {
    return res.status(400).json({ error: '根因分析内容不能为空' });
  }
  db.prepare(`UPDATE deviations SET root_cause = ?, root_cause_analysis_date = CURRENT_TIMESTAMP, root_cause_analyst_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(root_cause, req.user.id, id);
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/approve-root-cause', authenticate, requireRoles('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const { approved, comment } = req.body;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (!['root_cause_analysis', 'root_cause_pending'].includes(deviation.status)) {
    return res.status(400).json({ error: '当前状态不可审核根因' });
  }
  if (deviation.severity === 'critical' && (!deviation.root_cause || !deviation.root_cause.trim())) {
    return res.status(400).json({ error: '重大偏差必须完成根因分析才能进入措施阶段' });
  }
  if (approved) {
    db.prepare(`UPDATE deviations SET status = 'measures_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    addApproval(id, 'root_cause_approve', req.user.id, 'approve', comment || '根因分析审核通过，进入措施制定阶段');
  } else {
    addApproval(id, 'root_cause_reject', req.user.id, 'reject', comment || '根因分析需补充完善');
  }
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/to-measures-implementing', authenticate, (req, res) => {
  const { id } = req.params;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (deviation.status !== 'measures_pending') {
    return res.status(400).json({ error: '当前状态不可进入措施执行' });
  }
  const measures = db.prepare('SELECT COUNT(*) as cnt FROM corrective_measures WHERE deviation_id = ?').get(id).cnt;
  if (measures === 0) {
    return res.status(400).json({ error: '请先制定纠正预防措施' });
  }
  db.prepare(`UPDATE deviations SET status = 'measures_implementing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  addApproval(id, 'measures_start', req.user.id, 'approve', '措施制定完成，进入执行阶段');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/to-validation-pending', authenticate, requireRoles('validation', 'qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (deviation.status !== 'measures_implementing') {
    return res.status(400).json({ error: '当前状态不可进入验证阶段' });
  }
  const pendingMeasures = db.prepare("SELECT COUNT(*) as cnt FROM corrective_measures WHERE deviation_id = ? AND status NOT IN ('completed', 'verified')").get(id).cnt;
  if (pendingMeasures > 0) {
    return res.status(400).json({ error: '存在未完成的纠正预防措施' });
  }
  db.prepare(`UPDATE deviations SET status = 'validation_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  addApproval(id, 'validation_start', req.user.id, 'approve', '措施执行完成，进入验证阶段');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/start-validation', authenticate, requireRoles('validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (deviation.status !== 'validation_pending') {
    return res.status(400).json({ error: '当前状态不可启动验证' });
  }
  db.prepare(`UPDATE deviations SET status = 'validating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  addApproval(id, 'validation_executing', req.user.id, 'approve', '验证执行中');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/close', authenticate, requireRoles('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const { closing_conclusion } = req.body;
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  if (!deviation) return res.status(404).json({ error: '偏差记录不存在' });
  if (deviation.status !== 'validating') {
    return res.status(400).json({ error: '当前状态不可关闭CAPA' });
  }
  const validations = db.prepare('SELECT status FROM validations WHERE deviation_id = ?').all(id);
  if (validations.length === 0) {
    return res.status(400).json({ error: '请先执行验证活动' });
  }
  const hasFailed = validations.some(v => v.status === 'failed' || v.status === 'needs_retest');
  const allPassed = validations.every(v => v.status === 'passed');
  if (!allPassed) {
    return res.status(400).json({ error: '验证未全部通过，不能关闭CAPA。存在失败或需复测的验证' });
  }
  db.prepare(`UPDATE deviations SET status = 'closed', closing_conclusion = ?, closing_date = CURRENT_TIMESTAMP, closed_by_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(closing_conclusion || '', req.user.id, id);
  addApproval(id, 'close', req.user.id, 'approve', closing_conclusion || 'CAPA关闭，验证全部通过');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

router.post('/:id/cancel', authenticate, requireRoles('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  db.prepare(`UPDATE deviations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  addApproval(id, 'cancel', req.user.id, 'reject', comment || '取消偏差');
  const updated = db.prepare('SELECT * FROM deviations WHERE id = ?').get(id);
  res.json({ deviation: updated });
});

module.exports = router;
