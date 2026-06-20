const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');

const router = express.Router();

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const rootCauses = queryAll(`
    SELECT rc.*, u1.name as investigator_name, u2.name as confirmed_by_name
    FROM root_causes rc
    LEFT JOIN users u1 ON rc.investigator_id = u1.id
    LEFT JOIN users u2 ON rc.confirmed_by = u2.id
    WHERE rc.deviation_id = ?
    ORDER BY rc.created_at DESC
  `, [deviationId]);

  res.json({ rootCauses });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const rootCause = queryOne(`
    SELECT rc.*, u1.name as investigator_name, u2.name as confirmed_by_name
    FROM root_causes rc
    LEFT JOIN users u1 ON rc.investigator_id = u1.id
    LEFT JOIN users u2 ON rc.confirmed_by = u2.id
    WHERE rc.id = ?
  `, [id]);

  if (!rootCause) {
    return res.status(404).json({ error: '根因分析不存在' });
  }

  res.json({ rootCause });
});

router.post('/', authenticateToken, requireRole('qa', 'validation', 'admin'), (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, description, category, analysis_method, investigator_id } = req.body;

  if (!deviation_id || !description) {
    return res.status(400).json({ error: '偏差ID和描述为必填项' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO root_causes (id, deviation_id, description, category, analysis_method, investigator_id, is_confirmed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `, [id, deviation_id, description, category || null, analysis_method || null, investigator_id || user.id]);

  const rootCause = queryOne('SELECT * FROM root_causes WHERE id = ?', [id]);
  res.status(201).json({ rootCause });
});

router.put('/:id', authenticateToken, requireRole('qa', 'validation', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { description, category, analysis_method, investigator_id } = req.body;

  const rootCause = queryOne('SELECT * FROM root_causes WHERE id = ?', [id]);
  if (!rootCause) {
    return res.status(404).json({ error: '根因分析不存在' });
  }

  if (rootCause.is_confirmed === 1) {
    return res.status(400).json({ error: '已确认的根因分析不能编辑' });
  }

  runQuery(`
    UPDATE root_causes 
    SET description = ?, category = ?, analysis_method = ?, investigator_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [description || rootCause.description, category || null, analysis_method || null, investigator_id || rootCause.investigator_id, id]);

  const updated = queryOne('SELECT * FROM root_causes WHERE id = ?', [id]);
  res.json({ rootCause: updated });
});

router.post('/:id/confirm', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const rootCause = queryOne('SELECT * FROM root_causes WHERE id = ?', [id]);
  if (!rootCause) {
    return res.status(404).json({ error: '根因分析不存在' });
  }

  if (rootCause.is_confirmed === 1) {
    return res.status(400).json({ error: '该根因分析已确认' });
  }

  runQuery(`
    UPDATE root_causes 
    SET is_confirmed = 1, confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [user.id, id]);

  const updated = queryOne(`
    SELECT rc.*, u1.name as investigator_name, u2.name as confirmed_by_name
    FROM root_causes rc
    LEFT JOIN users u1 ON rc.investigator_id = u1.id
    LEFT JOIN users u2 ON rc.confirmed_by = u2.id
    WHERE rc.id = ?
  `, [id]);

  res.json({ rootCause: updated });
});

router.delete('/:id', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;

  const rootCause = queryOne('SELECT * FROM root_causes WHERE id = ?', [id]);
  if (!rootCause) {
    return res.status(404).json({ error: '根因分析不存在' });
  }

  if (rootCause.is_confirmed === 1) {
    return res.status(400).json({ error: '已确认的根因分析不能删除' });
  }

  runQuery('DELETE FROM root_causes WHERE id = ?', [id]);
  res.json({ success: true, message: '根因分析已删除' });
});

module.exports = router;
