require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { initDatabase } = require('./src/database');

const authRoutes = require('./src/routes/auth');
const deviationRoutes = require('./src/routes/deviations');
const rootCauseRoutes = require('./src/routes/rootCauses');
const actionRoutes = require('./src/routes/actions');
const verificationRoutes = require('./src/routes/verifications');
const escalationRoutes = require('./src/routes/escalations');
const evidenceRoutes = require('./src/routes/evidences');
const trendGroupRoutes = require('./src/routes/trendGroups');
const reworkPlanRoutes = require('./src/routes/reworkPlans');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'CAPA Backend Service',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/deviations', deviationRoutes);
app.use('/api/root-causes', rootCauseRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/evidences', evidenceRoutes);
app.use('/api/trend-groups', trendGroupRoutes);
app.use('/api/rework-plans', reworkPlanRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`CAPA Backend Server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
