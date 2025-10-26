import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import type { LoginRequest } from '../../types';
import { useNavigate, useLocation } from 'react-router-dom';

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

  const redirectPath = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (values: LoginRequest) => {
    setLoading(true);
    const success = await login(values);
    setLoading(false);

    if (success) {
      navigate(redirectPath, { replace: true });
    }
  };

  return (
    <Card
      style={{
        width: '100%',
        maxWidth: 450,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        borderRadius: '16px',
        border: 'none',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(10px)',
      }}
      bodyStyle={{ padding: '48px 40px' }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px'
          }}>
            欢迎回来
          </div>
          <Text type="secondary" style={{ fontSize: '15px' }}>
            登录您的账号以继续
          </Text>
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
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>用户名</span>}
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入用户名"
              size="large"
              style={{
                borderRadius: '8px',
                fontSize: '15px',
                padding: '12px 16px'
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>密码</span>}
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入密码"
              size="large"
              style={{
                borderRadius: '8px',
                fontSize: '15px',
                padding: '12px 16px'
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px', marginBottom: '16px' }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={loading}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
              }}
            >
              立即登录
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>
          <Text type="secondary" style={{ fontSize: '13px' }}>还没有账号？</Text>
        </Divider>

        <Button
          type="link"
          size="large"
          onClick={onSwitchToRegister}
          style={{
            width: '100%',
            fontSize: '15px',
            fontWeight: 500,
            color: '#667eea'
          }}
        >
          立即注册 →
        </Button>
      </Space>
    </Card>
  );
};

export default LoginForm;
