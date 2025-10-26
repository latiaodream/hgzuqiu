import React, { useState } from 'react';
import { Row, Col } from 'antd';
import { Navigate } from 'react-router-dom';
import LoginForm from '../components/Auth/LoginForm';
import RegisterForm from '../components/Auth/RegisterForm';
import { useAuth } from '../contexts/AuthContext';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{
      margin: 0,
      padding: 0,
      width: '100vw',
      minHeight: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e22ce 100%)',
      overflow: 'auto'
    }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
          position: 'relative',
          minHeight: '100vh',
        }}
      >
        {/* 背景装饰 */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30%',
          left: '-5%',
          width: '500px',
          height: '500px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '50%',
          filter: 'blur(60px)',
        }} />

        <Row style={{ width: '100%', maxWidth: '1200px', zIndex: 1 }} gutter={[48, 48]} align="middle">
          {/* 左侧信息区域 */}
          <Col xs={24} lg={12} style={{ textAlign: 'center' }}>
            <div style={{ color: 'white', padding: '40px' }}>
              <div style={{
                fontSize: '48px',
                fontWeight: 'bold',
                marginBottom: '24px',
                textShadow: '0 2px 10px rgba(0,0,0,0.3)'
              }}>
                ⚽ 智投系统
              </div>
              <div style={{
                fontSize: '24px',
                marginBottom: '32px',
                opacity: 0.9,
                textShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>
                皇冠足球下注管理平台
              </div>
              <div style={{
                fontSize: '16px',
                lineHeight: '1.8',
                opacity: 0.8,
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                <p>✨ 智能账号管理</p>
                <p>📊 实时数据分析</p>
                <p>🎯 精准投注策略</p>
                <p>💰 收益最大化</p>
              </div>
            </div>
          </Col>

          {/* 右侧登录表单 */}
          <Col xs={24} lg={12}>
            {isLogin ? (
              <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
            )}
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default AuthPage;
