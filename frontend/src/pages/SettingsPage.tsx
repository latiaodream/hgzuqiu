import React, { useState, useEffect } from 'react';
import {
  Card,
  Descriptions,
  Button,
  Modal,
  Form,
  Input,
  message,
  Spin,
  Row,
  Col,
  Statistic,
} from 'antd';
import { LockOutlined, UserOutlined, MailOutlined, DollarOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { authApi, accountApi } from '../services/api';
import type { CrownAccount } from '../types';

interface BalanceStats {
  cny_balance: number;
  usd_balance: number;
  total_accounts: number;
}

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceStats, setBalanceStats] = useState<BalanceStats>({
    cny_balance: 0,
    usd_balance: 0,
    total_accounts: 0,
  });
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadBalanceStats();
  }, []);

  const loadBalanceStats = async () => {
    try {
      setBalanceLoading(true);
      const response = await accountApi.getAccounts();

      if (response.success && response.data) {
        const accounts = response.data as CrownAccount[];

        // 计算CNY和USD的总余额
        const cnyBalance = accounts
          .filter(acc => acc.currency === 'CNY')
          .reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

        const usdBalance = accounts
          .filter(acc => acc.currency === 'USD')
          .reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

        setBalanceStats({
          cny_balance: cnyBalance,
          usd_balance: usdBalance,
          total_accounts: accounts.length,
        });
      }
    } catch (error: any) {
      console.error('加载余额统计失败:', error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const response = await authApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });

      if (response.success) {
        message.success('密码修改成功');
        setPasswordModalVisible(false);
        form.resetFields();
      } else {
        message.error(response.error || '密码修改失败');
      }
    } catch (error: any) {
      console.error('修改密码失败:', error);
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(error.response?.data?.error || '密码修改失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return '超级管理员';
      case 'agent':
        return '代理';
      case 'staff':
        return '员工';
      default:
        return '未知';
    }
  };

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        {/* 账号信息卡片 */}
        <Col xs={24} lg={16}>
          <Card
            title="账号信息"
            extra={
              <Button
                type="primary"
                icon={<LockOutlined />}
                onClick={() => setPasswordModalVisible(true)}
              >
                修改密码
              </Button>
            }
          >
            <Descriptions column={1} bordered>
              <Descriptions.Item label="账号" labelStyle={{ width: '120px' }}>
                <UserOutlined style={{ marginRight: 8 }} />
                {user.username}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {getRoleLabel(user.role)}
              </Descriptions.Item>
              <Descriptions.Item label="邮箱">
                <MailOutlined style={{ marginRight: 8 }} />
                {user.email}
              </Descriptions.Item>
              <Descriptions.Item label="金币">
                <DollarOutlined style={{ marginRight: 8 }} />
                {balanceLoading ? (
                  <Spin size="small" />
                ) : (
                  <>
                    CNY(信用):{balanceStats.cny_balance.toLocaleString()}{' '}
                    USD(信用):{balanceStats.usd_balance.toLocaleString()}
                  </>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 金币统计卡片 */}
        <Col xs={24} lg={8}>
          <Card title="金币统计" loading={balanceLoading}>
            <Statistic
              title="CNY 总额度"
              value={balanceStats.cny_balance}
              precision={2}
              prefix="¥"
              suffix="CNY"
              valueStyle={{ color: '#3f8600' }}
            />
            <div style={{ marginTop: 16 }}>
              <Statistic
                title="USD 总额度"
                value={balanceStats.usd_balance}
                precision={2}
                prefix="$"
                suffix="USD"
                valueStyle={{ color: '#1890ff' }}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <Statistic
                title="账号数量"
                value={balanceStats.total_accounts}
                suffix="个"
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 修改密码模态框 */}
      <Modal
        title="修改密码"
        open={passwordModalVisible}
        onOk={handlePasswordChange}
        onCancel={() => {
          setPasswordModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label="旧密码"
            name="oldPassword"
            rules={[
              { required: true, message: '请输入旧密码' },
            ]}
          >
            <Input.Password placeholder="请输入旧密码" />
          </Form.Item>

          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
