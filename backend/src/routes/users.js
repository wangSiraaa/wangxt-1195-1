const express = require('express');
const db = require('../database');
const { authenticate, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { role, department, keyword } = req.query;
  let sql = 'SELECT id, username, name, role, department, email, phone, created_at FROM users WHERE 1=1';
  const params = [];
  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }
  if (department) {
    sql += ' AND department = ?';
    params.push(department);
  }
  if (keyword) {
    sql += ' AND (name LIKE ? OR username LIKE ? OR department LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  sql += ' ORDER BY name';
  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

router.get('/roles', authenticate, (req, res) => {
  res.json({
    roles: [
      { key: 'production', name: '生产班组', desc: '提交偏差事实' },
      { key: 'qa', name: 'QA工程师', desc: '判定严重程度，审核根因' },
      { key: 'validation', name: '验证工程师', desc: '执行纠正预防措施，验证' },
      { key: 'admin', name: '系统管理员', desc: '系统配置与管理' }
    ]
  });
});

router.get('/by-role/:role', authenticate, (req, res) => {
  const { role } = req.params;
  const users = db.prepare(
    'SELECT id, username, name, role, department, email FROM users WHERE role = ? ORDER BY name'
  ).all(role);
  res.json({ users });
});

module.exports = router;
