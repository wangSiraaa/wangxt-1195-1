import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, Modal, Form, Input, Select, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore, useUserStore } from '../stores/auth';
import dayjs from 'dayjs';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';

const escalationTypeNames = { overdue: '超期升级', technical: '技术问题', resource: '资源问题', decision: '决策请求', other: '其他' };
const levelNames = { 1: 'L1-部门级', 2: 'L2-跨部门', 3: 'L3-公司级' };

const Escalations = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { fetchUsersByRole } = useUserStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [deviations, setDeviations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [qaUsers, setQaUsers] = useState([]);

  useEffect(() => {
    fetchData();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const devResp = await api.get('/deviations');
      const [userResp, qaResp] = await Promise.all([
        api.get('/auth/users'),
        fetchUsersByRole('qa')
      ]);
      setDeviations(devResp.data.deviations || []);
      setAllUsers(userResp.data.users || []);
      setQaUsers(qaResp);
    } catch (e) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/escalations');
      setData(response.data.escalations || []);
    } catch (error) {
      console.error('获取数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = (eId) => {
    Modal.confirm({
      title: '解决升级',
      content: (
        <Form layout="vertical" style={{ paddingTop: 12 }}>
          <Form.Item label="解决方案" required>
            <Input.TextArea id="escalation-resolve" rows={4} placeholder="请输入解决方案" />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const resolution = document.getElementById('escalation-resolve').value;
        if (!resolution) {
          message.error('请输入解决方案');
          return Promise.reject();
        }
        try {
          await api.post(`/escalations/${eId}/resolve`, { resolution });
          message.success('升级已解决');
          fetchData();
        } catch (e) {
          return Promise.reject();
        }
      }
    });
  };

  const handleSubmit = async (values) => {
    try {
      await api.post('/escalations', values);
      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (e) {}
  };

  const columns = [
    { title: '偏差编号', dataIndex: 'deviation_no', width: 160 },
    { title: '偏差标题', dataIndex: 'deviation_title', ellipsis: true },
    { title: '类型', dataIndex: 'escalation_type', width: 100, render: (v) => escalationTypeNames[v] },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: '发起人', dataIndex: 'escalated_by_name', width: 100 },
    { title: '处理人', dataIndex: 'escalated_to_name', width: 100 },
    { title: '级别', dataIndex: 'level', width: 120, render: (v) => levelNames[v] || `L${v}` },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => v === 'open' ? <Tag color="red">待处理</Tag> : <Tag color="green">已解决</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', width: 200, render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/deviations/${record.deviation_id}`)}>查看偏差</Button>
          {record.status === 'open' && (
            <Button type="link" onClick={() => handleResolve(record.id)}>解决</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>升级管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
          发起升级
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal title="发起升级" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={550}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="deviation_id" label="关联偏差" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={deviations.map(d => ({
                value: d.id,
                label: `${d.deviation_no} - ${d.title}`
              }))}
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="escalation_type" label="升级类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[
                { value: 'overdue', label: '超期升级' },
                { value: 'technical', label: '技术问题' },
                { value: 'resource', label: '资源问题' },
                { value: 'decision', label: '决策请求' },
                { value: 'other', label: '其他' }
              ]} />
            </Form.Item>
            <Form.Item name="level" label="升级级别" initialValue={1} style={{ width: 200 }}>
              <Select options={[
                { value: 1, label: 'L1 - 部门级' },
                { value: 2, label: 'L2 - 跨部门' },
                { value: 3, label: 'L3 - 公司级' }
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="escalated_to" label="升级给谁" rules={[{ required: true }]}>
            <Select options={(qaUsers || []).concat(allUsers.filter(u => u.role === 'validation' || u.role === 'admin')).map(u => ({ value: u.id, label: `${u.name} - ${u.department || ''}` }))} />
          </Form.Item>
          <Form.Item name="reason" label="升级原因" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请详细说明升级原因" />
          </Form.Item>
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

export default Escalations;
