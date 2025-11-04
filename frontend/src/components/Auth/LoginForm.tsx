import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Divider, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import type { LoginRequest } from '../../types';
import { useNavigate, useLocation } from 'react-router-dom';
import EmailBindingModal from './EmailBindingModal';
import LoginVerificationModal from './LoginVerificationModal';
import { authApi } from '../../services/api';

const { Title, Text } = Typography;

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 邮箱绑定弹窗
  const [emailBindingVisible, setEmailBindingVisible] = useState(false);
  const [bindingUserId, setBindingUserId] = useState<number>(0);
  const [bindingEmail, setBindingEmail] = useState('');

  // 登录验证弹窗
  const [verificationVisible, setVerificationVisible] = useState(false);
  const [verificationUserId, setVerificationUserId] = useState<number>(0);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  const redirectPath = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (values: LoginRequest) => {
    setLoading(true);

    try {
      const response = await authApi.login(values);

      if (response.success && response.token && response.user) {
        // 登录成功
        await login(values);
        navigate(redirectPath, { replace: true });
      } else if (response.requireEmailBinding) {
        // 需要绑定邮箱
        setBindingUserId(response.userId!);
        setBindingEmail(response.email || '');
        setEmailBindingVisible(true);
      } else if (response.requireVerification) {
        // 需要验证码
        setVerificationUserId(response.userId!);
        setVerificationEmail(response.email!);
        setPendingUsername(values.username);
        setPendingPassword(values.password);
        setVerificationVisible(true);
      } else {
        message.error(response.error || '登录失败');
      }
    } catch (error: any) {
      const errorData = error.response?.data;

      if (errorData?.requireEmailBinding) {
        // 需要绑定邮箱
        setBindingUserId(errorData.userId);
        setBindingEmail(errorData.email || '');
        setEmailBindingVisible(true);
      } else if (errorData?.requireVerification) {
        // 需要验证码
        setVerificationUserId(errorData.userId);
        setVerificationEmail(errorData.email);
        setPendingUsername(values.username);
        setPendingPassword(values.password);
        setVerificationVisible(true);
      } else {
        message.error(errorData?.error || '登录失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 邮箱绑定成功后重新登录
  const handleEmailBindingSuccess = async () => {
    setEmailBindingVisible(false);
    message.success('邮箱绑定成功，请重新登录');
  };

  // 验证码验证成功后登录
  const handleVerificationSuccess = async (verificationCode: string) => {
    setVerificationVisible(false);
    setLoading(true);

    const success = await login({
      username: pendingUsername,
      password: pendingPassword,
      verificationCode,
    });

    setLoading(false);

    if (success) {
      navigate(redirectPath, { replace: true });
    }
  };

  return (
    <>
      <Card
        style={{
          width: 400,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
              智投系统
            </Title>
            <Text type="secondary">皇冠足球下注管理平台</Text>
          </div>

          <Form
            form={form}
            name="login"
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="请输入用户名"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="请输入密码"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                style={{ width: '100%' }}
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <Divider>
            <Text type="secondary">还没有账号？</Text>
          </Divider>

          <Button
            type="link"
            size="large"
            onClick={onSwitchToRegister}
            style={{ width: '100%' }}
          >
            立即注册
          </Button>
        </Space>
      </Card>

      {/* 邮箱绑定弹窗 */}
      <EmailBindingModal
        visible={emailBindingVisible}
        userId={bindingUserId}
        defaultEmail={bindingEmail}
        onSuccess={handleEmailBindingSuccess}
        onCancel={() => setEmailBindingVisible(false)}
      />

      {/* 登录验证弹窗 */}
      <LoginVerificationModal
        visible={verificationVisible}
        userId={verificationUserId}
        email={verificationEmail}
        username={pendingUsername}
        password={pendingPassword}
        onSuccess={handleVerificationSuccess}
        onCancel={() => setVerificationVisible(false)}
      />
    </>
  );
};

export default LoginForm;
