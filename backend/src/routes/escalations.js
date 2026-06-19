const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { deviation_id, status, to_user, from_user, level, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT e.*,
    fu.name as from_user_name, tu.name as to_user_name, tu.role as to_user_role,
    d.code as deviation_code, d.title as deviation_title, d.severity as deviation_severity,
    m.description as measure_description
    FROM escalations e
    LEFT JOIN users fu ON e.from_user_id = fu.id
    LEFT JOIN users tu ON e.to_user_id = tu.id
    LEFT JOIN deviations d ON e.deviation_id = d.id
    LEFT JOIN corrective_measures m ON e.measure_id = m.id
    WHERE 1=1`;
  const params = [];
  if (deviation_id) { sql += ' AND e.deviation_id = ?'; params.push(deviation_id); }
  if (status) { sql += ' AND e.status = ?'; params.push(status); }
  if (to_user) { sql += ' AND e.to_user_id = ?'; params.push(to_user); }
  if (from_user) { sql += ' AND e.from_user_id = ?'; params.push(from_user); }
  if (level) { sql += ' AND e.level = ?'; params.push(Number(level)); }
  const total = db.prepare(sql.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
  sql += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const escalations = db.prepare(sql).all(...params);
  res.json({ escalations, total });
});

router.get('/:id', authenticate, (req, res) => {
  const escalation = db.prepare(`SELECT e.*,
    fu.name as from_user_name, tu.name as to_user_name,
    d.code as deviation_code, d.title as deviation_title,
    m.description as measure_description
    FROM escalations e
    LEFT JOIN users fu ON e.from_user_id = fu.id
    LEFT JOIN users tu ON e.to_user_id = tu.id
    LEFT JOIN deviations d ON e.deviation_id = d.id
    LEFT JOIN corrective_measures m ON e.measure_id = m.id
    WHERE e.id = ?`).get(req.params.id);
  if (!escalation) return res.status(404).json({ error: '升级记录不存在' });
  res.json({ escalation });
});

router.post('/', authenticate, (req, res) => {
  const { deviation_id, measure_id, level, reason, to_user_id } = req.body;
  if (!deviation_id || !level || !reason || !to_user_id) {
    return res.status(400).json({ error: '偏差ID、级别、原因、接收人为必填' });
  }
  const deviation = db.prepare('SELECT * FROM deviations WHERE id = ?').get(deviation_id);
  if (!deviation) return res.status(404).json({ error: '偏差不存在' });
  const toUser = db.prepare('SELECT * FROM users WHERE id = ?').get(to_user_id);
  if (!toUser) return res.status(404).json({ error: '接收人不存在' });
  const id = uuidv4();
  db.prepare(`INSERT INTO escalations (id, deviation_id, measure_id, level, reason, from_user_id, to_user_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(id, deviation_id, measure_id || null, Number(level), reason, req.user.id, to_user_id);
  const escalation = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id);
  res.status(201).json({ escalation });
});

router.post('/:id/acknowledge', authenticate, (req, res) => {
  const { id } = req.params;
  const { acknowledgment } = req.body;
  const escalation = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id);
  if (!escalation) return res.status(404).json({ error: '升级记录不存在' });
  if (escalation.to_user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅接收人可确认' });
  }
  if (escalation.status !== 'pending') {
    return res.status(400).json({ error: '当前状态不可确认' });
  }
  db.prepare(`UPDATE escalations SET status = 'acknowledged', acknowledgment = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(acknowledgment || '', id);
  const updated = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id);
  res.json({ escalation: updated });
});

router.post('/:id/resolve', authenticate, (req, res) => {
  const { id } = req.params;
  const { acknowledgment } = req.body;
  const escalation = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id);
  if (!escalation) return res.status(404).json({ error: '升级记录不存在' });
  if (escalation.to_user_id !== req.user.id && escalation.from_user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限处理此升级' });
  }
  db.prepare(`UPDATE escalations SET status = 'resolved', acknowledgment = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(acknowledgment || '问题已处理', id);
  const updated = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id);
  res.json({ escalation: updated });
});

router.get('/levels/definitions', authenticate, (req, res) => {
  res.json({
    levels: [
      { level: 1, name: '一级升级', desc: '班组/负责人层面：措施执行困难或资源不足，请求直属上级协调' },
      { level: 2, name: '二级升级', desc: '部门层面：措施超期、跨部门协调，请求部门经理/QA负责人介入' },
      { level: 3, name: '三级升级', desc: '公司层面：重大风险、长期未解决，请求质量总监/生产总监介入' }
    ]
  });
});

module.exports = router;
