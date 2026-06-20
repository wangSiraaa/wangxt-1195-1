import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Tabs, Table, Modal, Form, Input, Select,
  DatePicker, Upload, message, Timeline, List, Avatar, Popconfirm, Row, Col, Radio, Divider
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, UploadOutlined, CheckOutlined,
  WarningOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore, useUserStore } from '../stores/auth';
import dayjs from 'dayjs';

const severityColor = { minor: 'blue', major: 'orange', critical: 'red' };
const severityName = { minor: '轻微', major: '重大', critical: '严重' };
const statusColor = {
  draft: 'default', submitted: 'blue', qa_reviewed: 'cyan',
  root_cause: 'purple', in_action: 'orange', in_verification: 'gold',
  closed: 'green', rejected: 'red'
};
const statusName = {
  draft: '草稿', submitted: '已提交', qa_reviewed: 'QA已判定',
  root_cause: '根因分析中', in_action: '措施执行中', in_verification: '效果验证中',
  closed: '已关闭', rejected: '已驳回'
};

const actionTypeNames = { correction: '纠正', corrective: '纠正措施', preventive: '预防措施' };
const actionStatusNames = { pending: '待处理', in_progress: '执行中', completed: '已完成', overdue: '已超期', cancelled: '已取消' };
const actionStatusColors = { pending: 'default', in_progress: 'blue', completed: 'green', overdue: 'red', cancelled: 'default' };
const escalationTypeNames = { overdue: '超期升级', technical: '技术问题', resource: '资源问题', decision: '决策请求', other: '其他' };

const DeviationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { fetchUsersByRole } = useUserStore();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [rootCauseModal, setRootCauseModal] = useState(false);
  const [qaJudgeModal, setQaJudgeModal] = useState(false);
  const [actionModal, setActionModal] = useState(false);
  const [verificationModal, setVerificationModal] = useState(false);
  const [escalationModal, setEscalationModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [completeActionModal, setCompleteActionModal] = useState(false);
  const [currentAction, setCurrentAction] = useState(null);
  const [trendGroupModal, setTrendGroupModal] = useState(false);
  const [similarDeviationsModal, setSimilarDeviationsModal] = useState(false);
  const [similarDeviations, setSimilarDeviations] = useState([]);
  const [reworkPlanModal, setReworkPlanModal] = useState(false);
  const [currentVerification, setCurrentVerification] = useState(null);
  const [reworkActionModal, setReworkActionModal] = useState(false);
  const [currentReworkPlan, setCurrentReworkPlan] = useState(null);
  const [trendGroupForm, similarForm, reworkForm, reworkActionForm] = [
    Form.useForm(), Form.useForm(), Form.useForm(), Form.useForm()
  ];

  const [rcForm, qaForm, actionForm, verifyForm, escForm, closeForm, completeForm] = [
    Form.useForm(), Form.useForm(), Form.useForm(), Form.useForm(), Form.useForm(), Form.useForm(), Form.useForm()
  ];
  const [qaUsers, setQaUsers] = useState([]);
  const [validationUsers, setValidationUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    fetchDetail();
    loadUsers();
  }, [id]);

  const loadUsers = async () => {
    try {
      const [qa, validation, all] = await Promise.all([
        fetchUsersByRole('qa'),
        fetchUsersByRole('validation'),
        api.get('/auth/users')
      ]);
      setQaUsers(qa);
      setValidationUsers(validation);
      setAllUsers(all.data.users || []);
    } catch (e) {}
  };

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/deviations/${id}`);
      setDetail(response.data);
    } catch (error) {
      console.error('获取详情失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQAJudge = async (values) => {
    try {
      await api.post(`/deviations/${id}/qa-judge`, values);
      message.success('QA判定成功');
      setQaJudgeModal(false);
      qaForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleAddRootCause = async (values) => {
    try {
      await api.post('/root-causes', { ...values, deviation_id: id });
      message.success('根因分析添加成功');
      setRootCauseModal(false);
      rcForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleConfirmRootCause = async (rcId) => {
    try {
      await api.post(`/root-causes/${rcId}/confirm`);
      message.success('根因已确认');
      fetchDetail();
    } catch (e) {}
  };

  const handleAddAction = async (values) => {
    try {
      const payload = {
        ...values,
        deviation_id: id,
        due_date: values.due_date?.format('YYYY-MM-DD')
      };
      await api.post('/actions', payload);
      message.success('措施添加成功');
      setActionModal(false);
      actionForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleStartAction = async (actionId) => {
    try {
      await api.post(`/actions/${actionId}/start`);
      message.success('已开始执行');
      fetchDetail();
    } catch (e) {}
  };

  const handleCompleteAction = async (values) => {
    try {
      await api.post(`/actions/${currentAction.id}/complete`, values);
      message.success('措施完成');
      setCompleteActionModal(false);
      setCurrentAction(null);
      completeForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleEnterAction = async () => {
    try {
      await api.post(`/deviations/${id}/enter-action`);
      message.success('已进入措施阶段');
      fetchDetail();
    } catch (e) {}
  };

  const handleEnterVerification = async () => {
    try {
      await api.post(`/deviations/${id}/enter-verification`);
      message.success('已进入验证阶段');
      fetchDetail();
    } catch (e) {}
  };

  const handleAddVerification = async (values) => {
    try {
      await api.post('/verifications', { ...values, deviation_id: id });
      message.success('验证记录添加成功');
      setVerificationModal(false);
      verifyForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleSubmitVerification = async (vId, values) => {
    try {
      await api.post(`/verifications/${vId}/submit`, values);
      message.success('验证结果提交成功');
      fetchDetail();
    } catch (e) {}
  };

  const handleAddEscalation = async (values) => {
    try {
      await api.post('/escalations', { ...values, deviation_id: id });
      message.success('升级记录添加成功');
      setEscalationModal(false);
      escForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleResolveEscalation = async (eId) => {
    Modal.confirm({
      title: '解决升级',
      content: (
        <Input.TextArea id="escalation-resolution" rows={4} placeholder="请输入解决方案" />
      ),
      onOk: async () => {
        const resolution = document.getElementById('escalation-resolution').value;
        if (!resolution) {
          message.error('请输入解决方案');
          return Promise.reject();
        }
        try {
          await api.post(`/escalations/${eId}/resolve`, { resolution });
          message.success('升级已解决');
          fetchDetail();
        } catch (e) {
          return Promise.reject();
        }
      }
    });
  };

  const handleCloseCAPA = async (values) => {
    try {
      await api.post(`/deviations/${id}/close`, values);
      message.success('CAPA已关闭');
      setCloseModal(false);
      closeForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleFindSimilar = async () => {
    try {
      const response = await api.get(`/deviations/${id}/similar`, {
        params: { by_root_cause: true, by_product: true, by_equipment: true }
      });
      setSimilarDeviations(response.data.similar_devations || []);
      setSimilarDeviationsModal(true);
    } catch (e) {}
  };

  const handleCreateTrendGroup = async (values) => {
    try {
      const response = await api.post('/trend-groups', values);
      const groupId = response.data.group.id;
      await api.post(`/trend-groups/${groupId}/members`, {
        deviation_id: id,
        relation_type: 'same_root_cause',
        comment: values.comment
      });
      message.success('趋势组创建成功并已加入当前偏差');
      setTrendGroupModal(false);
      trendGroupForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleJoinTrendGroup = async (groupId) => {
    try {
      await api.post(`/trend-groups/${groupId}/members`, {
        deviation_id: id,
        relation_type: 'same_root_cause'
      });
      message.success('已加入趋势组');
      setSimilarDeviationsModal(false);
      fetchDetail();
    } catch (e) {}
  };

  const handleLeaveTrendGroup = async () => {
    const groupId = detail?.trendGroup?.id;
    if (!groupId) return;
    try {
      await api.delete(`/trend-groups/${groupId}/members/${id}`);
      message.success('已退出趋势组');
      fetchDetail();
    } catch (e) {}
  };

  const handleCreateReworkPlan = async (values) => {
    try {
      const payload = {
        ...values,
        deviation_id: id,
        source_verification_id: currentVerification?.id,
        parent_action_id: currentVerification?.action_id
      };
      await api.post('/rework-plans', payload);
      message.success('再措施计划创建成功');
      setReworkPlanModal(false);
      setCurrentVerification(null);
      reworkForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleApproveReworkPlan = async (planId, approved, comment) => {
    try {
      if (approved) {
        await api.post(`/rework-plans/${planId}/approve`, { approval_comment: comment });
        message.success('再措施计划审批通过');
      } else {
        await api.post(`/rework-plans/${planId}/reject`, { approval_comment: comment });
        message.success('已驳回再措施计划');
      }
      fetchDetail();
    } catch (e) {}
  };

  const handleStartReworkPlan = async (planId) => {
    try {
      await api.post(`/rework-plans/${planId}/start`);
      message.success('再措施计划已开始执行');
      fetchDetail();
    } catch (e) {}
  };

  const handleCompleteReworkPlan = async (planId) => {
    try {
      await api.post(`/rework-plans/${planId}/complete`);
      message.success('再措施计划已完成');
      fetchDetail();
    } catch (e) {}
  };

  const handleAddReworkAction = async (values) => {
    try {
      const payload = {
        ...values,
        deviation_id: id,
        due_date: values.due_date?.format('YYYY-MM-DD'),
        is_rework: true,
        rework_plan_id: currentReworkPlan?.id,
        parent_action_id: currentVerification?.action_id
      };
      await api.post('/actions', payload);
      message.success('再措施添加成功');
      setReworkActionModal(false);
      setCurrentReworkPlan(null);
      reworkActionForm.resetFields();
      fetchDetail();
    } catch (e) {}
  };

  const handleAutoEscalate = async () => {
    try {
      const response = await api.post(`/deviations/${id}/auto-escalate`);
      const { escalated, alreadyOpen, errors } = response.data;
      if (escalated?.length > 0) {
        message.success(`已自动升级 ${escalated.length} 项超期措施`);
      } else if (alreadyOpen?.length > 0) {
        message.info('已有未处理的升级记录');
      } else {
        message.info('暂无需升级的措施');
      }
      fetchDetail();
    } catch (e) {}
  };

  const canQAJudge = (user?.role === 'qa' || user?.role === 'admin') && detail?.deviation?.status === 'submitted';
  const canAddRootCause = ['qa', 'validation', 'admin'].includes(user?.role) && ['qa_reviewed', 'root_cause', 'in_action'].includes(detail?.deviation?.status);
  const canConfirmRootCause = (user?.role === 'qa' || user?.role === 'admin');
  const canAddAction = ['qa', 'validation', 'admin'].includes(user?.role) && ['qa_reviewed', 'root_cause', 'in_action'].includes(detail?.deviation?.status);
  const canEnterAction = ['qa', 'validation', 'admin'].includes(user?.role) && ['qa_reviewed', 'root_cause'].includes(detail?.deviation?.status);
  const canEnterVerification = ['qa', 'validation', 'admin'].includes(user?.role) && detail?.deviation?.status === 'in_action';
  const canAddVerification = ['qa', 'validation', 'admin'].includes(user?.role) && ['in_action', 'in_verification'].includes(detail?.deviation?.status);
  const canClose = (user?.role === 'qa' || user?.role === 'admin') && detail?.deviation?.status === 'in_verification';

  const d = detail?.deviation;

  const rootCauseColumns = [
    { title: '描述', dataIndex: 'description' },
    { title: '分类', dataIndex: 'category', width: 120 },
    { title: '调查人', dataIndex: 'investigator_name', width: 100 },
    { title: '状态', dataIndex: 'is_confirmed', width: 100, render: (v) => v ? <Tag color="green">已确认</Tag> : <Tag color="orange">待确认</Tag> },
    { title: '操作', width: 150, render: (_, r) => (
      <Space>
        {!r.is_confirmed && canConfirmRootCause && (
          <Popconfirm title="确认此根因？" onConfirm={() => handleConfirmRootCause(r.id)}>
            <Button type="link" size="small">确认</Button>
          </Popconfirm>
        )}
      </Space>
    )}
  ];

  const actionColumns = [
    { title: '类型', dataIndex: 'action_type', width: 100, render: (v) => actionTypeNames[v] },
    { title: '描述', dataIndex: 'description' },
    { title: '责任人', dataIndex: 'responsible_name', width: 100 },
    { title: '截止日期', dataIndex: 'due_date', width: 120, render: (v) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '状态', width: 100, dataIndex: 'status',
      render: (v, r) => (
        <Space>
          <Tag color={actionStatusColors[v]}>{actionStatusNames[v]}</Tag>
          {r.overdue_check?.overdue && <Tag color="red" icon={<WarningOutlined />}>超期{r.overdue_check.daysOverdue}天</Tag>}
        </Space>
      )
    },
    {
      title: '操作', width: 200, render: (_, r) => (
        <Space size="small">
          {(r.status === 'pending' || r.status === 'overdue') && (r.responsible_id === user?.id || ['admin', 'qa'].includes(user?.role)) && (
            <Button type="link" size="small" onClick={() => handleStartAction(r.id)}>开始</Button>
          )}
          {(r.status === 'in_progress' || r.status === 'overdue') && (r.responsible_id === user?.id || ['admin', 'qa'].includes(user?.role)) && (
            <Button type="link" size="small" onClick={() => { setCurrentAction(r); setCompleteActionModal(true); }}>完成</Button>
          )}
        </Space>
      )
    }
  ];

  const verificationColumns = [
    { title: '验证方法', dataIndex: 'verification_method' },
    { title: '验证人', dataIndex: 'verifier_name', width: 100 },
    {
      title: '结果', dataIndex: 'is_passed', width: 100,
      render: (v) => v === null ? <Tag color="default">待验证</Tag> : (v ? <Tag color="green">通过</Tag> : <Tag color="red">不通过</Tag>)
    },
    { title: '验证时间', dataIndex: 'verified_at', width: 160, render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作', width: 200, render: (_, r) => (
        <Space size="small">
          {!r.verified_at && (r.verifier_id === user?.id || ['validation', 'qa', 'admin'].includes(user?.role)) && (
            <Button type="link" size="small" onClick={() => {
              Modal.confirm({
                title: '提交验证结果',
                content: (
                  <div style={{ padding: '12px 0' }}>
                    <Form layout="vertical">
                      <Form.Item label="验证结果描述">
                        <Input.TextArea id="verify-result" rows={3} placeholder="请描述验证结果" />
                      </Form.Item>
                      <Form.Item label="是否通过" required>
                        <Radio.Group id="verify-passed">
                          <Radio value={1}>通过</Radio>
                          <Radio value={0}>不通过</Radio>
                        </Radio.Group>
                      </Form.Item>
                      <Form.Item label="结论">
                        <Input.TextArea id="verify-conclusion" rows={2} placeholder="请输入结论" />
                      </Form.Item>
                    </Form>
                  </div>
                ),
                onOk: async () => {
                  const passed = document.querySelector('#verify-passed input:checked')?.value;
                  if (passed === undefined) {
                    message.error('请选择是否通过');
                    return Promise.reject();
                  }
                  try {
                    await handleSubmitVerification(r.id, {
                      verification_result: document.getElementById('verify-result').value,
                      is_passed: parseInt(passed),
                      conclusion: document.getElementById('verify-conclusion').value
                    });
                  } catch (e) {
                    return Promise.reject();
                  }
                }
              });
            }}>提交结果</Button>
          )}
          {r.verified_at && r.is_passed === 0 && ['qa', 'validation', 'admin'].includes(user?.role) && detail?.deviation?.status !== 'closed' && (
            <Button 
              type="link" 
              size="small" 
              danger
              onClick={() => {
                setCurrentVerification(r);
                setReworkPlanModal(true);
              }}
            >
              生成再措施
            </Button>
          )}
        </Space>
      )
    }
  ];

  const escalationColumns = [
    { title: '类型', dataIndex: 'escalation_type', width: 100, render: (v) => escalationTypeNames[v] },
    { title: '原因', dataIndex: 'reason' },
    { title: '发起人', dataIndex: 'escalated_by_name', width: 100 },
    { title: '处理人', dataIndex: 'escalated_to_name', width: 100 },
    { title: '级别', dataIndex: 'level', width: 80, render: (v) => `L${v}` },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => v === 'open' ? <Tag color="red">待处理</Tag> : <Tag color="green">已解决</Tag> },
    {
      title: '操作', width: 120, render: (_, r) => (
        <Space>
          {r.status === 'open' && (
            <Button type="link" size="small" onClick={() => handleResolveEscalation(r.id)}>解决</Button>
          )}
        </Space>
      )
    }
  ];

  const approvalTimeline = (detail?.approvals || []).slice().reverse().map(a => ({
    color: a.decision === 'approved' ? 'green' : 'red',
    children: (
      <div className="timeline-item-content">
        <div style={{ fontWeight: 600 }}>{a.approver_name}</div>
        <div style={{ color: '#666' }}>{a.approval_type} - {a.decision === 'approved' ? '通过' : '驳回'}</div>
        {a.comment && <div style={{ color: '#888' }}>{a.comment}</div>}
        <div style={{ color: '#999', fontSize: 12 }}>{dayjs(a.created_at).format('YYYY-MM-DD HH:mm')}</div>
      </div>
    )
  }));

  return (
    <div className="page-container">
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/deviations')}>返回</Button>
        <h2 style={{ margin: 0 }}>偏差详情</h2>
        {d && <Tag color={statusColor[d.status]} style={{ fontSize: 14, padding: '4px 12px' }}>{statusName[d.status]}</Tag>}
      </Space>

      {detail?.overdueCheck?.overdueActions?.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: '#ffccc7', background: '#fff2f0' }}>
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
              警告：有 {detail.overdueCheck.overdueActions.length} 项措施已超期，
              {detail.overdueCheck.needEscalation.length > 0 && `${detail.overdueCheck.needEscalation.length} 项需要升级处理`}
            </span>
          </Space>
        </Card>
      )}

      {d && (
        <Card style={{ marginBottom: 16 }}>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="偏差编号">{d.deviation_no}</Descriptions.Item>
            <Descriptions.Item label="严重程度">
              <Tag color={severityColor[d.severity]}>{severityName[d.severity]}</Tag>
              {d.root_cause_required ? <Tag color="orange">需根因分析</Tag> : null}
            </Descriptions.Item>
            <Descriptions.Item label="标题" span={2}>{d.title}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{d.description}</Descriptions.Item>
            <Descriptions.Item label="产品/批次">{d.product_batch || '-'}</Descriptions.Item>
            <Descriptions.Item label="发现日期">{dayjs(d.discovered_date).format('YYYY-MM-DD')}</Descriptions.Item>
            <Descriptions.Item label="设备">{d.equipment || '-'}</Descriptions.Item>
            <Descriptions.Item label="地点">{d.location || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交人">{d.reporter_name}</Descriptions.Item>
            <Descriptions.Item label="QA判定人">{d.qa_judge_name || '-'}</Descriptions.Item>
            {d.qa_judge_comment && (
              <Descriptions.Item label="QA判定意见" span={2}>{d.qa_judge_comment}</Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          <Space wrap>
            {canQAJudge && <Button type="primary" onClick={() => setQaJudgeModal(true)}>QA判定严重程度</Button>}
            {canEnterAction && <Button type="primary" onClick={handleEnterAction}>进入措施阶段</Button>}
            {canEnterVerification && <Button type="primary" onClick={handleEnterVerification}>进入验证阶段</Button>}
            {canClose && <Button type="primary" danger onClick={() => setCloseModal(true)}>关闭CAPA</Button>}
            {canAddRootCause && <Button onClick={() => setRootCauseModal(true)} icon={<PlusOutlined />}>添加根因分析</Button>}
            {canAddAction && <Button onClick={() => setActionModal(true)} icon={<PlusOutlined />}>添加措施</Button>}
            {canAddVerification && <Button onClick={() => setVerificationModal(true)} icon={<PlusOutlined />}>添加验证</Button>}
            {['qa', 'admin'].includes(user?.role) && (
              <Button onClick={handleFindSimilar} icon={<WarningOutlined />}>查找相似偏差</Button>
            )}
            {!detail?.trendGroup && ['qa', 'admin'].includes(user?.role) && detail?.deviation?.status !== 'draft' && (
              <Button onClick={() => setTrendGroupModal(true)} icon={<PlusOutlined />}>创建趋势组</Button>
            )}
            {detail?.overdueCheck?.needEscalation?.length > 0 && ['qa', 'admin'].includes(user?.role) && (
              <Button type="primary" danger onClick={handleAutoEscalate} icon={<ExclamationCircleOutlined />}>
                超期自动升级
              </Button>
            )}
            <Button onClick={() => setEscalationModal(true)} icon={<WarningOutlined />}>发起升级</Button>
          </Space>
        </Card>
      )}

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: '审批流程',
              children: (
                <Timeline items={approvalTimeline.length > 0 ? approvalTimeline : [{ color: 'gray', children: '暂无审批记录' }]} />
              )
            },
            {
              key: 'root-causes',
              label: `根因分析 (${detail?.rootCauses?.length || 0})`,
              children: (
                <Table
                  columns={rootCauseColumns}
                  dataSource={detail?.rootCauses || []}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )
            },
            {
              key: 'actions',
              label: `纠正预防措施 (${detail?.actions?.length || 0})`,
              children: (
                <Table
                  columns={actionColumns}
                  dataSource={detail?.actions || []}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )
            },
            {
              key: 'verifications',
              label: `效果验证 (${detail?.verifications?.length || 0})`,
              children: (
                <Table
                  columns={verificationColumns}
                  dataSource={detail?.verifications || []}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )
            },
            {
              key: 'escalations',
              label: `升级记录 (${detail?.escalations?.length || 0})`,
              children: (
                <Table
                  columns={escalationColumns}
                  dataSource={detail?.escalations || []}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              )
            },
            {
              key: 'evidences',
              label: `证据文件 (${detail?.evidences?.length || 0})`,
              children: (
                <div>
                  <Upload
                    action="/api/evidences/upload"
                    headers={{ Authorization: `Bearer ${localStorage.getItem('capa_token')}` }}
                    data={{ deviation_id: id }}
                    showUploadList={false}
                    onChange={(info) => {
                      if (info.file.status === 'done') {
                        message.success('上传成功');
                        fetchDetail();
                      } else if (info.file.status === 'error') {
                        message.error('上传失败');
                      }
                    }}
                  >
                    <Button icon={<UploadOutlined />}>上传证据</Button>
                  </Upload>
                  <Divider />
                  <List
                    dataSource={detail?.evidences || []}
                    locale={{ emptyText: '暂无证据文件' }}
                    renderItem={(item) => (
                      <div className="evidence-item" key={item.id}>
                        <Space>
                          <Avatar icon={<UploadOutlined />} />
                          <div>
                            <div>{item.file_name}</div>
                            <div style={{ color: '#999', fontSize: 12 }}>
                              上传人: {item.uploaded_by_name} | {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                            </div>
                          </div>
                        </Space>
                        <Space>
                          <Button type="link" size="small">
                            <a href={`/api/evidences/${item.id}/download`} target="_blank" rel="noreferrer">下载</a>
                          </Button>
                        </Space>
                      </div>
                    )}
                  />
                </div>
              )
            },
            {
              key: 'trend',
              label: '趋势分析',
              children: (
                <div>
                  {detail?.trendGroup ? (
                    <div>
                      <Card style={{ marginBottom: 16 }} title="趋势组信息">
                        <Descriptions bordered column={2} size="small">
                          <Descriptions.Item label="组名称">{detail.trendGroup.group_name}</Descriptions.Item>
                          <Descriptions.Item label="成员数量">{detail.trendGroup.memberCount} 个偏差</Descriptions.Item>
                          <Descriptions.Item label="根因分类">{detail.trendGroup.root_cause_category || '-'}</Descriptions.Item>
                          <Descriptions.Item label="创建人">{detail.trendGroup.created_by_name}</Descriptions.Item>
                          {detail.trendGroup.description && (
                            <Descriptions.Item label="描述" span={2}>{detail.trendGroup.description}</Descriptions.Item>
                          )}
                        </Descriptions>
                        {['qa', 'admin'].includes(user?.role) && (
                          <div style={{ marginTop: 12 }}>
                            <Popconfirm title="确认退出该趋势组？" onConfirm={handleLeaveTrendGroup}>
                              <Button danger size="small">退出趋势组</Button>
                            </Popconfirm>
                          </div>
                        )}
                      </Card>
                      <Card title="同组偏差（合并趋势，保留独立证据）">
                        <Table
                          dataSource={detail.trendGroup.members || []}
                          rowKey="id"
                          size="small"
                          pagination={false}
                          columns={[
                            { title: '偏差编号', dataIndex: 'deviation_no', width: 160 },
                            { title: '标题', dataIndex: 'title' },
                            { title: '严重程度', dataIndex: 'severity', width: 100, 
                              render: (v) => <Tag color={severityColor[v]}>{severityName[v]}</Tag> 
                            },
                            { title: '状态', dataIndex: 'status', width: 120, 
                              render: (v) => <Tag color={statusColor[v]}>{statusName[v]}</Tag> 
                            },
                            { title: '提交人', dataIndex: 'reporter_name', width: 100 },
                            { title: '加入时间', dataIndex: 'joined_at', width: 160, 
                              render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' 
                            },
                            { title: '操作', width: 100, render: (_, r) => (
                              <Button type="link" size="small" onClick={() => navigate(`/deviations/${r.deviation_id}`)}>
                                查看
                              </Button>
                            )}
                          ]}
                        />
                      </Card>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
                      <div style={{ marginBottom: 12 }}>当前偏差尚未加入任何趋势组</div>
                      {['qa', 'admin'].includes(user?.role) && detail?.deviation?.status !== 'draft' && (
                        <Space>
                          <Button type="primary" onClick={handleFindSimilar}>查找相似偏差</Button>
                          <Button onClick={() => setTrendGroupModal(true)}>创建趋势组</Button>
                        </Space>
                      )}
                    </div>
                  )}
                </div>
              )
            },
            {
              key: 'rework',
              label: `再措施计划 (${detail?.reworkPlans?.length || 0})`,
              children: (
                <div>
                  {detail?.reworkPlans?.length > 0 ? (
                    detail.reworkPlans.map((plan, idx) => (
                      <Card 
                        key={plan.id} 
                        style={{ marginBottom: 16 }}
                        title={
                          <Space>
                            <span>再措施计划 #{idx + 1}</span>
                            <Tag color={plan.status === 'completed' ? 'green' : plan.status === 'approved' ? 'blue' : plan.status === 'rejected' ? 'red' : 'orange'}>
                              {plan.status === 'pending' ? '待审批' : plan.status === 'approved' ? '已通过' : plan.status === 'rejected' ? '已驳回' : plan.status === 'in_progress' ? '执行中' : '已完成'}
                            </Tag>
                          </Space>
                        }
                        extra={
                          <Space size="small">
                            {plan.status === 'pending' && ['qa', 'admin'].includes(user?.role) && (
                              <>
                                <Popconfirm 
                                  title="审批通过该再措施计划？"
                                  onConfirm={() => handleApproveReworkPlan(plan.id, true, '')}
                                >
                                  <Button type="primary" size="small">通过</Button>
                                </Popconfirm>
                                <Button size="small" danger onClick={() => {
                                  Modal.confirm({
                                    title: '驳回再措施计划',
                                    content: (
                                      <Input.TextArea id="rework-reject-comment" rows={3} placeholder="请输入驳回原因" />
                                    ),
                                    onOk: () => {
                                      const comment = document.getElementById('rework-reject-comment').value;
                                      return handleApproveReworkPlan(plan.id, false, comment);
                                    }
                                  });
                                }}>驳回</Button>
                              </>
                            )}
                            {plan.status === 'approved' && (
                              <Button size="small" type="primary" onClick={() => handleStartReworkPlan(plan.id)}>
                                开始执行
                              </Button>
                            )}
                            {plan.status === 'in_progress' && (
                              <Button size="small" type="primary" onClick={() => handleCompleteReworkPlan(plan.id)}>
                                完成计划
                              </Button>
                            )}
                            {['approved', 'in_progress'].includes(plan.status) && (
                              <Button 
                                size="small" 
                                onClick={() => {
                                  setCurrentReworkPlan(plan);
                                  setReworkActionModal(true);
                                }}
                              >
                                添加再措施
                              </Button>
                            )}
                          </Space>
                        }
                      >
                        <Descriptions bordered column={2} size="small">
                          <Descriptions.Item label="再措施原因" span={2}>{plan.rework_reason}</Descriptions.Item>
                          <Descriptions.Item label="计划描述" span={2}>{plan.plan_description}</Descriptions.Item>
                          <Descriptions.Item label="源验证方法">{plan.source_verification_method}</Descriptions.Item>
                          <Descriptions.Item label="创建人">{plan.created_by_name}</Descriptions.Item>
                          {plan.approved_by_name && (
                            <>
                              <Descriptions.Item label="审批人">{plan.approved_by_name}</Descriptions.Item>
                              <Descriptions.Item label="审批时间">{plan.approved_at ? dayjs(plan.approved_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
                              {plan.approval_comment && (
                                <Descriptions.Item label="审批意见" span={2}>{plan.approval_comment}</Descriptions.Item>
                              )}
                            </>
                          )}
                        </Descriptions>
                        {plan.rework_actions && plan.rework_actions.length > 0 && (
                          <>
                            <Divider orientation="left">再措施列表</Divider>
                            <Table
                              dataSource={plan.rework_actions}
                              rowKey="id"
                              size="small"
                              pagination={false}
                              columns={[
                                { title: '类型', dataIndex: 'action_type', width: 100, render: (v) => actionTypeNames[v] },
                                { title: '描述', dataIndex: 'description' },
                                { title: '责任人', dataIndex: 'responsible_name', width: 100 },
                                { title: '截止日期', dataIndex: 'due_date', width: 120, render: (v) => dayjs(v).format('YYYY-MM-DD') },
                                { title: '状态', dataIndex: 'status', width: 100, 
                                  render: (v) => <Tag color={actionStatusColors[v]}>{actionStatusNames[v]}</Tag> 
                                },
                                {
                                  title: '操作', width: 150, render: (_, r) => (
                                    <Space size="small">
                                      {(r.status === 'pending' || r.status === 'overdue') && r.responsible_id === user?.id && (
                                        <Button type="link" size="small" onClick={() => handleStartAction(r.id)}>开始</Button>
                                      )}
                                      {(r.status === 'in_progress' || r.status === 'overdue') && r.responsible_id === user?.id && (
                                        <Button type="link" size="small" onClick={() => { setCurrentAction(r); setCompleteActionModal(true); }}>完成</Button>
                                      )}
                                    </Space>
                                  )
                                }
                              ]}
                            />
                          </>
                        )}
                      </Card>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
                      <div style={{ marginBottom: 12 }}>暂无再措施计划</div>
                      <div style={{ fontSize: 12 }}>验证不通过时可生成再措施计划</div>
                    </div>
                  )}
                </div>
              )
            },
            {
              key: 'verification-approvals',
              label: `验证审批痕迹 (${detail?.verificationApprovals?.length || 0})`,
              children: (
                <div>
                  {detail?.verificationApprovals?.length > 0 ? (
                    <Table
                      dataSource={detail.verificationApprovals}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: '审批类型', dataIndex: 'approval_type', width: 150, 
                          render: (v) => {
                            const types = {
                              'rework_create': '生成再措施',
                              'rework_approve': '再措施审批通过',
                              'rework_reject': '再措施审批驳回'
                            };
                            return types[v] || v;
                          }
                        },
                        { title: '决策', dataIndex: 'decision', width: 100,
                          render: (v) => v === 'approved' ? <Tag color="green">通过</Tag> : <Tag color="red">驳回</Tag>
                        },
                        { title: '审批人', dataIndex: 'approver_name', width: 100 },
                        { title: '审批时间', dataIndex: 'created_at', width: 160, 
                          render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') 
                        },
                        { title: '意见', dataIndex: 'comment' }
                      ]}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>暂无验证审批痕迹</div>
                  )}
                </div>
              )
            },
            {
              key: 'close',
              label: '关闭结论',
              children: detail?.closeConclusion ? (
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="结论">{detail.closeConclusion.conclusion}</Descriptions.Item>
                  <Descriptions.Item label="有效性评审">{detail.closeConclusion.effectiveness_review || '-'}</Descriptions.Item>
                  <Descriptions.Item label="经验教训">{detail.closeConclusion.lessons_learned || '-'}</Descriptions.Item>
                  <Descriptions.Item label="关闭人">{detail.closeConclusion.closed_by_name}</Descriptions.Item>
                  <Descriptions.Item label="关闭时间">{dayjs(detail.closeConclusion.closed_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                </Descriptions>
              ) : <div style={{ color: '#999', padding: 24, textAlign: 'center' }}>尚未关闭</div>
            }
          ]}
        />
      </Card>

      {/* QA判定 Modal */}
      <Modal title="QA判定严重程度" open={qaJudgeModal} onCancel={() => setQaJudgeModal(false)} footer={null} width={500}>
        <Form form={qaForm} layout="vertical" onFinish={handleQAJudge}>
          <Form.Item name="severity" label="严重程度" rules={[{ required: true }]}>
            <Select options={severityOptions} />
          </Form.Item>
          <Form.Item name="comment" label="判定意见">
            <Input.TextArea rows={3} placeholder="请输入判定意见" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setQaJudgeModal(false)}>取消</Button><Button type="primary" htmlType="submit">确定</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 根因分析 Modal */}
      <Modal title="添加根因分析" open={rootCauseModal} onCancel={() => setRootCauseModal(false)} footer={null} width={500}>
        <Form form={rcForm} layout="vertical" onFinish={handleAddRootCause}>
          <Form.Item name="description" label="根因描述" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="请描述根本原因" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="分类">
                <Select options={[
                  { value: '人员', label: '人员' },
                  { value: '设备', label: '设备' },
                  { value: '物料', label: '物料' },
                  { value: '方法', label: '方法' },
                  { value: '环境', label: '环境' },
                  { value: '其他', label: '其他' }
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="investigator_id" label="调查人">
                <Select options={(allUsers || []).map(u => ({ value: u.id, label: u.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="analysis_method" label="分析方法">
            <Input placeholder="如：5Why、鱼骨图等" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setRootCauseModal(false)}>取消</Button><Button type="primary" htmlType="submit">确定</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 措施 Modal */}
      <Modal title="添加纠正预防措施" open={actionModal} onCancel={() => setActionModal(false)} footer={null} width={550}>
        <Form form={actionForm} layout="vertical" onFinish={handleAddAction}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="action_type" label="措施类型" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'correction', label: '纠正' },
                  { value: 'corrective', label: '纠正措施' },
                  { value: 'preventive', label: '预防措施' }
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="优先级" initialValue="medium">
                <Select options={[
                  { value: 'high', label: '高' },
                  { value: 'medium', label: '中' },
                  { value: 'low', label: '低' }
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="措施描述" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请详细描述措施内容" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="responsible_id" label="责任人" rules={[{ required: true }]}>
                <Select options={(allUsers || []).map(u => ({ value: u.id, label: `${u.name}(${u.department || u.role})` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="due_date" label="截止日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setActionModal(false)}>取消</Button><Button type="primary" htmlType="submit">确定</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 完成措施 Modal */}
      <Modal title="完成措施" open={completeActionModal} onCancel={() => { setCompleteActionModal(false); setCurrentAction(null); }} footer={null} width={500}>
        <Form form={completeForm} layout="vertical" onFinish={handleCompleteAction}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <div><strong>措施：</strong>{currentAction?.description}</div>
          </div>
          <Form.Item name="completion_evidence" label="完成证据/说明">
            <Input.TextArea rows={4} placeholder="请说明完成情况或提供证据描述" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => { setCompleteActionModal(false); setCurrentAction(null); }}>取消</Button><Button type="primary" htmlType="submit">确认完成</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 验证 Modal */}
      <Modal title="添加效果验证" open={verificationModal} onCancel={() => setVerificationModal(false)} footer={null} width={550}>
        <Form form={verifyForm} layout="vertical" onFinish={handleAddVerification}>
          <Form.Item name="action_id" label="关联措施">
            <Select
              allowClear
              options={(detail?.actions || []).map(a => ({ value: a.id, label: `${actionTypeNames[a.action_type]}: ${a.description.slice(0, 30)}...` }))}
              placeholder="不选则为整体CAPA验证"
            />
          </Form.Item>
          <Form.Item name="verification_method" label="验证方法" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请描述验证方法和标准" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setVerificationModal(false)}>取消</Button><Button type="primary" htmlType="submit">确定</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 升级 Modal */}
      <Modal title="发起升级" open={escalationModal} onCancel={() => setEscalationModal(false)} footer={null} width={550}>
        <Form form={escForm} layout="vertical" onFinish={handleAddEscalation}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="escalation_type" label="升级类型" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'overdue', label: '超期升级' },
                  { value: 'technical', label: '技术问题' },
                  { value: 'resource', label: '资源问题' },
                  { value: 'decision', label: '决策请求' },
                  { value: 'other', label: '其他' }
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="level" label="升级级别" initialValue={1}>
                <Select options={[
                  { value: 1, label: 'L1 - 部门级' },
                  { value: 2, label: 'L2 - 跨部门' },
                  { value: 3, label: 'L3 - 公司级' }
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="escalated_to" label="升级给谁" rules={[{ required: true }]}>
            <Select options={(qaUsers || []).concat(validationUsers || []).map(u => ({ value: u.id, label: `${u.name} - ${u.department || ''}` }))} />
          </Form.Item>
          <Form.Item name="reason" label="升级原因" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请详细说明升级原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setEscalationModal(false)}>取消</Button><Button type="primary" htmlType="submit">确定</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 关闭CAPA Modal */}
      <Modal title="关闭CAPA" open={closeModal} onCancel={() => setCloseModal(false)} footer={null} width={550}>
        <Form form={closeForm} layout="vertical" onFinish={handleCloseCAPA}>
          <Form.Item name="conclusion" label="关闭结论" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请输入CAPA关闭结论" />
          </Form.Item>
          <Form.Item name="effectiveness_review" label="有效性评审">
            <Input.TextArea rows={2} placeholder="评审纠正预防措施的有效性" />
          </Form.Item>
          <Form.Item name="lessons_learned" label="经验教训">
            <Input.TextArea rows={2} placeholder="总结此次偏差处理的经验教训" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space><Button onClick={() => setCloseModal(false)}>取消</Button><Button type="primary" danger htmlType="submit">确认关闭</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 创建趋势组 Modal */}
      <Modal title="创建趋势组" open={trendGroupModal} onCancel={() => setTrendGroupModal(false)} footer={null} width={500}>
        <Form form={trendGroupForm} layout="vertical" onFinish={handleCreateTrendGroup}>
          <Form.Item name="group_name" label="组名称" rules={[{ required: true, message: '请输入组名称' }]}>
            <Input placeholder="请输入趋势组名称" />
          </Form.Item>
          <Form.Item name="root_cause_category" label="根因分类">
            <Input placeholder="如：人员失误、设备故障、工艺缺陷等" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="趋势组描述" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setTrendGroupModal(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 相似偏差 Modal */}
      <Modal title="相似偏差识别" open={similarDeviationsModal} onCancel={() => setSimilarDeviationsModal(false)} footer={null} width={800}>
        {similarDeviations.length > 0 ? (
          <Table
            dataSource={similarDeviations}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            columns={[
              { title: '偏差编号', dataIndex: 'deviation_no', width: 140 },
              { title: '标题', dataIndex: 'title' },
              { title: '严重程度', dataIndex: 'severity', width: 100,
                render: (v) => <Tag color={severityColor[v]}>{severityName[v]}</Tag>
              },
              { title: '状态', dataIndex: 'status', width: 100,
                render: (v) => <Tag color={statusColor[v]}>{statusName[v]}</Tag>
              },
              { title: '匹配原因', dataIndex: 'match_reason', width: 180,
                render: (v) => {
                  const reasons = [];
                  if (v?.includes('same_category')) reasons.push('同根因分类');
                  if (v?.includes('same_product')) reasons.push('同产品');
                  if (v?.includes('same_equipment')) reasons.push('同设备');
                  return reasons.map(r => <Tag key={r} color="blue">{r}</Tag>);
                }
              },
              {
                title: '操作', width: 120, render: (_, r) => (
                  <Space>
                    <Button type="link" size="small" onClick={() => navigate(`/deviations/${r.id}`)}>查看</Button>
                    <Button type="link" size="small" onClick={() => handleJoinTrendGroup(r.trend_group_id)} disabled={!r.trend_group_id}>
                      加入该组
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>未找到相似偏差</div>
        )}
      </Modal>

      {/* 创建再措施计划 Modal */}
      <Modal title="创建再措施计划" open={reworkPlanModal} onCancel={() => { setReworkPlanModal(false); setCurrentVerification(null); }} footer={null} width={550}>
        <Form form={reworkForm} layout="vertical" onFinish={handleCreateReworkPlan}>
          <Form.Item name="rework_reason" label="再措施原因" rules={[{ required: true, message: '请输入再措施原因' }]}>
            <Input.TextArea rows={3} placeholder="说明为什么需要再措施" />
          </Form.Item>
          <Form.Item name="plan_description" label="计划描述" rules={[{ required: true, message: '请输入计划描述' }]}>
            <Input.TextArea rows={4} placeholder="描述再措施计划的详细内容" />
          </Form.Item>
          <Form.Item name="new_expected_deadline" label="新的预期完成日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setReworkPlanModal(false); setCurrentVerification(null); }}>取消</Button>
              <Button type="primary" htmlType="submit">提交审批</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加再措施 Modal */}
      <Modal title="添加再措施" open={reworkActionModal} onCancel={() => { setReworkActionModal(false); setCurrentReworkPlan(null); }} footer={null} width={550}>
        <Form form={reworkActionForm} layout="vertical" onFinish={handleAddReworkAction}>
          <Form.Item name="action_type" label="措施类型" rules={[{ required: true }]}>
            <Select>
              <Option value="corrective">纠正措施</Option>
              <Option value="preventive">预防措施</Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="措施描述" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="请描述具体的纠正或预防措施" />
          </Form.Item>
          <Form.Item name="responsible_id" label="责任人" rules={[{ required: true }]}>
            <Select options={qaUsers?.concat(validationUsers || []).map(u => ({ value: u.id, label: u.name })) || []} />
          </Form.Item>
          <Form.Item name="due_date" label="截止日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => !d || d.isBefore(dayjs().startOf('day'))} />
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select defaultValue="medium">
              <Option value="low">低</Option>
              <Option value="medium">中</Option>
              <Option value="high">高</Option>
            </Select>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setReworkActionModal(false); setCurrentReworkPlan(null); }}>取消</Button>
              <Button type="primary" htmlType="submit">添加</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DeviationDetail;
