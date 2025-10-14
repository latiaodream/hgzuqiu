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
import { staffApi, accountApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Search } = Input;

interface StaffWithStats extends User {
  account_count: number;
}

const StaffPage: React.FC = () => {
  const { isAgent } = useAuth();
  const [staffList, setStaffList] = useState<StaffWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState<TablePagination>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  // 模态框状态
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadStaffList();
  }, []);

  const loadStaffList = async () => {
    try {
      setLoading(true);

      // 获取员工列表
      const staffResponse = await staffApi.getStaffList();
      if (staffResponse.success && staffResponse.data) {
        // 获取账号列表来统计每个员工的账号数量
        const accountsResponse = await accountApi.getAccounts();
        const accounts = accountsResponse.success ? accountsResponse.data || [] : [];

        // 计算每个员工的账号数量
        const staffWithStats = staffResponse.data.map(staff => {
          const accountCount = accounts.filter(acc => acc.user_id === staff.id).length;
          return {
            ...staff,
            account_count: accountCount,
          };
        });

        setStaffList(staffWithStats);
        setPagination(prev => ({
          ...prev,
          total: staffWithStats.length,
        }));
      }
    } catch (error: any) {
      console.error('加载员工列表失败:', error);
      message.error(error.response?.data?.error || '加载员工列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingStaff(null);
    form.resetFields();
    setFormModalVisible(true);
  };

  const handleEdit = (staff: User) => {
    setEditingStaff(staff);
    form.setFieldsValue({
      username: staff.username,
      email: staff.email,
    });
    setFormModalVisible(true);
  };

  const handleDelete = async (staffId: number) => {
    try {
      setLoading(true);
      const response = await staffApi.deleteStaff(staffId);
      if (response.success) {
        message.success('员工删除成功');
        loadStaffList();
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error: any) {
      console.error('删除员工失败:', error);
      message.error(error.response?.data?.error || '删除员工失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingStaff) {
        // 更新员工
        const updateData: StaffUpdateRequest = {
          username: values.username,
          email: values.email,
        };
        if (values.password) {
          updateData.password = values.password;
        }

        const response = await staffApi.updateStaff(editingStaff.id, updateData);
        if (response.success) {
          message.success('员工更新成功');
          setFormModalVisible(false);
          loadStaffList();
        } else {
          message.error(response.error || '更新失败');
        }
      } else {
        // 创建员工
        const createData: StaffCreateRequest = {
          username: values.username,
          email: values.email,
          password: values.password,
        };

        const response = await staffApi.createStaff(createData);
        if (response.success) {
          message.success('员工创建成功');
          setFormModalVisible(false);
          loadStaffList();
        } else {
          message.error(response.error || '创建失败');
        }
      }
    } catch (error: any) {
      console.error('保存员工失败:', error);
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
  const columns: ColumnsType<StaffWithStats> = [
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
        <Tag color="blue">员工</Tag>
      ),
    },
    {
      title: '皇冠账号数量',
      dataIndex: 'account_count',
      key: 'account_count',
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
              record.account_count > 0
                ? '该员工还有关联的皇冠账号，确定要删除吗？'
                : '确定要删除该员工吗？'
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

  // 如果不是代理，不显示此页面
  if (!isAgent) {
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
              <UserOutlined /> 员工管理
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
                onClick={loadStaffList}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                添加员工
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={staffList}
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

      {/* 添加/编辑员工模态框 */}
      <Modal
        title={editingStaff ? '编辑员工' : '添加员工'}
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
            label={editingStaff ? '新密码（留空则不修改）' : '密码'}
            name="password"
            rules={editingStaff ? [] : [
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder={editingStaff ? '留空则不修改密码' : '请输入密码'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StaffPage;
