require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const deviationRoutes = require('./routes/deviations');
const measureRoutes = require('./routes/measures');
const validationRoutes = require('./routes/validations');
const escalationRoutes = require('./routes/escalations');
const userRoutes = require('./routes/users');
const evidenceRoutes = require('./routes/evidences');

const app = express();
const PORT = process.env.API_PORT || 19495;

app.use(cors({
  origin: ['http://localhost:5173', `http://localhost:${process.env.WEB_PORT || 20495}`],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CAPA系统服务正常运行', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/deviations', deviationRoutes);
app.use('/api/measures', measureRoutes);
app.use('/api/validations', validationRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/evidences', evidenceRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CAPA后端服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`健康检查: http://0.0.0.0:${PORT}/api/health`);
});
