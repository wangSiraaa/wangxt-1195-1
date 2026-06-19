const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'capa.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('production', 'qa', 'validation', 'admin')),
      department TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS deviations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      department TEXT,
      product TEXT,
      batch_no TEXT,
      occurrence_date TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      severity TEXT DEFAULT 'minor' CHECK(severity IN ('minor', 'major', 'critical')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'root_cause_pending', 'root_cause_analysis', 'measures_pending', 'measures_implementing', 'validation_pending', 'validating', 'closed', 'cancelled')),
      qa_evaluator_id TEXT,
      qa_evaluation TEXT,
      qa_evaluation_date TEXT,
      verification_engineer_id TEXT,
      root_cause TEXT,
      root_cause_analysis_date TEXT,
      root_cause_analyst_id TEXT,
      closing_conclusion TEXT,
      closing_date TEXT,
      closed_by_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (qa_evaluator_id) REFERENCES users(id),
      FOREIGN KEY (verification_engineer_id) REFERENCES users(id),
      FOREIGN KEY (root_cause_analyst_id) REFERENCES users(id),
      FOREIGN KEY (closed_by_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('submit', 'approve', 'reject', 'comment')),
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS corrective_measures (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('correction', 'preventive')),
      description TEXT NOT NULL,
      responsible_id TEXT NOT NULL,
      deadline TEXT NOT NULL,
      actual_completion_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'overdue', 'verified')),
      verification_result TEXT,
      verification_date TEXT,
      verified_by_id TEXT,
      evidence_urls TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (responsible_id) REFERENCES users(id),
      FOREIGN KEY (verified_by_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS validations (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      protocol TEXT,
      executor_id TEXT NOT NULL,
      plan_start_date TEXT,
      plan_end_date TEXT,
      actual_start_date TEXT,
      actual_end_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'passed', 'failed', 'needs_retest')),
      result_summary TEXT,
      result_details TEXT,
      non_conformance TEXT,
      evidence_urls TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (executor_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS escalations (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      measure_id TEXT,
      level INTEGER NOT NULL,
      reason TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'acknowledged', 'resolved')),
      acknowledgment TEXT,
      acknowledged_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (measure_id) REFERENCES corrective_measures(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS evidences (
      id TEXT PRIMARY KEY,
      deviation_id TEXT,
      measure_id TEXT,
      validation_id TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_type TEXT,
      uploaded_by_id TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (measure_id) REFERENCES corrective_measures(id),
      FOREIGN KEY (validation_id) REFERENCES validations(id),
      FOREIGN KEY (uploaded_by_id) REFERENCES users(id)
    )`
  ];

  const transaction = db.transaction(() => {
    for (const sql of tables) {
      db.exec(sql);
    }
  });
  transaction();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const defaultUsers = [
      { id: uuidv4(), username: 'admin', name: '系统管理员', role: 'admin', password: 'admin123', department: 'IT部', email: 'admin@pharma.com' },
      { id: uuidv4(), username: 'prod01', name: '张伟', role: 'production', password: 'prod123', department: '固体制剂车间', email: 'zhangwei@pharma.com' },
      { id: uuidv4(), username: 'prod02', name: '李娜', role: 'production', password: 'prod123', department: '注射剂车间', email: 'lina@pharma.com' },
      { id: uuidv4(), username: 'qa01', name: '王芳', role: 'qa', password: 'qa123', department: '质量保证部', email: 'wangfang@pharma.com' },
      { id: uuidv4(), username: 'qa02', name: '陈强', role: 'qa', password: 'qa123', department: '质量保证部', email: 'chenqiang@pharma.com' },
      { id: uuidv4(), username: 'val01', name: '刘洋', role: 'validation', password: 'val123', department: '验证部', email: 'liuyang@pharma.com' },
      { id: uuidv4(), username: 'val02', name: '赵敏', role: 'validation', password: 'val123', department: '验证部', email: 'zhaomin@pharma.com' }
    ];
    const insertUser = db.prepare('INSERT INTO users (id, username, password, name, role, department, email) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((users) => {
      for (const u of users) {
        const hashedPwd = bcrypt.hashSync(u.password, 8);
        insertUser.run(u.id, u.username, hashedPwd, u.name, u.role, u.department, u.email);
      }
    });
    insertMany(defaultUsers);
  }

  const indexSqls = [
    'CREATE INDEX IF NOT EXISTS idx_deviations_status ON deviations(status)',
    'CREATE INDEX IF NOT EXISTS idx_deviations_severity ON deviations(severity)',
    'CREATE INDEX IF NOT EXISTS idx_deviations_reporter ON deviations(reporter_id)',
    'CREATE INDEX IF NOT EXISTS idx_approvals_deviation ON approvals(deviation_id)',
    'CREATE INDEX IF NOT EXISTS idx_measures_deviation ON corrective_measures(deviation_id)',
    'CREATE INDEX IF NOT EXISTS idx_measures_status ON corrective_measures(status)',
    'CREATE INDEX IF NOT EXISTS idx_measures_deadline ON corrective_measures(deadline)',
    'CREATE INDEX IF NOT EXISTS idx_validations_deviation ON validations(deviation_id)',
    'CREATE INDEX IF NOT EXISTS idx_escalations_deviation ON escalations(deviation_id)',
    'CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status)'
  ];
  const idxTransaction = db.transaction(() => {
    for (const sql of indexSqls) {
      db.exec(sql);
    }
  });
  idxTransaction();
}

initDatabase();

module.exports = db;
