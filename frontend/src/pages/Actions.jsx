import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, Modal, Form, Input, Select, DatePicker, message, Card, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import dayjs from 'dayjs';
import { EyeOutlined, WarningOutlined, PlusOutlined } from '@ant-design/icons';

const actionTypeNames = { correction: '纠正', corrective: '纠正措施', preventive: '预防措施' };
const actionStatusNames = { pending: '待处理', in_progress: '执行中', completed: '已完成', overdue: '已超期', cancelled: '已取消' };
const actionStatusColors = { pending: 'default', in_progress: 'blue', completed: 'green', overdue: 'red', cancelled: 'default' };
const priorityColor = { high: 'red', medium: 'orange', low: 'blue' };
const priorityName = { high: '高', medium: '中', low: '低' };

const Actions = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [deviations, setDeviations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [filterStatus, setFilterStatus] = useState();

  useEffect(() => {
    fetchData();
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    try {
      const [devResp, userResp] = await Promise.all([
        api.get('/deviations'),
        api.get('/auth/users')
      ]);
      setDeviations(devResp.data.deviations || []);
      setAllUsers(userResp.data.users || []);
    } catch (e) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/deviations');
      const devList = response.data.deviations || [];
      const allActions = [];
      for (const d of devList) {
        try {
          const actResp = await api.get(`/actions/deviation/${d.id}`);
          (actResp.data.actions || []).forEach(a => {
            allActions.push({
              ...a,
              deviation_no: d.deviation_no,
              deviation_title: d.title,
              deviation_status: d.status
            });
          });
        } catch (e) {}
      }
      setData(allActions);
    } catch (error) {
      console.error('获取数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const canAdd = ['qa', 'validation', 'admin'].includes(user?.role);

  const handleStart = async (id) => {
    try {
      await api.post(`/actions/${id}/start`);
      message.success('已开始执行');
      fetchData();
    } catch (e) {}
  };

  const handleComplete = (record) => {
    Modal.confirm({
      title: '完成措施',
      content: (
        <Form layout="vertical" style={{ paddingTop: 12 }}>
          <Form.Item label="完成证据/说明">
            <Input.TextArea id="action-complete-evidence" rows={4} placeholder="请说明完成情况" />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const evidence = document.getElementById('action-complete-evidence').value;
        try {
          await api.post(`/actions/${record.id}/complete`, { completion_evidence: evidence });
          message.success('完成成功');
          fetchData();
        } catch (e) {
          return Promise.reject();
        }
      }
    });
  };

  const handleSubmit = async (values) => {
    try {
      const payload = {
        ...values,
        due_date: values.due_date?.format('YYYY-MM-DD')
      };
      await api.post('/actions', payload);
      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (e) {}
  };

  const columns = [
    { title: '偏差编号', dataIndex: 'deviation_no', width: 150 },
    { title: '偏差标题', dataIndex: 'deviation_title', ellipsis: true },
    { title: '类型', dataIndex: 'action_type', width: 100, render: (v) => actionTypeNames[v] },
    { title: '措施描述', dataIndex: 'description', ellipsis: true },
    { title: '责任人', dataIndex: 'responsible_name', width: 100 },
    { title: '优先级', dataIndex: 'priority', width: 80, render: (v) => <Tag color={priorityColor[v]}>{priorityName[v]}</Tag> },
    { title: '截止日期', dataIndex: 'due_date', width: 120, render: (v) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '状态', width: 160, render: (_, r) => (
        <Space>
          <Tag color={actionStatusColors[r.status]}>{actionStatusNames[r.status]}</Tag>
          {r.overdue_check?.overdue && <Tag color="red" icon={<WarningOutlined />}>超期{r.overdue_check.daysOverdue}天</Tag>}
        </Space>
      )
    },
    {
      title: '操作', width: 220, render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/deviations/${record.deviation_id}`)}>查看偏差</Button>
          {(record.status === 'pending' || record.status === 'overdue') && (record.responsible_id === user?.id || ['admin', 'qa'].includes(user?.role)) && (
            <Button type="link" onClick={() => handleStart(record.id)}>开始</Button>
          )}
          {(record.status === 'in_progress' || record.status === 'overdue') && (record.responsible_id === user?.id || ['admin', 'qa'].includes(user?.role)) && (
            <Button type="link" onClick={() => handleComplete(record)}>完成</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>纠正预防措施</h2>
        {canAdd && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建措施
          </Button>
        )}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <span>状态：</span>
          <Select
            style={{ width: 160 }}
            allowClear
            placeholder="选择状态"
            value={filterStatus}
            onChange={setFilterStatus}
            options={Object.keys(actionStatusNames).map(k => ({ value: k, label: actionStatusNames[k] }))}
          />
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal title="新建纠正预防措施" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="deviation_id" label="关联偏差" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={deviations.filter(d => ['qa_reviewed', 'root_cause', 'in_action'].includes(d.status)).map(d => ({
                value: d.id,
                label: `${d.deviation_no} - ${d.title}`
              }))}
            />
          </Form.Item>
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
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确定</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Actions;
