import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Space, Button } from 'antd';
import {
  FileTextOutlined,
  SearchOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import dayjs from 'dayjs';

const severityColor = {
  minor: 'blue',
  major: 'orange',
  critical: 'red'
};

const severityName = {
  minor: '轻微',
  major: '重大',
  critical: '严重'
};

const statusColor = {
  draft: 'default',
  submitted: 'blue',
  qa_reviewed: 'cyan',
  root_cause: 'purple',
  in_action: 'orange',
  in_verification: 'gold',
  closed: 'green',
  rejected: 'red'
};

const statusName = {
  draft: '草稿',
  submitted: '已提交',
  qa_reviewed: 'QA已判定',
  root_cause: '根因分析中',
  in_action: '措施执行中',
  in_verification: '效果验证中',
  closed: '已关闭',
  rejected: '已驳回'
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    inAction: 0,
    inVerification: 0,
    closed: 0,
    escalations: 0
  });
  const [recentDeviations, setRecentDeviations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [devResp, escResp] = await Promise.all([
        api.get('/deviations'),
        api.get('/escalations', { params: { status: 'open' } })
      ]);

      const deviations = devResp.data.deviations || [];
      const escalations = escResp.data.escalations || [];

      setStats({
        total: deviations.length,
        draft: deviations.filter(d => d.status === 'draft' || d.status === 'submitted').length,
        inAction: deviations.filter(d => d.status === 'root_cause' || d.status === 'in_action').length,
        inVerification: deviations.filter(d => d.status === 'in_verification').length,
        closed: deviations.filter(d => d.status === 'closed').length,
        escalations: escalations.length
      });

      setRecentDeviations(deviations.slice(0, 5));
    } catch (error) {
      console.error('获取数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '偏差编号',
      dataIndex: 'deviation_no',
      width: 160
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true
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
      title: '发现日期',
      dataIndex: 'discovered_date',
      width: 120,
      render: (d) => dayjs(d).format('YYYY-MM-DD')
    },
    {
      title: '操作',
      width: 80,
      render: (_, record) => (
        <Button type="link" onClick={() => navigate(`/deviations/${record.id}`)}>
          查看
        </Button>
      )
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>工作台 - 欢迎回来，{user?.name}</h2>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card" onClick={() => navigate('/deviations')}>
            <Statistic
              title="偏差总数"
              value={stats.total}
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
              suffix={<RightOutlined style={{ fontSize: 14, color: '#999' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card" onClick={() => navigate('/root-causes')}>
            <Statistic
              title="待根因分析"
              value={stats.draft}
              prefix={<SearchOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card" onClick={() => navigate('/actions')}>
            <Statistic
              title="措施执行中"
              value={stats.inAction}
              prefix={<ToolOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card" onClick={() => navigate('/verifications')}>
            <Statistic
              title="验证中"
              value={stats.inVerification}
              prefix={<CheckCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card">
            <Statistic
              title="已关闭"
              value={stats.closed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="stat-card" onClick={() => navigate('/escalations')}>
            <Statistic
              title="待处理升级"
              value={stats.escalations}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="最近偏差"
        extra={<Button type="link" onClick={() => navigate('/deviations')}>查看全部</Button>}
      >
        <Table
          columns={columns}
          dataSource={recentDeviations}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
