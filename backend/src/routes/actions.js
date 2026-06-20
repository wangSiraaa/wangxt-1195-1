const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');
const { checkActionOverdue, ACTION_STATUS } = require('../utils/businessRules');

const router = express.Router();

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const actions = queryAll(`
    SELECT ca.*, u.name as responsible_name
    FROM capa_actions ca
    LEFT JOIN users u ON ca.responsible_id = u.id
    WHERE ca.deviation_id = ?
    ORDER BY ca.created_at DESC
  `, [deviationId]);

  const actionsWithOverdue = actions.map(action => ({
    ...action,
    overdue_check: checkActionOverdue(action.id)
  }));

  res.json({ actions: actionsWithOverdue });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const action = queryOne(`
    SELECT ca.*, u.name as responsible_name
    FROM capa_actions ca
    LEFT JOIN users u ON ca.responsible_id = u.id
    WHERE ca.id = ?
  `, [id]);

  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  const approvals = queryAll(`
    SELECT aa.*, u.name as approver_name
    FROM action_approvals aa
    LEFT JOIN users u ON aa.approver_id = u.id
    WHERE aa.action_id = ?
    ORDER BY aa.created_at DESC
  `, [id]);

  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.action_id = ?
    ORDER BY ev.created_at DESC
  `, [id]);

  const overdueCheck = checkActionOverdue(id);

  res.json({ action, approvals, evidences, overdue_check: overdueCheck });
});

router.post('/', authenticateToken, (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, action_type, description, responsible_id, due_date, priority, is_rework, rework_plan_id, parent_action_id } = req.body;

  if (!deviation_id || !action_type || !description || !responsible_id || !due_date) {
    return res.status(400).json({ error: '偏差ID、措施类型、描述、责任人和截止日期为必填项' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const validTypes = ['correction', 'corrective', 'preventive'];
  if (!validTypes.includes(action_type)) {
    return res.status(400).json({ error: '无效的措施类型，可选值: correction, corrective, preventive' });
  }

  if (is_rework && rework_plan_id) {
    const reworkPlan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [rework_plan_id]);
    if (!reworkPlan) {
      return res.status(400).json({ error: '再措施计划不存在' });
    }
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO capa_actions (id, deviation_id, action_type, description, responsible_id, due_date, status, priority, is_rework, rework_plan_id, parent_action_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, deviation_id, action_type, description, responsible_id, due_date, 
    ACTION_STATUS.PENDING, priority || 'medium',
    is_rework ? 1 : 0, rework_plan_id || null, parent_action_id || null
  ]);

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  res.status(201).json({ action });
});

router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { description, responsible_id, due_date, priority } = req.body;

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  if (action.status === ACTION_STATUS.COMPLETED) {
    return res.status(400).json({ error: '已完成的措施不能编辑' });
  }

  runQuery(`
    UPDATE capa_actions 
    SET description = ?, responsible_id = ?, due_date = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [description || action.description, responsible_id || action.responsible_id, due_date || action.due_date, priority || action.priority, id]);

  const updated = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  res.json({ action: updated });
});

router.post('/:id/start', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  if (action.responsible_id !== user.id && user.role !== 'admin' && user.role !== 'qa') {
    return res.status(403).json({ error: '仅责任人可以开始执行措施' });
  }

  if (action.status !== ACTION_STATUS.PENDING && action.status !== ACTION_STATUS.OVERDUE) {
    return res.status(400).json({ error: '仅待处理或超期状态可以开始执行' });
  }

  runQuery(`
    UPDATE capa_actions 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [ACTION_STATUS.IN_PROGRESS, id]);

  const updated = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  res.json({ action: updated });
});

router.post('/:id/complete', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { completion_evidence } = req.body;

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  if (action.responsible_id !== user.id && user.role !== 'admin' && user.role !== 'qa') {
    return res.status(403).json({ error: '仅责任人可以完成措施' });
  }

  if (action.status !== ACTION_STATUS.IN_PROGRESS && action.status !== ACTION_STATUS.OVERDUE) {
    return res.status(400).json({ error: '仅执行中或超期状态可以完成' });
  }

  runQuery(`
    UPDATE capa_actions 
    SET status = ?, actual_date = CURRENT_TIMESTAMP, completion_evidence = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [ACTION_STATUS.COMPLETED, completion_evidence || null, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO action_approvals (id, action_id, approver_id, decision, comment)
    VALUES (?, ?, ?, 'completed', ?)
  `, [approvalId, id, user.id, completion_evidence || '措施执行完成']);

  const updated = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  res.json({ action: updated });
});

router.post('/:id/check-overdue', authenticateToken, (req, res) => {
  const { id } = req.params;
  const check = checkActionOverdue(id);
  
  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  if (action && check.overdue && action.status === ACTION_STATUS.IN_PROGRESS) {
    runQuery('UPDATE capa_actions SET status = ? WHERE id = ?', [ACTION_STATUS.OVERDUE, id]);
  }

  res.json(check);
});

router.delete('/:id', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;

  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [id]);
  if (!action) {
    return res.status(404).json({ error: '措施不存在' });
  }

  if (action.status === ACTION_STATUS.COMPLETED) {
    return res.status(400).json({ error: '已完成的措施不能删除' });
  }

  runQuery('DELETE FROM capa_actions WHERE id = ?', [id]);
  res.json({ success: true, message: '措施已删除' });
});

module.exports = router;
