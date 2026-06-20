const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, getCurrentUser } = require('../middleware/auth');
const { checkActionOverdue } = require('../utils/businessRules');

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  const { status, deviation_id, level } = req.query;
  
  let sql = `
    SELECT e.*, 
           u1.name as escalated_by_name, 
           u2.name as escalated_to_name,
           d.deviation_no,
           d.title as deviation_title
    FROM escalations e
    LEFT JOIN users u1 ON e.escalated_by = u1.id
    LEFT JOIN users u2 ON e.escalated_to = u2.id
    LEFT JOIN deviations d ON e.deviation_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND e.status = ?';
    params.push(status);
  }
  if (deviation_id) {
    sql += ' AND e.deviation_id = ?';
    params.push(deviation_id);
  }
  if (level) {
    sql += ' AND e.level = ?';
    params.push(level);
  }

  sql += ' ORDER BY e.created_at DESC';

  const escalations = queryAll(sql, params);
  res.json({ escalations });
});

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const escalations = queryAll(`
    SELECT e.*, 
           u1.name as escalated_by_name, 
           u2.name as escalated_to_name
    FROM escalations e
    LEFT JOIN users u1 ON e.escalated_by = u1.id
    LEFT JOIN users u2 ON e.escalated_to = u2.id
    WHERE e.deviation_id = ?
    ORDER BY e.created_at DESC
  `, [deviationId]);

  res.json({ escalations });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const escalation = queryOne(`
    SELECT e.*, 
           u1.name as escalated_by_name, 
           u2.name as escalated_to_name,
           d.deviation_no,
           d.title as deviation_title
    FROM escalations e
    LEFT JOIN users u1 ON e.escalated_by = u1.id
    LEFT JOIN users u2 ON e.escalated_to = u2.id
    LEFT JOIN deviations d ON e.deviation_id = d.id
    WHERE e.id = ?
  `, [id]);

  if (!escalation) {
    return res.status(404).json({ error: '升级记录不存在' });
  }

  res.json({ escalation });
});

router.post('/', authenticateToken, (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, action_id, escalation_type, reason, escalated_to, level } = req.body;

  if (!deviation_id || !escalation_type || !reason || !escalated_to) {
    return res.status(400).json({ error: '偏差ID、升级类型、原因和升级对象为必填项' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const validTypes = ['overdue', 'technical', 'resource', 'decision', 'other'];
  if (!validTypes.includes(escalation_type)) {
    return res.status(400).json({ error: '无效的升级类型' });
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO escalations (id, deviation_id, action_id, escalation_type, reason, escalated_by, escalated_to, level, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `, [id, deviation_id, action_id || null, escalation_type, reason, user.id, escalated_to, level || 1]);

  const escalation = queryOne('SELECT * FROM escalations WHERE id = ?', [id]);
  res.status(201).json({ escalation });
});

router.post('/auto-check-overdue/:actionId', authenticateToken, (req, res) => {
  const { actionId } = req.params;
  const user = getCurrentUser(req);

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [actionId]);
  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  const check = checkActionOverdue(actionId);
  
  if (!check.needEscalation) {
    return res.json({ escalated: false, message: '措施暂不需要升级', check });
  }

  const qaUsers = queryAll("SELECT id FROM users WHERE role = 'qa' LIMIT 1");
  if (qaUsers.length === 0) {
    return res.status(500).json({ error: '未找到QA用户用于升级' });
  }

  const existingEscalation = queryOne(
    "SELECT * FROM escalations WHERE action_id = ? AND status = 'open' AND escalation_type = 'overdue'",
    [actionId]
  );

  if (existingEscalation) {
    return res.json({ escalated: false, message: '该措施已有未处理的超期升级', escalation: existingEscalation });
  }

  const id = uuidv4();
  const reason = `措施超期${check.daysOverdue}天未完成，系统自动升级`;
  
  runQuery(`
    INSERT INTO escalations (id, deviation_id, action_id, escalation_type, reason, escalated_by, escalated_to, level, status)
    VALUES (?, ?, ?, 'overdue', ?, ?, ?, ?, 'open')
  `, [id, action.deviation_id, actionId, reason, user.id, qaUsers[0].id, check.escalationLevel]);

  const escalation = queryOne('SELECT * FROM escalations WHERE id = ?', [id]);
  res.json({ escalated: true, escalation, check });
});

router.post('/:id/resolve', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { resolution } = req.body;

  const escalation = queryOne('SELECT * FROM escalations WHERE id = ?', [id]);
  if (!escalation) {
    return res.status(404).json({ error: '升级记录不存在' });
  }

  if (escalation.status !== 'open') {
    return res.status(400).json({ error: '仅未处理的升级可以解决' });
  }

  if (!resolution) {
    return res.status(400).json({ error: '解决方案为必填项' });
  }

  runQuery(`
    UPDATE escalations 
    SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [resolution, id]);

  const updated = queryOne('SELECT * FROM escalations WHERE id = ?', [id]);
  res.json({ escalation: updated });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const escalation = queryOne('SELECT * FROM escalations WHERE id = ?', [id]);
  if (!escalation) {
    return res.status(404).json({ error: '升级记录不存在' });
  }

  if (escalation.escalated_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '仅发起人或管理员可以删除' });
  }

  if (escalation.status !== 'open') {
    return res.status(400).json({ error: '仅未处理的升级可以删除' });
  }

  runQuery('DELETE FROM escalations WHERE id = ?', [id]);
  res.json({ success: true, message: '升级记录已删除' });
});

module.exports = router;
