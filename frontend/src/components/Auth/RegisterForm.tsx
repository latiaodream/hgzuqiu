import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Divider } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import type { RegisterRequest } from '../../types';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (values: RegisterRequest & { confirmPassword: string }) => {
    setLoading(true);
    const { confirmPassword, ...registerData } = values;
    const success = await register(registerData);
    setLoading(false);

    if (success) {
      navigate('/dashboard', { replace: true });
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
            创建账号
          </div>
          <Text type="secondary" style={{ fontSize: '15px' }}>
            加入智投系统，开启智能投注之旅
          </Text>
        </div>

        <Form
          form={form}
          name="register"
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
              { max: 20, message: '用户名最多20个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
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
            name="email"
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>邮箱</span>}
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入邮箱"
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
              { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '密码必须包含字母和数字' },
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

          <Form.Item
            name="confirmPassword"
            label={<span style={{ fontSize: '14px', fontWeight: 500 }}>确认密码</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请再次输入密码"
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
              立即注册
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>
          <Text type="secondary" style={{ fontSize: '13px' }}>已有账号？</Text>
        </Divider>

        <Button
          type="link"
          size="large"
          onClick={onSwitchToLogin}
          style={{
            width: '100%',
            fontSize: '15px',
            fontWeight: 500,
            color: '#667eea'
          }}
        >
          ← 返回登录
        </Button>
      </Space>
    </Card>
  );
};

export default RegisterForm;
