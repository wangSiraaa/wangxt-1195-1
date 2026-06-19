const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.headers['evidence-type'] || 'general';
    const targetDir = path.join(uploadDir, subDir);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.txt', '.zip', '.rar', '.7z'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型'));
  }
});

router.get('/', authenticate, (req, res) => {
  const { deviation_id, measure_id, validation_id, uploaded_by } = req.query;
  let sql = `SELECT ev.*, u.name as uploader_name FROM evidences ev
    LEFT JOIN users u ON ev.uploaded_by_id = u.id WHERE 1=1`;
  const params = [];
  if (deviation_id) { sql += ' AND ev.deviation_id = ?'; params.push(deviation_id); }
  if (measure_id) { sql += ' AND ev.measure_id = ?'; params.push(measure_id); }
  if (validation_id) { sql += ' AND ev.validation_id = ?'; params.push(validation_id); }
  if (uploaded_by) { sql += ' AND ev.uploaded_by_id = ?'; params.push(uploaded_by); }
  sql += ' ORDER BY ev.created_at DESC';
  const evidences = db.prepare(sql).all(...params);
  res.json({ evidences });
});

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const { deviation_id, measure_id, validation_id, description } = req.body;
  const id = uuidv4();
  const fileType = path.extname(req.file.originalname).substring(1).toUpperCase();
  const filePath = req.file.path.replace(path.join(__dirname, '..', '..'), '').replace(/\\/g, '/');
  db.prepare(`INSERT INTO evidences (id, deviation_id, measure_id, validation_id, file_name, file_path, file_size, file_type, uploaded_by_id, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, deviation_id || null, measure_id || null, validation_id || null,
      req.file.originalname, filePath, req.file.size, fileType, req.user.id, description || '');
  const evidence = db.prepare('SELECT * FROM evidences WHERE id = ?').get(id);
  res.status(201).json({ evidence });
});

router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const evidence = db.prepare('SELECT * FROM evidences WHERE id = ?').get(id);
  if (!evidence) return res.status(404).json({ error: '证据不存在' });
  if (evidence.uploaded_by_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅上传人或管理员可删除' });
  }
  const fullPath = path.join(__dirname, '..', '..', evidence.file_path);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (_) {}
  }
  db.prepare('DELETE FROM evidences WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

module.exports = router;
