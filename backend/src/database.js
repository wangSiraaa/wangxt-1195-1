const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;
const dbPath = path.join(__dirname, '..', 'data', 'capa.db');

async function initDatabase() {
  const SQL = await initSqlJs();
  
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    migrateDatabase();
    saveDatabase();
  } else {
    db = new SQL.Database();
    createTables();
    seedInitialData();
    saveDatabase();
  }

  return db;
}

function migrateDatabase() {
  try {
    const cols = db.exec("PRAGMA table_info(deviations)");
    const colNames = cols[0]?.values.map(c => c[1]) || [];
    
    if (!colNames.includes('trend_group_id')) {
      db.run('ALTER TABLE deviations ADD COLUMN trend_group_id TEXT REFERENCES deviation_trend_groups(id)');
    }
    if (!colNames.includes('trend_merged_comment')) {
      db.run('ALTER TABLE deviations ADD COLUMN trend_merged_comment TEXT');
    }
  } catch (e) { console.log('migrate deviations:', e.message); }

  try {
    const cols = db.exec("PRAGMA table_info(capa_actions)");
    const colNames = cols[0]?.values.map(c => c[1]) || [];
    
    if (!colNames.includes('is_rework')) {
      db.run('ALTER TABLE capa_actions ADD COLUMN is_rework INTEGER DEFAULT 0');
    }
    if (!colNames.includes('rework_plan_id')) {
      db.run('ALTER TABLE capa_actions ADD COLUMN rework_plan_id TEXT REFERENCES rework_plans(id)');
    }
    if (!colNames.includes('parent_action_id')) {
      db.run('ALTER TABLE capa_actions ADD COLUMN parent_action_id TEXT REFERENCES capa_actions(id)');
    }
  } catch (e) { console.log('migrate capa_actions:', e.message); }

  try {
    const cols = db.exec("PRAGMA table_info(verifications)");
    const colNames = cols[0]?.values.map(c => c[1]) || [];
    
    if (!colNames.includes('approval_status')) {
      db.run('ALTER TABLE verifications ADD COLUMN approval_status TEXT DEFAULT \'pending\'');
    }
    if (!colNames.includes('rework_generated')) {
      db.run('ALTER TABLE verifications ADD COLUMN rework_generated INTEGER DEFAULT 0');
    }
  } catch (e) { console.log('migrate verifications:', e.message); }

  try {
    const cols = db.exec("PRAGMA table_info(escalations)");
    const colNames = cols[0]?.values.map(c => c[1]) || [];
    
    if (!colNames.includes('auto_generated')) {
      db.run('ALTER TABLE escalations ADD COLUMN auto_generated INTEGER DEFAULT 0');
    }
  } catch (e) { console.log('migrate escalations:', e.message); }

  const tablesToCreate = [
    'deviation_trend_groups',
    'trend_group_members',
    'rework_plans',
    'verification_approvals',
    'action_escalation_logs'
  ];
  
  tablesToCreate.forEach(tableName => {
    try {
      const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (!result[0] || result[0].values.length === 0) {
        if (tableName === 'deviation_trend_groups') {
          db.run(`
            CREATE TABLE IF NOT EXISTS deviation_trend_groups (
              id TEXT PRIMARY KEY,
              group_name TEXT NOT NULL,
              root_cause_category TEXT,
              description TEXT,
              created_by TEXT NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
        } else if (tableName === 'trend_group_members') {
          db.run(`
            CREATE TABLE IF NOT EXISTS trend_group_members (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              deviation_id TEXT NOT NULL,
              joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
              joined_by TEXT NOT NULL,
              relation_type TEXT DEFAULT 'same_root_cause',
              comment TEXT,
              UNIQUE(group_id, deviation_id)
            )
          `);
        } else if (tableName === 'rework_plans') {
          db.run(`
            CREATE TABLE IF NOT EXISTS rework_plans (
              id TEXT PRIMARY KEY,
              deviation_id TEXT NOT NULL,
              source_verification_id TEXT NOT NULL,
              parent_action_id TEXT,
              rework_reason TEXT NOT NULL,
              plan_description TEXT NOT NULL,
              status TEXT DEFAULT 'pending',
              created_by TEXT NOT NULL,
              approved_by TEXT,
              approved_at TEXT,
              approval_comment TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
        } else if (tableName === 'verification_approvals') {
          db.run(`
            CREATE TABLE IF NOT EXISTS verification_approvals (
              id TEXT PRIMARY KEY,
              verification_id TEXT NOT NULL,
              approver_id TEXT NOT NULL,
              approval_type TEXT NOT NULL,
              decision TEXT NOT NULL,
              comment TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
        } else if (tableName === 'action_escalation_logs') {
          db.run(`
            CREATE TABLE IF NOT EXISTS action_escalation_logs (
              id TEXT PRIMARY KEY,
              action_id TEXT NOT NULL,
              deviation_id TEXT NOT NULL,
              escalation_type TEXT NOT NULL,
              reason TEXT NOT NULL,
              escalated_from TEXT NOT NULL,
              escalated_to TEXT NOT NULL,
              level INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `);
        }
      }
    } catch (e) {
      console.log(`migrate create ${tableName}:`, e.message);
    }
  });
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deviations (
      id TEXT PRIMARY KEY,
      deviation_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      product_batch TEXT,
      equipment TEXT,
      location TEXT,
      discovered_date TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      severity TEXT DEFAULT 'minor',
      status TEXT DEFAULT 'draft',
      qa_judge_id TEXT,
      qa_judge_comment TEXT,
      qa_judge_date TEXT,
      root_cause_required INTEGER DEFAULT 0,
      trend_group_id TEXT REFERENCES deviation_trend_groups(id),
      trend_merged_comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (qa_judge_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deviation_approvals (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS root_causes (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      analysis_method TEXT,
      investigator_id TEXT,
      is_confirmed INTEGER DEFAULT 0,
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (investigator_id) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS capa_actions (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      responsible_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      actual_date TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      completion_evidence TEXT,
      is_rework INTEGER DEFAULT 0,
      rework_plan_id TEXT REFERENCES rework_plans(id),
      parent_action_id TEXT REFERENCES capa_actions(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (responsible_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS action_approvals (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      action_id TEXT,
      verification_method TEXT NOT NULL,
      verification_result TEXT,
      verifier_id TEXT NOT NULL,
      verified_at TEXT,
      is_passed INTEGER,
      conclusion TEXT,
      evidence_files TEXT,
      approval_status TEXT DEFAULT 'pending',
      rework_generated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (verifier_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS escalations (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      action_id TEXT,
      escalation_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      escalated_by TEXT NOT NULL,
      escalated_to TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      status TEXT DEFAULT 'open',
      resolution TEXT,
      resolved_at TEXT,
      auto_generated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (escalated_by) REFERENCES users(id),
      FOREIGN KEY (escalated_to) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS evidences (
      id TEXT PRIMARY KEY,
      deviation_id TEXT,
      action_id TEXT,
      verification_id TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      uploaded_by TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (verification_id) REFERENCES verifications(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS close_conclusions (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      conclusion TEXT NOT NULL,
      closed_by TEXT NOT NULL,
      closed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      effectiveness_review TEXT,
      lessons_learned TEXT,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (closed_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deviation_trend_groups (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      root_cause_category TEXT,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trend_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      deviation_id TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      joined_by TEXT NOT NULL,
      relation_type TEXT DEFAULT 'same_root_cause',
      comment TEXT,
      FOREIGN KEY (group_id) REFERENCES deviation_trend_groups(id),
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (joined_by) REFERENCES users(id),
      UNIQUE(group_id, deviation_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rework_plans (
      id TEXT PRIMARY KEY,
      deviation_id TEXT NOT NULL,
      source_verification_id TEXT NOT NULL,
      parent_action_id TEXT,
      rework_reason TEXT NOT NULL,
      plan_description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_by TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      approval_comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (source_verification_id) REFERENCES verifications(id),
      FOREIGN KEY (parent_action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS verification_approvals (
      id TEXT PRIMARY KEY,
      verification_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      approval_type TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (verification_id) REFERENCES verifications(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS action_escalation_logs (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      deviation_id TEXT NOT NULL,
      escalation_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      escalated_from TEXT NOT NULL,
      escalated_to TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (action_id) REFERENCES capa_actions(id),
      FOREIGN KEY (deviation_id) REFERENCES deviations(id),
      FOREIGN KEY (escalated_from) REFERENCES users(id),
      FOREIGN KEY (escalated_to) REFERENCES users(id)
    )
  `);
}

function seedInitialData() {
  const users = [
    { id: 'u1', username: 'production1', password: bcrypt.hashSync('123456', 10), name: '张伟', role: 'production', department: '生产一车间' },
    { id: 'u2', username: 'production2', password: bcrypt.hashSync('123456', 10), name: '李芳', role: 'production', department: '生产二车间' },
    { id: 'u3', username: 'qa1', password: bcrypt.hashSync('123456', 10), name: '王磊', role: 'qa', department: '质量保证部' },
    { id: 'u4', username: 'qa2', password: bcrypt.hashSync('123456', 10), name: '赵敏', role: 'qa', department: '质量保证部' },
    { id: 'u5', username: 'validation1', password: bcrypt.hashSync('123456', 10), name: '刘洋', role: 'validation', department: '验证工程部' },
    { id: 'u6', username: 'validation2', password: bcrypt.hashSync('123456', 10), name: '陈静', role: 'validation', department: '验证工程部' },
    { id: 'u7', username: 'admin', password: bcrypt.hashSync('123456', 10), name: '系统管理员', role: 'admin', department: '信息部' }
  ];

  const stmt = db.prepare('INSERT INTO users (id, username, password, name, role, department) VALUES (?, ?, ?, ?, ?, ?)');
  users.forEach(u => {
    stmt.run([u.id, u.username, u.password, u.name, u.role, u.department]);
  });
  stmt.free();
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

function runQuery(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  saveDatabase();
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

module.exports = {
  initDatabase,
  getDb,
  saveDatabase,
  runQuery,
  queryAll,
  queryOne
};
