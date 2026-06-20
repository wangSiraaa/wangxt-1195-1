import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import dayjs from 'dayjs';

const severityOptions = [
  { value: 'minor', label: '轻微' },
  { value: 'major', label: '重大' },
  { value: 'critical', label: '严重' }
];

const statusOptions = [
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'qa_reviewed', label: 'QA已判定' },
  { value: 'root_cause', label: '根因分析中' },
  { value: 'in_action', label: '措施执行中' },
  { value: 'in_verification', label: '效果验证中' },
  { value: 'closed', label: '已关闭' }
];

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

const Deviations = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: undefined, severity: undefined });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  const [viewMode, setViewMode] = useState('list');
  const [trendGroups, setTrendGroups] = useState([]);
  const [trendGroupFilter, setTrendGroupFilter] = useState(undefined);
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    fetchData();
    fetchTrendGroups();
  }, [filters]);

  const fetchTrendGroups = async () => {
    try {
      const response = await api.get('/trend-groups');
      setTrendGroups(response.data.groups || []);
    } catch (e) {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      const response = await api.get('/deviations', { params });
      setData(response.data.deviations || []);
    } catch (error) {
      console.error('获取偏差列表失败', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      discovered_date: dayjs(record.discovered_date)
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const payload = {
        ...values,
        discovered_date: values.discovered_date?.format('YYYY-MM-DD')
      };
      if (editingId) {
        await api.put(`/deviations/${editingId}`, payload);
        message.success('修改成功');
      } else {
        await api.post('/deviations', payload);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (error) {
      // error handled by interceptor
    }
  };

  const handleSubmitDeviation = async (id) => {
    try {
      await api.post(`/deviations/${id}/submit`);
      message.success('提交成功');
      fetchData();
    } catch (error) {}
  };

  const columns = [
    {
      title: '偏差编号',
      dataIndex: 'deviation_no',
      width: 160,
      fixed: 'left'
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true
    },
    {
      title: '产品/批次',
      dataIndex: 'product_batch',
      width: 140
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      width: 100,
      render: (s) => <Tag color={severityColor[s]}>{severityName[s]}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (s) => <Tag color={statusColor[s]}>{statusName[s]}</Tag>
    },
    {
      title: '提交人',
      dataIndex: 'reporter_name',
      width: 100
    },
    {
      title: '发现日期',
      dataIndex: 'discovered_date',
      width: 120,
      render: (d) => dayjs(d).format('YYYY-MM-DD')
    },
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/deviations/${record.id}`)}>
            详情
          </Button>
          {record.status === 'draft' && record.reporter_id === user?.id && (
            <>
              <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                编辑
              </Button>
              <Popconfirm title="确认提交该偏差？" onConfirm={() => handleSubmitDeviation(record.id)}>
                <Button type="link" danger>提交</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  const canCreate = user?.role === 'production' || user?.role === 'qa' || user?.role === 'admin';

  const filteredData = trendGroupFilter
    ? data.filter(d => d.trend_group_id === trendGroupFilter)
    : data;

  const groupedByTrend = (() => {
    const groups = {};
    data.forEach(d => {
      const gid = d.trend_group_id || 'none';
      if (!groups[gid]) {
        groups[gid] = {
          id: gid,
          name: gid === 'none' ? '未分组' : trendGroups.find(g => g.id === gid)?.group_name || '未知组',
          items: []
        };
      }
      groups[gid].items.push(d);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.id === 'none') return 1;
      if (b.id === 'none') return -1;
      return b.items.length - a.items.length;
    });
  })();

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>偏差管理</h2>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建偏差
          </Button>
        )}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <span style={{ marginRight: 8 }}>状态：</span>
            <Select
              style={{ width: 160 }}
              allowClear
              placeholder="选择状态"
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
              options={statusOptions}
            />
          </Col>
          <Col span={6}>
            <span style={{ marginRight: 8 }}>严重程度：</span>
            <Select
              style={{ width: 160 }}
              allowClear
              placeholder="选择严重程度"
              value={filters.severity}
              onChange={(v) => setFilters({ ...filters, severity: v })}
              options={severityOptions}
            />
          </Col>
          <Col span={6}>
            <span style={{ marginRight: 8 }}>趋势组：</span>
            <Select
              style={{ width: 160 }}
              allowClear
              placeholder="选择趋势组"
              value={trendGroupFilter}
              onChange={setTrendGroupFilter}
              options={trendGroups.map(g => ({ value: g.id, label: g.group_name }))}
            />
          </Col>
          <Col span={6} style={{ textAlign: 'right' }}>
            <Button.Group>
              <Button type={viewMode === 'list' ? 'primary' : 'default'} onClick={() => setViewMode('list')}>
                列表视图
              </Button>
              <Button type={viewMode === 'trend' ? 'primary' : 'default'} onClick={() => setViewMode('trend')}>
                趋势分组
              </Button>
            </Button.Group>
          </Col>
        </Row>
      </Card>

      <Card>
        {viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            expandable={{
              expandedRowRender: (record) => (
                <div style={{ paddingLeft: 40 }}>
                  {record.description}
                </div>
              )
            }}
          />
        ) : (
          <div>
            {groupedByTrend.map(group => (
              <Card 
                key={group.id} 
                style={{ marginBottom: 12 }} 
                size="small"
                title={
                  <Space>
                    <Button type="link" size="small" onClick={() => toggleGroup(group.id)}>
                      {expandedGroups[group.id] ? '▼' : '▶'}
                    </Button>
                    <span>{group.name}</span>
                    <Tag color="blue">{group.items.length} 项</Tag>
                    {group.id !== 'none' && (
                      <Tag color="green">已合并趋势</Tag>
                    )}
                  </Space>
                }
              >
                {expandedGroups[group.id] !== false && (
                  <Table
                    columns={columns}
                    dataSource={group.items}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Modal
        title={editingId ? '编辑偏差' : '新建偏差'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入偏差标题" />
          </Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={4} placeholder="请详细描述偏差情况" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_batch" label="产品/批次">
                <Input placeholder="请输入产品或批次号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="discovered_date" label="发现日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="equipment" label="设备">
                <Input placeholder="相关设备" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="地点">
                <Input placeholder="发生地点" />
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

export default Deviations;
