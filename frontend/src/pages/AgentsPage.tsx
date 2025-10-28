import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Input,
  Modal,
  Form,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { User, StaffCreateRequest, StaffUpdateRequest, TablePagination } from '../types';
import { agentApi, staffApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;

interface AgentWithStats extends User {
  staff_count: number;
}

const AgentsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [agentList, setAgentList] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState<TablePagination>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  // 模态框状态
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<User | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadAgentList();
  }, []);

  const loadAgentList = async () => {
    try {
      setLoading(true);

      // 获取代理列表
      const agentResponse = await agentApi.getAgentList();
      if (agentResponse.success && agentResponse.data) {
        // 获取员工列表来统计每个代理的员工数量
        const staffResponse = await staffApi.getStaffList();
        const staffList = staffResponse.success ? staffResponse.data || [] : [];

        // 计算每个代理的员工数量
        const agentsWithStats = agentResponse.data.map(agent => {
          const staffCount = staffList.filter(staff =>
            staff.parent_id === agent.id || staff.agent_id === agent.id
          ).length;
          return {
            ...agent,
            staff_count: staffCount,
          };
        });

        setAgentList(agentsWithStats);
        setPagination(prev => ({
          ...prev,
          total: agentsWithStats.length,
        }));
      }
    } catch (error: any) {
      console.error('加载代理列表失败:', error);
      message.error(error.response?.data?.error || '加载代理列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAgent(null);
    form.resetFields();
    setFormModalVisible(true);
  };

  const handleEdit = (agent: User) => {
    setEditingAgent(agent);
    form.setFieldsValue({
      username: agent.username,
      email: agent.email,
    });
    setFormModalVisible(true);
  };

  const handleDelete = async (agentId: number) => {
    try {
      setLoading(true);
      const response = await agentApi.deleteAgent(agentId);
      if (response.success) {
        message.success('代理删除成功');
        loadAgentList();
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error: any) {
      console.error('删除代理失败:', error);
      message.error(error.response?.data?.error || '删除代理失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingAgent) {
        // 更新代理
        const updateData: StaffUpdateRequest = {
          username: values.username,
          email: values.email,
        };
        if (values.password) {
          updateData.password = values.password;
        }

        const response = await agentApi.updateAgent(editingAgent.id, updateData);
        if (response.success) {
          message.success('代理更新成功');
          setFormModalVisible(false);
          loadAgentList();
        } else {
          message.error(response.error || '更新失败');
        }
      } else {
        // 创建代理
        const createData: StaffCreateRequest = {
          username: values.username,
          email: values.email,
          password: values.password,
        };

        const response = await agentApi.createAgent(createData);
        if (response.success) {
          message.success('代理创建成功');
          setFormModalVisible(false);
          loadAgentList();
        } else {
          message.error(response.error || '创建失败');
        }
      }
    } catch (error: any) {
      console.error('保存代理失败:', error);
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(error.response?.data?.error || '保存失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 表格列定义
  const columns: ColumnsType<AgentWithStats> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      filteredValue: searchText ? [searchText] : null,
      onFilter: (value, record) =>
        record.username.toLowerCase().includes((value as string).toLowerCase()) ||
        record.email.toLowerCase().includes((value as string).toLowerCase()),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color="purple">代理</Tag>
      ),
    },
    {
      title: '员工数量',
      dataIndex: 'staff_count',
      key: 'staff_count',
      render: (count: number) => (
        <Tag color={count > 0 ? 'green' : 'default'} icon={<TeamOutlined />}>
          {count}
        </Tag>
      ),
    },
    {
      title: '信用额度',
      dataIndex: 'credit_limit',
      key: 'credit_limit',
      render: (credit_limit: number) => (
        <span>{credit_limit ? credit_limit.toLocaleString() : '0'}</span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={
              record.staff_count > 0
                ? '该代理还有关联的员工，确定要删除吗？'
                : '确定要删除该代理吗？'
            }
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 如果不是管理员，不显示此页面
  if (!isAdmin) {
    return (
      <Card>
        <Typography.Text type="danger">您没有权限访问此页面</Typography.Text>
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <UserOutlined /> 代理管理
            </Title>
          </Col>
          <Col>
            <Space>
              <Search
                placeholder="搜索用户名或邮箱"
                allowClear
                style={{ width: 250 }}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={setSearchText}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={loadAgentList}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                添加代理
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={agentList}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize }));
            },
          }}
        />
      </Card>

      {/* 添加/编辑代理模态框 */}
      <Modal
        title={editingAgent ? '编辑代理' : '添加代理'}
        open={formModalVisible}
        onOk={handleFormSubmit}
        onCancel={() => {
          setFormModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={loading}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label={editingAgent ? '新密码（留空则不修改）' : '密码'}
            name="password"
            rules={editingAgent ? [] : [
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder={editingAgent ? '留空则不修改密码' : '请输入密码'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AgentsPage;
