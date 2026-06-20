const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');

const router = express.Router();

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const verifications = queryAll(`
    SELECT v.*, u.name as verifier_name
    FROM verifications v
    LEFT JOIN users u ON v.verifier_id = u.id
    WHERE v.deviation_id = ?
    ORDER BY v.created_at DESC
  `, [deviationId]);

  res.json({ verifications });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const verification = queryOne(`
    SELECT v.*, u.name as verifier_name
    FROM verifications v
    LEFT JOIN users u ON v.verifier_id = u.id
    WHERE v.id = ?
  `, [id]);

  if (!verification) {
    return res.status(404).json({ error: '验证记录不存在' });
  }

  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.verification_id = ?
    ORDER BY ev.created_at DESC
  `, [id]);

  res.json({ verification, evidences });
});

router.post('/', authenticateToken, requireRole('validation', 'qa', 'admin'), (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, action_id, verification_method } = req.body;

  if (!deviation_id || !verification_method) {
    return res.status(400).json({ error: '偏差ID和验证方法为必填项' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO verifications (id, deviation_id, action_id, verification_method, verifier_id)
    VALUES (?, ?, ?, ?, ?)
  `, [id, deviation_id, action_id || null, verification_method, user.id]);

  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [id]);
  res.status(201).json({ verification });
});

router.post('/:id/submit', authenticateToken, requireRole('validation', 'qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { verification_result, is_passed, conclusion, evidence_files } = req.body;

  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [id]);
  if (!verification) {
    return res.status(404).json({ error: '验证记录不存在' });
  }

  if (verification.verified_at) {
    return res.status(400).json({ error: '该验证记录已提交验证结果' });
  }

  if (is_passed === undefined || is_passed === null) {
    return res.status(400).json({ error: '请选择验证是否通过' });
  }

  runQuery(`
    UPDATE verifications 
    SET verification_result = ?, is_passed = ?, conclusion = ?, evidence_files = ?, 
        verified_at = CURRENT_TIMESTAMP, verifier_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [verification_result || null, is_passed ? 1 : 0, conclusion || null, evidence_files || null, user.id, id]);

  const updated = queryOne(`
    SELECT v.*, u.name as verifier_name
    FROM verifications v
    LEFT JOIN users u ON v.verifier_id = u.id
    WHERE v.id = ?
  `, [id]);

  res.json({ verification: updated });
});

router.put('/:id', authenticateToken, requireRole('validation', 'qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { verification_method } = req.body;

  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [id]);
  if (!verification) {
    return res.status(404).json({ error: '验证记录不存在' });
  }

  if (verification.verified_at) {
    return res.status(400).json({ error: '已提交结果的验证记录不能编辑' });
  }

  if (verification.verifier_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '仅验证执行人可以编辑' });
  }

  runQuery(`
    UPDATE verifications 
    SET verification_method = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [verification_method || verification.verification_method, id]);

  const updated = queryOne('SELECT * FROM verifications WHERE id = ?', [id]);
  res.json({ verification: updated });
});

router.delete('/:id', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;

  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [id]);
  if (!verification) {
    return res.status(404).json({ error: '验证记录不存在' });
  }

  if (verification.verified_at) {
    return res.status(400).json({ error: '已提交结果的验证记录不能删除' });
  }

  runQuery('DELETE FROM verifications WHERE id = ?', [id]);
  res.json({ success: true, message: '验证记录已删除' });
});

module.exports = router;
