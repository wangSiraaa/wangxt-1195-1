const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');
const { REWORK_STATUS, validateCanGenerateRework } = require('../utils/businessRules');

const router = express.Router();

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const reworkPlans = queryAll(`
    SELECT rp.*, 
           u1.name as created_by_name,
           u2.name as approved_by_name,
           v.verification_method as source_verification_method
    FROM rework_plans rp
    LEFT JOIN users u1 ON rp.created_by = u1.id
    LEFT JOIN users u2 ON rp.approved_by = u2.id
    LEFT JOIN verifications v ON rp.source_verification_id = v.id
    WHERE rp.deviation_id = ?
    ORDER BY rp.created_at DESC
  `, [deviationId]);

  const plansWithActions = reworkPlans.map(plan => {
    const reworkActions = queryAll(`
      SELECT ca.*, u.name as responsible_name
      FROM capa_actions ca
      LEFT JOIN users u ON ca.responsible_id = u.id
      WHERE ca.rework_plan_id = ?
      ORDER BY ca.created_at DESC
    `, [plan.id]);
    return { ...plan, rework_actions: reworkActions };
  });

  res.json({ reworkPlans: plansWithActions });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const plan = queryOne(`
    SELECT rp.*, 
           u1.name as created_by_name,
           u2.name as approved_by_name,
           v.verification_method as source_verification_method
    FROM rework_plans rp
    LEFT JOIN users u1 ON rp.created_by = u1.id
    LEFT JOIN users u2 ON rp.approved_by = u2.id
    LEFT JOIN verifications v ON rp.source_verification_id = v.id
    WHERE rp.id = ?
  `, [id]);

  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  const reworkActions = queryAll(`
    SELECT ca.*, u.name as responsible_name
    FROM capa_actions ca
    LEFT JOIN users u ON ca.responsible_id = u.id
    WHERE ca.rework_plan_id = ?
    ORDER BY ca.created_at DESC
  `, [id]);

  const approvals = queryAll(`
    SELECT va.*, u.name as approver_name
    FROM verification_approvals va
    LEFT JOIN users u ON va.approver_id = u.id
    WHERE va.verification_id = ?
    ORDER BY va.created_at DESC
  `, [plan.source_verification_id]);

  res.json({ reworkPlan: { ...plan, rework_actions: reworkActions }, approvals });
});

router.post('/', authenticateToken, requireRole('validation', 'qa', 'admin'), (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, source_verification_id, parent_action_id, rework_reason, plan_description } = req.body;

  if (!deviation_id || !source_verification_id || !rework_reason || !plan_description) {
    return res.status(400).json({ error: '偏差ID、源验证ID、再措施原因和计划描述为必填项' });
  }

  const validation = validateCanGenerateRework(source_verification_id);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [source_verification_id]);
  if (!verification) {
    return res.status(404).json({ error: '验证记录不存在' });
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO rework_plans (id, deviation_id, source_verification_id, parent_action_id, rework_reason, plan_description, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, deviation_id, source_verification_id, parent_action_id || null, rework_reason, plan_description, REWORK_STATUS.PENDING, user.id]);

  runQuery('UPDATE verifications SET rework_generated = 1 WHERE id = ?', [source_verification_id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO verification_approvals (id, verification_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'rework_create', 'approved', ?)
  `, [approvalId, source_verification_id, user.id, `生成再措施计划: ${plan_description.slice(0, 50)}`]);

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.status(201).json({ reworkPlan: plan });
});

router.post('/:id/approve', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { approval_comment } = req.body;

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  if (plan.status !== REWORK_STATUS.PENDING) {
    return res.status(400).json({ error: '仅待审批状态的计划可以审批' });
  }

  runQuery(`
    UPDATE rework_plans 
    SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, approval_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [REWORK_STATUS.APPROVED, user.id, approval_comment || null, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO verification_approvals (id, verification_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'rework_approve', 'approved', ?)
  `, [approvalId, plan.source_verification_id, user.id, approval_comment || '审批通过再措施计划']);

  const updated = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.json({ reworkPlan: updated });
});

router.post('/:id/reject', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { approval_comment } = req.body;

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  if (plan.status !== REWORK_STATUS.PENDING) {
    return res.status(400).json({ error: '仅待审批状态的计划可以驳回' });
  }

  runQuery(`
    UPDATE rework_plans 
    SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, approval_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [REWORK_STATUS.REJECTED, user.id, approval_comment || null, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO verification_approvals (id, verification_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'rework_reject', 'rejected', ?)
  `, [approvalId, plan.source_verification_id, user.id, approval_comment || '驳回再措施计划']);

  const updated = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.json({ reworkPlan: updated });
});

router.post('/:id/start', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  if (plan.status !== REWORK_STATUS.APPROVED) {
    return res.status(400).json({ error: '仅已审批通过的计划可以开始执行' });
  }

  runQuery(`
    UPDATE rework_plans 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [REWORK_STATUS.IN_PROGRESS, id]);

  const updated = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.json({ reworkPlan: updated });
});

router.post('/:id/complete', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  if (plan.status !== REWORK_STATUS.IN_PROGRESS) {
    return res.status(400).json({ error: '仅执行中的计划可以完成' });
  }

  const reworkActions = queryAll('SELECT * FROM capa_actions WHERE rework_plan_id = ?', [id]);
  const allCompleted = reworkActions.length > 0 && reworkActions.every(a => a.status === 'completed');
  
  if (reworkActions.length > 0 && !allCompleted) {
    return res.status(400).json({ error: '存在未完成的再措施，无法完成计划' });
  }

  runQuery(`
    UPDATE rework_plans 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [REWORK_STATUS.COMPLETED, id]);

  const updated = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.json({ reworkPlan: updated });
});

router.put('/:id', authenticateToken, requireRole('qa', 'validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { rework_reason, plan_description } = req.body;

  const plan = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  if (!plan) {
    return res.status(404).json({ error: '再措施计划不存在' });
  }

  if (plan.status !== REWORK_STATUS.PENDING && plan.status !== REWORK_STATUS.REJECTED) {
    return res.status(400).json({ error: '仅待审批或已驳回的计划可以编辑' });
  }

  if (plan.created_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '仅创建人可以编辑' });
  }

  runQuery(`
    UPDATE rework_plans 
    SET rework_reason = ?, plan_description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [rework_reason || plan.rework_reason, plan_description || plan.plan_description, REWORK_STATUS.PENDING, id]);

  const updated = queryOne('SELECT * FROM rework_plans WHERE id = ?', [id]);
  res.json({ reworkPlan: updated });
});

module.exports = router;
