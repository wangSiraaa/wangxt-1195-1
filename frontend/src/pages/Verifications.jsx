import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, Modal, Form, Input, Select, Radio, message, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../stores/auth';
import dayjs from 'dayjs';
import { EyeOutlined, PlusOutlined } from '@ant-design/icons';

const Verifications = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [deviations, setDeviations] = useState([]);
  const [allActions, setAllActions] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const devResp = await api.get('/deviations');
      const devList = devResp.data.deviations || [];
      setDeviations(devList);
      const allVerifications = [];
      const actionMap = {};
      for (const d of devList) {
        try {
          const [vResp, aResp] = await Promise.all([
            api.get(`/verifications/deviation/${d.id}`),
            api.get(`/actions/deviation/${d.id}`)
          ]);
          (aResp.data.actions || []).forEach(a => { actionMap[a.id] = a; });
          (vResp.data.verifications || []).forEach(v => {
            let actionDesc = '';
            if (v.action_id && actionMap[v.action_id]) {
              actionDesc = actionMap[v.action_id].description;
            }
            allVerifications.push({
              ...v,
              deviation_no: d.deviation_no,
              deviation_title: d.title,
              action_desc: actionDesc
            });
          });
        } catch (e) {}
      }
      setAllActions(actionMap);
      setData(allVerifications);
    } catch (error) {
      console.error('获取数据失败', error);
    } finally {
      setLoading(false);
    }
  };

  const canAdd = ['validation', 'qa', 'admin'].includes(user?.role);

  const handleSubmitResult = (record) => {
    Modal.confirm({
      title: '提交验证结果',
      content: (
        <div style={{ paddingTop: 12 }}>
          <Form layout="vertical">
            <Form.Item label="验证结果描述">
              <Input.TextArea id="verify-result-detail" rows={3} placeholder="请描述验证结果" />
            </Form.Item>
            <Form.Item label="是否通过" required>
              <Radio.Group id="verify-passed-detail">
                <Radio value={1}>通过</Radio>
                <Radio value={0}>不通过</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="结论">
              <Input.TextArea id="verify-conclusion-detail" rows={2} placeholder="请输入结论" />
            </Form.Item>
          </Form>
        </div>
      ),
      onOk: async () => {
        const passedEl = document.querySelector('#verify-passed-detail input:checked');
        const passed = passedEl ? passedEl.value : undefined;
        if (passed === undefined) {
          message.error('请选择是否通过');
          return Promise.reject();
        }
        try {
          await api.post(`/verifications/${record.id}/submit`, {
            verification_result: document.getElementById('verify-result-detail').value,
            is_passed: parseInt(passed),
            conclusion: document.getElementById('verify-conclusion-detail').value
          });
          message.success('验证结果提交成功');
          fetchData();
        } catch (e) {
          return Promise.reject();
        }
      }
    });
  };

  const handleSubmit = async (values) => {
    try {
      await api.post('/verifications', values);
      message.success('添加成功');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (e) {}
  };

  const columns = [
    { title: '偏差编号', dataIndex: 'deviation_no', width: 160 },
    { title: '偏差标题', dataIndex: 'deviation_title', ellipsis: true },
    { title: '关联措施', dataIndex: 'action_desc', width: 200, ellipsis: true, render: (v) => v || '整体CAPA验证' },
    { title: '验证方法', dataIndex: 'verification_method', ellipsis: true },
    { title: '验证人', dataIndex: 'verifier_name', width: 100 },
    { title: '验证结果', dataIndex: 'is_passed', width: 100,
      render: (v) => v === null || v === undefined ? <Tag color="default">待验证</Tag> : (v ? <Tag color="green">通过</Tag> : <Tag color="red">不通过</Tag>)
    },
    { title: '验证时间', dataIndex: 'verified_at', width: 160, render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作', width: 200, render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/deviations/${record.deviation_id}`)}>查看偏差</Button>
          {!record.verified_at && (record.verifier_id === user?.id || ['validation', 'qa', 'admin'].includes(user?.role)) && (
            <Button type="link" onClick={() => handleSubmitResult(record)}>提交结果</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>效果验证</h2>
        {canAdd && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            新建验证
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

      <Modal title="新建效果验证" open={modalVisible} onCancel={() => setModalVisible(false)} footer={null} width={550}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="deviation_id" label="关联偏差" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={deviations.filter(d => ['in_action', 'in_verification'].includes(d.status)).map(d => ({
                value: d.id,
                label: `${d.deviation_no} - ${d.title}`
              }))}
              onChange={(val) => {
                const dev = deviations.find(d => d.id === val);
                if (dev) {
                  api.get(`/actions/deviation/${val}`).then(resp => {
                    setAllActions(resp.data.actions || []);
                  });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="action_id" label="关联措施（可选）">
            <Select
              allowClear
              placeholder="不选则为整体CAPA验证"
              options={Object.values(allActions).map(a => ({
                value: a.id,
                label: a.description.slice(0, 50)
              }))}
            />
          </Form.Item>
          <Form.Item name="verification_method" label="验证方法" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请描述验证方法和标准" />
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

export default Verifications;
