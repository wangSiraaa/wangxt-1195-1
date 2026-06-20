const { queryOne, queryAll } = require('../database');

const SEVERITY = {
  MINOR: 'minor',
  MAJOR: 'major',
  CRITICAL: 'critical'
};

const STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  QA_REVIEWED: 'qa_reviewed',
  ROOT_CAUSE: 'root_cause',
  IN_ACTION: 'in_action',
  IN_VERIFICATION: 'in_verification',
  CLOSED: 'closed',
  REJECTED: 'rejected'
};

const ACTION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

const REWORK_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
};

const VERIFICATION_APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const TREND_RELATION_TYPES = {
  SAME_ROOT_CAUSE: 'same_root_cause',
  SIMILAR_PROCESS: 'similar_process',
  SAME_EQUIPMENT: 'same_equipment',
  SAME_PRODUCT: 'same_product',
  OTHER: 'other'
};

const ESCALATION_LEVELS = {
  L1: 1,
  L2: 2,
  L3: 3
};

function isMajorDeviation(severity) {
  return severity === SEVERITY.MAJOR || severity === SEVERITY.CRITICAL;
}

function validateCanEnterActionPhase(deviationId) {
  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviationId]);
  if (!deviation) {
    return { valid: false, message: '偏差不存在' };
  }

  if (isMajorDeviation(deviation.severity)) {
    const rootCauses = queryAll('SELECT * FROM root_causes WHERE deviation_id = ? AND is_confirmed = 1', [deviationId]);
    if (rootCauses.length === 0) {
      return { valid: false, message: '重大偏差必须先完成并确认根因分析才能进入措施阶段' };
    }
  }

  return { valid: true };
}

function validateCanCloseCAPA(deviationId) {
  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviationId]);
  if (!deviation) {
    return { valid: false, message: '偏差不存在' };
  }

  const actions = queryAll('SELECT * FROM capa_actions WHERE deviation_id = ?', [deviationId]);
  
  if (actions.length === 0) {
    return { valid: false, message: '没有关联的纠正预防措施，无法关闭CAPA' };
  }

  const allCompleted = actions.every(a => a.status === ACTION_STATUS.COMPLETED);
  if (!allCompleted) {
    const incomplete = actions.filter(a => a.status !== ACTION_STATUS.COMPLETED);
    return { valid: false, message: `存在${incomplete.length}项措施未完成，无法关闭CAPA` };
  }

  const verifications = queryAll('SELECT * FROM verifications WHERE deviation_id = ?', [deviationId]);
  
  if (verifications.length === 0) {
    return { valid: false, message: '未进行效果验证，无法关闭CAPA' };
  }

  const failedVerifications = verifications.filter(v => v.is_passed === 0);
  if (failedVerifications.length > 0) {
    const allHaveRework = failedVerifications.every(v => {
      const reworks = queryAll('SELECT * FROM rework_plans WHERE source_verification_id = ? AND status = ?', [v.id, REWORK_STATUS.COMPLETED]);
      return reworks.length > 0;
    });
    
    if (!allHaveRework) {
      return { 
        valid: false, 
        message: `存在${failedVerifications.length}项验证未通过且未完成再措施，无法关闭CAPA。请先处理验证不通过的项并完成再措施计划。` 
      };
    }

    const reworkActions = queryAll('SELECT * FROM capa_actions WHERE deviation_id = ? AND is_rework = 1', [deviationId]);
    const allReworkActionsCompleted = reworkActions.every(a => a.status === ACTION_STATUS.COMPLETED);
    if (!allReworkActionsCompleted) {
      return { valid: false, message: '存在再措施未完成，无法关闭CAPA' };
    }
  }

  const allPassedOrReworked = verifications.every(v => {
    if (v.is_passed === 1) return true;
    const reworks = queryAll('SELECT * FROM rework_plans WHERE source_verification_id = ? AND status = ?', [v.id, REWORK_STATUS.COMPLETED]);
    return reworks.length > 0;
  });
  
  if (!allPassedOrReworked) {
    return { valid: false, message: '存在验证未通过且未完成再措施的项目，无法关闭CAPA' };
  }

  return { valid: true };
}

function checkActionOverdue(actionId) {
  const action = queryOne('SELECT * FROM capa_actions WHERE id = ?', [actionId]);
  if (!action) {
    return { overdue: false };
  }

  if (action.status === ACTION_STATUS.COMPLETED || action.status === ACTION_STATUS.CANCELLED) {
    return { overdue: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(action.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  
  if (daysOverdue > 0) {
    return { 
      overdue: true, 
      daysOverdue,
      needEscalation: daysOverdue >= 3,
      escalationLevel: daysOverdue >= 7 ? 2 : (daysOverdue >= 3 ? 1 : 0)
    };
  }

  return { overdue: false, daysOverdue: 0 };
}

function checkAllActionsOverdue(deviationId) {
  const actions = queryAll('SELECT * FROM capa_actions WHERE deviation_id = ?', [deviationId]);
  const result = {
    totalActions: actions.length,
    overdueActions: [],
    needEscalation: []
  };

  actions.forEach(action => {
    const check = checkActionOverdue(action.id);
    if (check.overdue) {
      result.overdueActions.push({
        ...action,
        daysOverdue: check.daysOverdue
      });
    }
    if (check.needEscalation) {
      result.needEscalation.push({
        ...action,
        daysOverdue: check.daysOverdue,
        escalationLevel: check.escalationLevel
      });
    }
  });

  return result;
}

function autoEscalateOverdueActions(deviationId, escalatedByUserId) {
  const result = {
    escalated: [],
    alreadyOpen: [],
    errors: []
  };

  const actions = queryAll('SELECT * FROM capa_actions WHERE deviation_id = ?', [deviationId]);
  
  actions.forEach(action => {
    const check = checkActionOverdue(action.id);
    if (!check.needEscalation) return;

    const existingOpen = queryOne(
      "SELECT * FROM escalations WHERE action_id = ? AND status = 'open' AND escalation_type = 'overdue'",
      [action.id]
    );

    if (existingOpen) {
      result.alreadyOpen.push(action.id);
      return;
    }

    const { v4: uuidv4 } = require('uuid');
    const escalationId = uuidv4();

    const qaUser = queryOne("SELECT id FROM users WHERE role = 'qa' LIMIT 1");
    const targetUserId = qaUser ? qaUser.id : escalatedByUserId;

    const reason = `措施超期${check.daysOverdue}天未完成，系统自动升级`;

    try {
      const { runQuery } = require('../database');
      runQuery(`
        INSERT INTO escalations (id, deviation_id, action_id, escalation_type, reason, escalated_by, escalated_to, level, status, auto_generated)
        VALUES (?, ?, ?, 'overdue', ?, ?, ?, ?, 'open', 1)
      `, [escalationId, deviationId, action.id, reason, escalatedByUserId, targetUserId, check.escalationLevel]);

      const logId = uuidv4();
      runQuery(`
        INSERT INTO action_escalation_logs (id, action_id, deviation_id, escalation_type, reason, escalated_from, escalated_to, level)
        VALUES (?, ?, ?, 'overdue_auto', ?, ?, ?, ?)
      `, [logId, action.id, deviationId, reason, escalatedByUserId, targetUserId, check.escalationLevel]);

      result.escalated.push({ actionId: action.id, escalationId, level: check.escalationLevel });
    } catch (e) {
      result.errors.push({ actionId: action.id, error: e.message });
    }
  });

  return result;
}

function validateDeviationForQA(deviationId, severity) {
  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviationId]);
  if (!deviation) {
    return { valid: false, message: '偏差不存在' };
  }

  if (!Object.values(SEVERITY).includes(severity)) {
    return { valid: false, message: '无效的严重程度' };
  }

  return { valid: true };
}

function findSimilarDeviations(deviationId, options = {}) {
  const deviation = queryOne('SELECT * FROM deviations WHERE id = ?', [deviationId]);
  if (!deviation) {
    return [];
  }

  let sql = `
    SELECT DISTINCT d.*, 
           u1.name as reporter_name, 
           u2.name as qa_judge_name
    FROM deviations d
    LEFT JOIN users u1 ON d.reporter_id = u1.id
    LEFT JOIN users u2 ON d.qa_judge_id = u2.id
    WHERE d.id != ? AND d.status != 'draft'
  `;
  const params = [deviationId];

  if (options.byRootCauseCategory) {
    const rootCauses = queryAll('SELECT category FROM root_causes WHERE deviation_id = ? AND is_confirmed = 1', [deviationId]);
    if (rootCauses.length > 0) {
      const categories = rootCauses.map(rc => rc.category).filter(Boolean);
      if (categories.length > 0) {
        const placeholders = categories.map(() => '?').join(',');
        sql += ` AND d.id IN (
          SELECT DISTINCT rc2.deviation_id 
          FROM root_causes rc2 
          WHERE rc2.is_confirmed = 1 AND rc2.category IN (${placeholders})
        )`;
        params.push(...categories);
      }
    }
  }

  if (options.byProduct && deviation.product_batch) {
    sql += ' AND d.product_batch = ?';
    params.push(deviation.product_batch);
  }

  if (options.byEquipment && deviation.equipment) {
    sql += ' AND d.equipment = ?';
    params.push(deviation.equipment);
  }

  sql += ' ORDER BY d.created_at DESC LIMIT 20';

  return queryAll(sql, params);
}

function getTrendGroupInfo(groupId) {
  const group = queryOne(`
    SELECT tg.*, u.name as created_by_name
    FROM deviation_trend_groups tg
    LEFT JOIN users u ON tg.created_by = u.id
    WHERE tg.id = ?
  `, [groupId]);

  if (!group) return null;

  const members = queryAll(`
    SELECT tgm.*, d.deviation_no, d.title, d.severity, d.status, d.created_at,
           u.name as reporter_name
    FROM trend_group_members tgm
    LEFT JOIN deviations d ON tgm.deviation_id = d.id
    LEFT JOIN users u ON d.reporter_id = u.id
    WHERE tgm.group_id = ?
    ORDER BY tgm.joined_at DESC
  `, [groupId]);

  const severityCounts = members.reduce((acc, m) => {
    acc[m.severity] = (acc[m.severity] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = members.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return {
    ...group,
    members,
    memberCount: members.length,
    severityCounts,
    statusCounts
  };
}

function getDeviationTrendGroup(deviationId) {
  const member = queryOne('SELECT * FROM trend_group_members WHERE deviation_id = ?', [deviationId]);
  if (!member) return null;
  return getTrendGroupInfo(member.group_id);
}

function validateCanGenerateRework(verificationId) {
  const verification = queryOne('SELECT * FROM verifications WHERE id = ?', [verificationId]);
  if (!verification) {
    return { valid: false, message: '验证记录不存在' };
  }

  if (!verification.verified_at) {
    return { valid: false, message: '验证尚未提交结果' };
  }

  if (verification.is_passed === 1) {
    return { valid: false, message: '验证已通过，无需生成再措施' };
  }

  if (verification.rework_generated === 1) {
    const existingReworks = queryAll('SELECT * FROM rework_plans WHERE source_verification_id = ?', [verificationId]);
    if (existingReworks.length > 0) {
      return { valid: false, message: '已存在再措施计划' };
    }
  }

  return { valid: true };
}

function canUserTransitionStatus(userRole, currentStatus, targetStatus) {
  const transitions = {
    production: {
      draft: ['submitted'],
      submitted: []
    },
    qa: {
      submitted: ['qa_reviewed', 'rejected'],
      qa_reviewed: ['root_cause', 'in_action'],
      root_cause: ['in_action'],
      in_action: ['in_verification'],
      in_verification: ['closed']
    },
    validation: {
      qa_reviewed: ['root_cause', 'in_action'],
      root_cause: ['in_action'],
      in_action: ['in_verification'],
      in_verification: ['closed']
    },
    admin: {
      draft: ['submitted', 'qa_reviewed', 'root_cause', 'in_action', 'in_verification', 'closed', 'rejected'],
      submitted: ['qa_reviewed', 'rejected'],
      qa_reviewed: ['root_cause', 'in_action'],
      root_cause: ['in_action'],
      in_action: ['in_verification'],
      in_verification: ['closed']
    }
  };

  const allowed = transitions[userRole]?.[currentStatus] || [];
  return allowed.includes(targetStatus);
}

module.exports = {
  SEVERITY,
  STATUS,
  ACTION_STATUS,
  REWORK_STATUS,
  VERIFICATION_APPROVAL_STATUS,
  TREND_RELATION_TYPES,
  ESCALATION_LEVELS,
  isMajorDeviation,
  validateCanEnterActionPhase,
  validateCanCloseCAPA,
  checkActionOverdue,
  checkAllActionsOverdue,
  autoEscalateOverdueActions,
  validateDeviationForQA,
  findSimilarDeviations,
  getTrendGroupInfo,
  getDeviationTrendGroup,
  validateCanGenerateRework,
  canUserTransitionStatus
};
