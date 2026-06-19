import React, { useEffect, useState } from 'react'
import { Row, Col, Card, List, Tag, Statistic, Button, Space, Badge, App } from 'antd'
import {
  FileWarningOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
  PlusOutlined,
  ArrowRightOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../services/api'
import { useAuthStore, useAppStore } from '../store'

export default function Dashboard() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const user = useAuthStore((s) => s.user)
  const statusMap = useAppStore((s) => s.statusMap)
  const severityMap = useAppStore((s) => s.severityMap)
  const [stats, setStats] = useState(null)
  const [myDeviations, setMyDeviations] = useState([])
  const [myMeasures, setMyMeasures] = useState([])
  const [myEscalations, setMyEscalations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    try {
      const [statsRes, devRes, meaRes, escRes] = await Promise.all([
        api.deviations.stats(),
        api.deviations.list({ reporter: user.id, pageSize: 5 }),
        api.measures.list({ responsible: user.id, pageSize: 5 }),
        api.escalations.list({ to_user: user.id, status: 'pending', pageSize: 5 })
      ])
      setStats(statsRes.stats)
      setMyDeviations(devRes.deviations || [])
      setMyMeasures(meaRes.measures || [])
      setMyEscalations(escRes.escalations || [])
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const statCards = stats ? [
    { title: '全部偏差', value: stats.total, icon: <FileWarningOutlined />, color: '#1677ff', bg: '#e6f4ff', onClick: () => navigate('/deviations') },
    { title: '待处理措施', value: myMeasures.filter(m => ['pending', 'in_progress', 'overdue'].includes(m.status)).length, icon: <ToolOutlined />, color: '#722ed1', bg: '#f9f0ff', onClick: () => navigate('/measures') },
    { title: '超期预警', value: stats.overdueMeasures, icon: <ClockCircleOutlined />, color: '#ff4d4f', bg: '#fff1f0', onClick: () => navigate('/measures?status=overdue') },
    { title: '待验证活动', value: stats.pendingValidation, icon: <CheckCircleOutlined />, color: '#52c41a', bg: '#f6ffed', onClick: () => navigate('/validations') },
    { title: '待我处理升级', value: myEscalations.length, icon: <WarningOutlined />, color: '#faad14', bg: '#fffbe6', onClick: () => navigate('/escalations') }
  ] : []

  return (
    <div style={{ padding: 4 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card style={{ borderRadius: 12 }}>
            <Space style={{ justifyContent: 'space-between', width: '100%', display: 'flex' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>您好，{user?.name}！</h2>
                <p style={{ margin: '8px 0 0', color: '#8c8c8c' }}>
                  今天是 {dayjs().format('YYYY年MM月DD日 dddd')}，您当前角色为：
                  <Tag color="blue" style={{ marginLeft: 8 }}>
                    {useAppStore.getState().roleMap[user?.role]}
                  </Tag>
                </p>
              </div>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => navigate('/deviations/create')}>
                新建偏差
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map((s, i) => (
          <Col xs={24} sm={12} md={8} lg={24 / 5} key={i}>
            <div className="stat-card card-hoverable" style={{ background: s.bg }} onClick={s.onClick}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="stat-number" style={{ color: s.color }}>{s.value}</div>
                  <div className="stat-label">{s.title}</div>
                </div>
                <div style={{ fontSize: 36, color: s.color, opacity: 0.8 }}>{s.icon}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><FileWarningOutlined />我提交的偏差</Space>}
            extra={<Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/deviations')}>查看全部</Button>}
            loading={loading}
          >
            {myDeviations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#bfbfbf' }}>
                暂无偏差记录，点击右上角按钮新建第一条偏差
              </div>
            ) : (
              <List
                dataSource={myDeviations}
                renderItem={(item) => (
                  <List.Item
                    className="card-hoverable"
                    onClick={() => navigate(`/deviations/${item.id}`)}
                    style={{ padding: '12px 0', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  >
                    <List.Item.Meta
                      title={<Space>
                        <span style={{ fontWeight: 500 }}>{item.code}</span>
                        <Tag color={severityMap[item.severity]?.color}>{severityMap[item.severity]?.name}</Tag>
                        <Tag color={statusMap[item.status]?.color}>{statusMap[item.status]?.name}</Tag>
                      </Space>}
                      description={<Space>
                        <span>{item.title}</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">{dayjs(item.created_at).format('MM-DD HH:mm')}</span>
                      </Space>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<Space><ToolOutlined />我负责的措施</Space>}
            extra={<Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/measures')}>查看全部</Button>}
            loading={loading}
          >
            {myMeasures.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#bfbfbf' }}>暂无分配的纠正预防措施</div>
            ) : (
              <List
                dataSource={myMeasures}
                renderItem={(item) => {
                  const isOverdue = item.status === 'overdue' || (dayjs(item.deadline).isBefore(dayjs()) && ['pending', 'in_progress'].includes(item.status))
                  const msMap = useAppStore.getState().measureStatusMap
                  const mtMap = useAppStore.getState().measureTypeMap
                  return (
                    <List.Item
                      className="card-hoverable"
                      style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}
                      onClick={() => navigate(`/deviations/${item.deviation_id}`)}
                    >
                      <List.Item.Meta
                        title={<Space>
                          {isOverdue && <Badge status="error" />}
                          <Tag color={mtMap[item.type]?.color}>{mtMap[item.type]?.name}</Tag>
                          <Tag color={isOverdue ? 'red' : msMap[item.status]?.color}>
                            {isOverdue ? '超期' : msMap[item.status]?.name}
                          </Tag>
                        </Space>}
                        description={<Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <span style={{ color: '#262626' }}>{item.description}</span>
                          <Space>
                            <span className="text-muted">截止：{dayjs(item.deadline).format('YYYY-MM-DD')}</span>
                            <span className="text-muted">·</span>
                            <span className="text-muted">偏差：{item.deviation_code}</span>
                          </Space>
                        </Space>}
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card
            title={<Space><WarningOutlined />待确认的升级提醒</Space>}
            extra={<Button type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/escalations')}>查看全部</Button>}
            loading={loading}
          >
            {myEscalations.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#bfbfbf' }}>暂无待确认升级</div>
            ) : (
              <List
                grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
                dataSource={myEscalations}
                renderItem={(item) => (
                  <List.Item>
                    <Card size="small" className="card-hoverable" onClick={() => navigate(`/deviations/${item.deviation_id}`)}>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space>
                          <Tag color="red">{'★'.repeat(item.level)}级升级</Tag>
                          <span style={{ fontWeight: 500 }}>{item.deviation_code}</span>
                        </Space>
                        <p style={{ margin: 0, color: '#595959', fontSize: 13, minHeight: 36 }}>{item.reason}</p>
                        <Space style={{ fontSize: 12, color: '#8c8c8c' }}>
                          <ClockCircleOutlined />{dayjs(item.created_at).format('MM-DD HH:mm')}
                        </Space>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
