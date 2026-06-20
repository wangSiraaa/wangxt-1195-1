import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, Modal, Form, Input, Select, DatePicker, message, Card, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore, useUserStore } from '../stores/auth';
import dayjs from 'dayjs';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';

const RootCauses = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { fetchUsersByRole } = useUserStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [deviations, setDeviations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    fetchData();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const users = await fetchUsersByRole('qa');
    const devs = await api.get('/deviations');
    setAllUsers(users);
    setDeviations(devs.data.deviations || []);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/deviations');
      const devList = response.data.deviations || [];
      const allRc = [];
      for (const d of devList) {
        try {
          const rcResp = await api.get(`/root-causes/deviation/${d.id}`);
          (rcResp.data.rootCauses || []).forEach(rc => {
            allRc.push({
              ...rc,
              deviation_no: d.deviation_no,
              deviation_title: d.title,
              deviation_status: d.status,
              deviation_severity: d.severity
            });
          });
        } catch (e) {}
      }
      setData(allRc);
    } catch (error) {
      console.error('获取数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const canAdd = ['qa', 'validation', 'admin'].includes(user?.role);
  const canConfirm = (user?.role === 'qa' || user?.role === 'admin');

  const handleConfirm = async (id) => {
    try {
      await api.post(`/root-causes/${id}/confirm`);
      message.success('确认成功');
      fetchData();
    } catch (e) {}
  };

  const handleSubmit = async (values) => {
    try {
      await api.post('/root-causes', values);
      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (e) {}
  };

  const severityColor = { minor: 'blue', major: 'orange', critical: 'red' };
  const severityName = { minor: '轻微', major: '重大', critical: '严重' };

  const columns = [
    { title: '偏差编号', dataIndex: 'deviation_no', width: 160 },
    { title: '偏差标题', dataIndex: 'deviation_title', ellipsis: true },
    { title: '偏差严重度', dataIndex: 'deviation_severity', width: 100, render: (v) => <Tag color={severityColor[v]}>{severityName[v]}</Tag>},
    { title: '根因描述', dataIndex: 'description', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 100 },
    { title: '调查人', dataIndex: 'investigator_name', width: 100 },
    { title: '状态', dataIndex: 'is_confirmed', width: 100, render: (v) => v ? <Tag color="green">已确认</Tag> : <Tag color="orange">待确认</Tag> },
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', width: 180, render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/deviations/${record.deviation_id}`)}>查看偏差</Button>
          {!record.is_confirmed && canConfirm && (
            <Button type="link" onClick={() => handleConfirm(record.id)}>确认</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>根因分析</h2>
        {canAdd && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建根因分析
          </Button>
        )}
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

      <Modal title="新建根因分析" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={550}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="deviation_id" label="关联偏差" rules={[{ required: true, message: '请选择关联的偏差' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={deviations.filter(d => ['qa_reviewed', 'root_cause', 'in_action'].includes(d.status)).map(d => ({
                value: d.id,
                label: `${d.deviation_no} - ${d.title}`
              }))}
            />
          </Form.Item>
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

export default RootCauses;
