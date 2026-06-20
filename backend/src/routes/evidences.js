const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, queryAll, runQuery } = require('../database');
const { authenticateToken, getCurrentUser } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

router.get('/deviation/:deviationId', authenticateToken, (req, res) => {
  const { deviationId } = req.params;
  
  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.deviation_id = ?
    ORDER BY ev.created_at DESC
  `, [deviationId]);

  res.json({ evidences });
});

router.get('/action/:actionId', authenticateToken, (req, res) => {
  const { actionId } = req.params;
  
  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.action_id = ?
    ORDER BY ev.created_at DESC
  `, [actionId]);

  res.json({ evidences });
});

router.get('/verification/:verificationId', authenticateToken, (req, res) => {
  const { verificationId } = req.params;
  
  const evidences = queryAll(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.verification_id = ?
    ORDER BY ev.created_at DESC
  `, [verificationId]);

  res.json({ evidences });
});

router.get('/:id/download', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const evidence = queryOne('SELECT * FROM evidences WHERE id = ?', [id]);
  if (!evidence) {
    return res.status(404).json({ error: '证据文件不存在' });
  }

  const filePath = path.join(uploadDir, path.basename(evidence.file_path));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.download(filePath, evidence.file_name);
});

router.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  const user = getCurrentUser(req);
  const { deviation_id, action_id, verification_id, description } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: '未上传文件' });
  }

  if (!deviation_id && !action_id && !verification_id) {
    return res.status(400).json({ error: '必须指定关联的偏差、措施或验证记录' });
  }

  const id = uuidv4();
  const file_path = req.file.filename;
  const file_name = req.file.originalname;
  const file_size = req.file.size;

  runQuery(`
    INSERT INTO evidences (id, deviation_id, action_id, verification_id, file_name, file_path, file_size, uploaded_by, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, deviation_id || null, action_id || null, verification_id || null, file_name, file_path, file_size, user.id, description || null]);

  const evidence = queryOne(`
    SELECT ev.*, u.name as uploaded_by_name
    FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by = u.id
    WHERE ev.id = ?
  `, [id]);

  res.status(201).json({ evidence });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const user = getCurrentUser(req);

  const evidence = queryOne('SELECT * FROM evidences WHERE id = ?', [id]);
  if (!evidence) {
    return res.status(404).json({ error: '证据文件不存在' });
  }

  if (evidence.uploaded_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: '仅上传人或管理员可以删除' });
  }

  const filePath = path.join(uploadDir, path.basename(evidence.file_path));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  runQuery('DELETE FROM evidences WHERE id = ?', [id]);
  res.json({ success: true, message: '证据文件已删除' });
});

module.exports = router;
