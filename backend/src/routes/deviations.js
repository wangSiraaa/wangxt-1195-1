const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');
const { 
  SEVERITY, 
  STATUS, 
  validateCanEnterActionPhase, 
  validateCanCloseCAPA,
  validateDeviationForQA,
  canUserTransitionStatus,
  checkAllActionsOverdue,
  findSimilarDeviations,
  autoEscalateOverdueActions
} = require('../utils/businessRules');

const router = express.Router();

function generateDeviationNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const count = queryAll('SELECT COUNT(*) as count FROM deviations').reduce((acc, r) => r.count || acc, 0) + 1;
  return `DEV-${year}${month}-${String(count).padStart(4, '0')}`;
}

router.get('/', authenticateToken, (req, res) => {
  const { status, severity, reporter_id } = req.query;
  
  let sql = `
    SELECT d.*, 
           u1.name as reporter_name, 
           u2.name as qa_judge_name
    FROM deviations d
    LEFT JOIN users u1 ON d.reporter_id = u1.id
    LEFT JOIN users u2 ON d.qa_judge_id = u2.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND d.status = ?';
    params.push(status);
  }
  if (severity) {
    sql += ' AND d.severity = ?';
    params.push(severity);
  }
  if (reporter_id) {
    sql += ' AND d.reporter_id = ?';
    params.push(reporter_id);
  }

  sql += ' ORDER BY d.created_at DESC';

  const deviations = queryAll(sql, params);
  res.json({ deviations });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const deviation = queryOne(`
    SELECT d.*, 
           u1.name as reporter_name, 
           u2.name as qa_judge_name
    FROM deviations d
    LEFT JOIN users u1 ON d.reporter_id = u1.id
    LEFT JOIN users u2 ON d.qa_judge_id = u2.id
    WHERE d.id = ?
  `, [id]);

  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const approvals = queryAll(`
    SELECT da.*, u.name as approver_name
    FROM deviation_approvals da
    LEFT JOIN users u ON da.approver_id = u.id
    WHERE da.deviation_id = ?
    ORDER BY da.created_at DESC
  `, [id]);

  const rootCauses = queryAll(`
    SELECT rc.*, u1.name as investigator_name, u2.name as confirmed_by_name
    FROM root_causes rc
    LEFT JOIN users u1 ON rc.investigator_id = u1.id
    LEFT JOIN users u2 ON rc.confirmed_by = u2.id
    WHERE rc.deviation_id = ?
    ORDER BY rc.created_at DESC
  `, [id]);

  const actions = queryAll(`
    SELECT ca.*, u.name as responsible_name
    FROM capa_actions ca
    LEFT JOIN users u ON ca.responsible_id = u.id
    WHERE ca.deviation_id = ?
    ORDER BY ca.created_at DESC
  `, [id]);

  const verifications = queryAll(`
    SELECT v.*, u.name as verifier_name
    FROM verifications v
    LEFT JOIN users u ON v.verifier_id = u.id
    WHERE v.deviation_id = ?
    ORDER BY v.created_at DESC
  `, [id]);

  const escalations = queryAll(`
    SELECT e.*, u1.name as escalated_by_name, u2.name as escalated_to_name
    FROM escalations e
    LEFT JOIN users u1 ON e.escalated_by = u1.id
    LEFT JOIN users u2 ON e.escalated_to = u2.id
    WHERE e.deviation_id = ?
    ORDER BY e.created_at DESC
  `, [id]);

  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.deviation_id = ?
    ORDER BY ev.created_at DESC
  `, [id]);

  const closeConclusion = queryOne(`
    SELECT cc.*, u.name as closed_by_name
    FROM close_conclusions cc
    LEFT JOIN users u ON cc.closed_by = u.id
    WHERE cc.deviation_id = ?
  `, [id]);

  const overdueCheck = checkAllActionsOverdue(id);

  const trendGroup = (() => {
    const member = queryOne('SELECT * FROM trend_group_members WHERE deviation_id = ?', [id]);
    if (!member) return null;
    
    const group = queryOne(`
      SELECT tg.*, u.name as created_by_name
      FROM deviation_trend_groups tg
      LEFT JOIN users u ON tg.created_by = u.id
      WHERE tg.id = ?
    `, [member.group_id]);
    
    if (!group) return null;
    
    const members = queryAll(`
      SELECT tgm.*, d.deviation_no, d.title, d.severity, d.status, d.created_at,
             u.name as reporter_name
      FROM trend_group_members tgm
      LEFT JOIN deviations d ON tgm.deviation_id = d.id
      LEFT JOIN users u ON d.reporter_id = u.id
      WHERE tgm.group_id = ?
      ORDER BY tgm.joined_at DESC
    `, [member.group_id]);
    
    return { ...group, members, memberCount: members.length };
  })();

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
  `, [id]);

  const reworkPlansWithActions = reworkPlans.map(plan => {
    const actions = queryAll(`
      SELECT ca.*, u.name as responsible_name
      FROM capa_actions ca
      LEFT JOIN users u ON ca.responsible_id = u.id
      WHERE ca.rework_plan_id = ?
      ORDER BY ca.created_at DESC
    `, [plan.id]);
    return { ...plan, rework_actions: actions };
  });

  const verificationApprovals = queryAll(`
    SELECT va.*, u.name as approver_name
    FROM verification_approvals va
    LEFT JOIN users u ON va.approver_id = u.id
    WHERE va.verification_id IN (SELECT id FROM verifications WHERE deviation_id = ?)
    ORDER BY va.created_at DESC
  `, [id]);

  res.json({
    deviation,
    approvals,
    rootCauses,
    actions,
    verifications,
    escalations,
    evidences,
    closeConclusion,
    overdueCheck,
    trendGroup,
    reworkPlans: reworkPlansWithActions,
    verificationApprovals
  });
});

router.post('/', authenticateToken, requireRole('production', 'qa', 'admin'), (req, res) => {
  const user = getCurrentUser(req);
  const { title, description, product_batch, equipment, location, discovered_date } = req.body;

  if (!title || !description || !discovered_date) {
    return res.status(400).json({ error: '标题、描述和发现日期为必填项' });
  }

  const id = uuidv4();
  const deviationNo = generateDeviationNo();

  runQuery(`
    INSERT INTO deviations (id, deviation_no, title, description, product_batch, equipment, location, discovered_date, reporter_id, status, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, deviationNo, title, description, product_batch || null, equipment || null, location || null, discovered_date, user.id, STATUS.DRAFT, SEVERITY.MINOR]);

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.status(201).json({ deviation });
});

router.put('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { title, description, product_batch, equipment, location, discovered_date } = req.body;

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (deviation.status !== STATUS.DRAFT && user.role !== 'admin') {
    return res.status(403).json({ error: '仅草稿状态可以编辑基本信息' });
  }

  if (deviation.reporter_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '仅提交人可以编辑' });
  }

  runQuery(`
    UPDATE deviations 
    SET title = ?, description = ?, product_batch = ?, equipment = ?, location = ?, discovered_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [title || deviation.title, description || deviation.description, product_batch || null, equipment || null, location || null, discovered_date || deviation.discovered_date, id]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.json({ deviation: updated });
});

router.post('/:id/submit', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (!canUserTransitionStatus(user.role, deviation.status, STATUS.SUBMITTED)) {
    return res.status(403).json({ error: '当前用户无权提交此偏差' });
  }

  if (deviation.status !== STATUS.DRAFT) {
    return res.status(400).json({ error: '仅草稿状态可以提交' });
  }

  runQuery('UPDATE deviations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [STATUS.SUBMITTED, id]);
  
  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO deviation_approvals (id, deviation_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'submit', 'approved', '提交偏差')
  `, [approvalId, id, user.id]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.json({ deviation: updated });
});

router.post('/:id/qa-judge', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { severity, comment, root_cause_required } = req.body;

  const validation = validateDeviationForQA(id, severity);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (deviation.status !== STATUS.SUBMITTED) {
    return res.status(400).json({ error: '仅已提交状态的偏差可以进行QA判定' });
  }

  const isMajor = severity === SEVERITY.MAJOR || severity === SEVERITY.CRITICAL;

  runQuery(`
    UPDATE deviations 
    SET severity = ?, qa_judge_id = ?, qa_judge_comment = ?, qa_judge_date = CURRENT_TIMESTAMP, 
        root_cause_required = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [severity, user.id, comment || '', isMajor ? 1 : (root_cause_required ? 1 : 0), STATUS.QA_REVIEWED, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO deviation_approvals (id, deviation_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'qa_judge', 'approved', ?)
  `, [approvalId, id, user.id, comment || `判定严重程度: ${severity}`]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.json({ deviation: updated });
});

router.post('/:id/enter-action', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (!canUserTransitionStatus(user.role, deviation.status, STATUS.IN_ACTION)) {
    return res.status(403).json({ error: '当前用户无权推进到措施阶段' });
  }

  const validation = validateCanEnterActionPhase(id);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  runQuery('UPDATE deviations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [STATUS.IN_ACTION, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO deviation_approvals (id, deviation_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'status_change', 'approved', '进入措施执行阶段')
  `, [approvalId, id, user.id]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.json({ deviation: updated });
});

router.post('/:id/enter-verification', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (!canUserTransitionStatus(user.role, deviation.status, STATUS.IN_VERIFICATION)) {
    return res.status(403).json({ error: '当前用户无权推进到验证阶段' });
  }

  runQuery('UPDATE deviations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [STATUS.IN_VERIFICATION, id]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO deviation_approvals (id, deviation_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'status_change', 'approved', '进入效果验证阶段')
  `, [approvalId, id, user.id]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  res.json({ deviation: updated });
});

router.post('/:id/close', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { conclusion, effectiveness_review, lessons_learned } = req.body;

  if (!conclusion) {
    return res.status(400).json({ error: '关闭结论为必填项' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  if (deviation.status !== STATUS.IN_VERIFICATION) {
    return res.status(400).json({ error: '仅验证中状态可以关闭' });
  }

  const validation = validateCanCloseCAPA(id);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  runQuery('UPDATE deviations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [STATUS.CLOSED, id]);

  const conclusionId = uuidv4();
  runQuery(`
    INSERT INTO close_conclusions (id, deviation_id, conclusion, closed_by, effectiveness_review, lessons_learned)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [conclusionId, id, conclusion, user.id, effectiveness_review || null, lessons_learned || null]);

  const approvalId = uuidv4();
  runQuery(`
    INSERT INTO deviation_approvals (id, deviation_id, approver_id, approval_type, decision, comment)
    VALUES (?, ?, ?, 'close', 'approved', ?)
  `, [approvalId, id, user.id, conclusion]);

  const updated = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  const closeConclusion = queryOne('SELECT * FROM close_conclusions WHERE id = ?', [conclusionId]);
  
  res.json({ deviation: updated, closeConclusion });
});

router.get('/:id/similar', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { by_root_cause, by_product, by_equipment } = req.query;

  const options = {
    byRootCauseCategory: by_root_cause === 'true' || by_root_cause === true,
    byProduct: by_product === 'true' || by_product === true,
    byEquipment: by_equipment === 'true' || by_equipment === true
  };

  const similar = findSimilarDeviations(id, options);
  res.json({ similar_devations: similar });
});

router.post('/:id/auto-escalate', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const result = autoEscalateOverdueActions(id, user.id);
  res.json(result);
});

module.exports = router;
