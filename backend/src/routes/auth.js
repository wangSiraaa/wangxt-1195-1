const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne, queryAll } = require('../database');
const { generateToken, authenticateToken, getCurrentUser } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
  
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const isValid = bcrypt.compareSync(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department
    }
  });
});

router.get('/me', authenticateToken, (req, res) => {
  const user = getCurrentUser(req);
  res.json({ user });
});

router.get('/users', authenticateToken, (req, res) => {
  const users = queryAll('SELECT id, username, name, role, department, created_at FROM users');
  res.json({ users });
});

router.get('/users/by-role/:role', authenticateToken, (req, res) => {
  const { role } = req.params;
  const users = queryAll('SELECT id, username, name, role, department FROM users WHERE role = ?', [role]);
  res.json({ users });
});

module.exports = router;
