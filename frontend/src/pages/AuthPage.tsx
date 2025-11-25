import React, { useState } from 'react';
import { Row, Col, Typography } from 'antd';
import { Navigate } from 'react-router-dom';
import { RadarChartOutlined, SafetyCertificateOutlined, RiseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      minHeight: '100vh',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #DBEAFE 100%)',
    }}>
      {/* Decorative Background Elements */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-5%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(79,70,229,0.1) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-5%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        zIndex: 0,
      }} />

      <div style={{
        width: '100%',
        maxWidth: '1100px',
        margin: '20px',
        position: 'relative',
        zIndex: 1,
      }}>
        <Row gutter={[0, 0]} style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #E5E7EB',
          background: '#FFFFFF',
        }}>
          {/* Left Side: Branding */}
          <Col xs={0} lg={12} style={{
            background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
            padding: '60px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderRight: '1px solid #E5E7EB',
          }}>
            <div style={{ marginBottom: '40px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px',
                background: 'rgba(79, 70, 229, 0.1)',
                padding: '8px 16px',
                borderRadius: '100px',
                border: '1px solid rgba(79, 70, 229, 0.2)'
              }}>
                <RadarChartOutlined style={{ fontSize: '20px', color: '#4F46E5' }} />
                <span style={{ color: '#4F46E5', fontWeight: 600, letterSpacing: '1px' }}>智能投注系统</span>
              </div>
              <Title level={1} style={{
                color: '#111827',
                fontSize: '48px',
                margin: 0,
                lineHeight: 1.1,
                fontWeight: 700,
                letterSpacing: '-1px'
              }}>
                掌握 <br />
                <span className="text-gradient">市场先机</span>
              </Title>
              <Text style={{
                display: 'block',
                marginTop: '20px',
                fontSize: '16px',
                color: '#6B7280',
                maxWidth: '400px',
                lineHeight: 1.6
              }}>
                专业级体育交易终端，自动化执行与实时数据分析。
              </Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <FeatureItem icon={<RiseOutlined />} title="实时数据分析" desc="毫秒级赔率监控" />
              <FeatureItem icon={<ThunderboltOutlined />} title="极速交易执行" desc="零延迟自动投注" />
              <FeatureItem icon={<SafetyCertificateOutlined />} title="智能风控管理" desc="自动化仓位控制" />
            </div>
          </Col>

          {/* Right Side: Form */}
          <Col xs={24} lg={12} style={{ padding: '60px 40px', background: '#FFFFFF' }}>
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <Title level={3} style={{ color: '#111827', marginBottom: '8px' }}>
                  {isLogin ? '欢迎回来' : '创建账户'}
                </Title>
                <Text style={{ color: '#6B7280' }}>
                  {isLogin ? '请输入您的账号密码以访问终端。' : '加入精英交易社区。'}
                </Text>
              </div>

              {isLogin ? (
                <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
              )}
            </div>
          </Col>
        </Row>
      </div>
    </div>
  );
};

const FeatureItem = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div style={{ display: 'flex', gap: '12px' }}>
    <div style={{
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      background: 'rgba(79, 70, 229, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#4F46E5',
      border: '1px solid rgba(79, 70, 229, 0.2)'
    }}>
      {icon}
    </div>
    <div>
      <div style={{ color: '#111827', fontWeight: 600, fontSize: '14px' }}>{title}</div>
      <div style={{ color: '#6B7280', fontSize: '12px' }}>{desc}</div>
    </div>
  </div>
);

export default AuthPage;
