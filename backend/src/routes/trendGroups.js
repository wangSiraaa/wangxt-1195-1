const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, requireRole, getCurrentUser } = require('../middleware/auth');
const { getTrendGroupInfo, TREND_RELATION_TYPES } = require('../utils/businessRules');

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  const { root_cause_category } = req.query;
  
  let sql = `
    SELECT tg.*, u.name as created_by_name,
           (SELECT COUNT(*) FROM trend_group_members tgm WHERE tgm.group_id = tg.id) as member_count
    FROM deviation_trend_groups tg
    LEFT JOIN users u ON tg.created_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (root_cause_category) {
    sql += ' AND tg.root_cause_category = ?';
    params.push(root_cause_category);
  }

  sql += ' ORDER BY tg.created_at DESC';

  const groups = queryAll(sql, params);
  res.json({ groups });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const groupInfo = getTrendGroupInfo(id);
  
  if (!groupInfo) {
    return res.status(404).json({ error: '趋势组不存在' });
  }

  res.json({ group: groupInfo });
});

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const member = queryOne('SELECT * FROM trend_group_members WHERE deviation_id = ?', [deviationId]);
  
  if (!member) {
    return res.json({ group: null });
  }

  const groupInfo = getTrendGroupInfo(member.group_id);
  res.json({ group: groupInfo });
});

router.post('/', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const user = getCurrentUser(req);
  const { group_name, root_cause_category, description } = req.body;

  if (!group_name) {
    return res.status(400).json({ error: '趋势组名称为必填项' });
  }

  const id = uuidv4();
  
  runQuery(`
    INSERT INTO deviation_trend_groups (id, group_name, root_cause_category, description, created_by)
    VALUES (?, ?, ?, ?, ?)
  `, [id, group_name, root_cause_category || null, description || null, user.id]);

  const groupInfo = getTrendGroupInfo(id);
  res.status(201).json({ group: groupInfo });
});

router.put('/:id', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { group_name, root_cause_category, description } = req.body;

  const group = queryOne('SELECT * FROM deviation_trend_groups WHERE id = ?', [id]);
  if (!group) {
    return res.status(404).json({ error: '趋势组不存在' });
  }

  runQuery(`
    UPDATE deviation_trend_groups 
    SET group_name = ?, root_cause_category = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [group_name || group.group_name, root_cause_category || group.root_cause_category, description || group.description, id]);

  const groupInfo = getTrendGroupInfo(id);
  res.json({ group: groupInfo });
});

router.post('/:id/members', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);
  const { deviation_id, relation_type, comment } = req.body;

  if (!deviation_id) {
    return res.status(400).json({ error: '偏差ID为必填项' });
  }

  const group = queryOne('SELECT * FROM deviation_trend_groups WHERE id = ?', [id]);
  if (!group) {
    return res.status(404).json({ error: '趋势组不存在' });
  }

  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviation_id]);
  if (!deviation) {
    return res.status(404).json({ error: '偏差不存在' });
  }

  const existingMember = queryOne(
    'SELECT * FROM trend_group_members WHERE group_id = ? AND deviation_id = ?',
    [id, deviation_id]
  );

  if (existingMember) {
    return res.status(400).json({ error: '该偏差已在趋势组中' });
  }

  const existingGroup = queryOne('SELECT group_id FROM trend_group_members WHERE deviation_id = ?', [deviation_id]);
  if (existingGroup) {
    return res.status(400).json({ error: '该偏差已属于其他趋势组' });
  }

  const memberId = uuidv4();
  
  runQuery(`
    INSERT INTO trend_group_members (id, group_id, deviation_id, joined_by, relation_type, comment)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [memberId, id, deviation_id, user.id, relation_type || 'same_root_cause', comment || null]);

  runQuery('UPDATE deviations SET trend_group_id = ? WHERE id = ?', [id, deviation_id]);

  const groupInfo = getTrendGroupInfo(id);
  res.json({ group: groupInfo });
});

router.delete('/:id/members/:deviationId', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id, deviationId } = req.params;

  const group = queryOne('SELECT * FROM deviation_trend_groups WHERE id = ?', [id]);
  if (!group) {
    return res.status(404).json({ error: '趋势组不存在' });
  }

  runQuery('DELETE FROM trend_group_members WHERE group_id = ? AND deviation_id = ?', [id, deviationId]);
  runQuery('UPDATE deviations SET trend_group_id = NULL WHERE id = ?', [deviationId]);

  const groupInfo = getTrendGroupInfo(id);
  res.json({ group: groupInfo });
});

router.delete('/:id', authenticateToken, requireRole('qa', 'admin'), (req, res) => {
  const { id } = req.params;

  const group = queryOne('SELECT * FROM deviation_trend_groups WHERE id = ?', [id]);
  if (!group) {
    return res.status(404).json({ error: '趋势组不存在' });
  }

  runQuery('UPDATE deviations SET trend_group_id = NULL WHERE trend_group_id = ?', [id]);
  runQuery('DELETE FROM trend_group_members WHERE group_id = ?', [id]);
  runQuery('DELETE FROM deviation_trend_groups WHERE id = ?', [id]);

  res.json({ success: true, message: '趋势组已删除' });
});

module.exports = router;
