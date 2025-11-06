import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Button, theme, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  DollarOutlined,
  DashboardOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CalendarOutlined,
  FileTextOutlined,
  GlobalOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { coinApi } from '../../services/api';

const { Header, Sider, Content } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

const MainLayout: React.FC = () => {
  // 移动端默认收起侧边栏
  const [collapsed, setCollapsed] = useState(window.innerWidth <= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [coinBalance, setCoinBalance] = useState(0);
  const { user, logout, isAdmin, isAgent, isStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 加载金币余额
  useEffect(() => {
    loadCoinBalance();
    // 每30秒刷新一次余额
    const interval = setInterval(loadCoinBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCoinBalance = async () => {
    try {
      const response = await coinApi.getBalance();
      if (response.success && response.data) {
        setCoinBalance(response.data.balance);
      }
    } catch (error) {
      console.error('Failed to load coin balance:', error);
    }
  };

  // 根据角色配置菜单项
  const getMenuItems = (): MenuItem[] => {
    const baseItems: MenuItem[] = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: '数据看板',
      },
    ];

    // 超级管理员菜单（显示所有功能）
    if (isAdmin) {
      baseItems.push(
        {
          key: '/agents',
          icon: <TeamOutlined />,
          label: '代理管理',
        },
        {
          key: '/staff',
          icon: <TeamOutlined />,
          label: '员工管理',
        },
        // {
        //   key: '/fetch-accounts',
        //   icon: <TeamOutlined />,
        //   label: '抓取账号',
        // },
        {
          key: '/accounts',
          icon: <UserOutlined />,
          label: '账号管理',
        },
        {
          key: '/betting',
          icon: <FileTextOutlined />,
          label: '下注记录',
        },
        {
          key: '/matches',
          icon: <CalendarOutlined />,
          label: '赛事管理',
        },
        {
          key: 'match-records',
          icon: <CalendarOutlined />,
          label: '赛事记录',
          children: [
            {
              key: '/crown-matches',
              label: '皇冠足球赛事',
            },
            {
              key: '/isports-matches',
              label: 'iSports足球赛事',
            },
          ],
        },
        {
          key: '/aliases',
          icon: <TagsOutlined />,
          label: '名称映射',
        },
        {
          key: '/coins',
          icon: <DollarOutlined />,
          label: '金币流水',
        },
        {
          key: '/crown-sites',
          icon: <GlobalOutlined />,
          label: '站点管理',
        }
      );
    }

    // 代理菜单（不包括管理员）
    if (isAgent && !isAdmin) {
      baseItems.push(
        {
          key: '/staff',
          icon: <TeamOutlined />,
          label: '员工管理',
        },
        {
          key: '/accounts',
          icon: <UserOutlined />,
          label: '账号管理',
        },
        {
          key: '/betting',
          icon: <FileTextOutlined />,
          label: '下注记录',
        },
        {
          key: '/coins',
          icon: <DollarOutlined />,
          label: '金币流水',
        }
      );
    }

    // 员工业务功能菜单（只有角色为staff的员工才能看到）
    if (user?.role === 'staff') {
      baseItems.push(
        {
          key: '/accounts',
          icon: <UserOutlined />,
          label: '账号管理',
        },
        {
          key: '/betting',
          icon: <FileTextOutlined />,
          label: '下注记录',
        },
        {
          key: '/matches',
          icon: <CalendarOutlined />,
          label: '赛事管理',
        },
        {
          key: 'match-records-staff',
          icon: <CalendarOutlined />,
          label: '赛事记录',
          children: [
            {
              key: '/crown-matches',
              label: '皇冠足球赛事',
            },
            {
              key: '/isports-matches',
              label: 'iSports足球赛事',
            },
          ],
        },
        {
          key: '/coins',
          icon: <DollarOutlined />,
          label: '金币流水',
        }
      );
    }

    // 设置菜单（所有人都有）
    baseItems.push({
      key: '/settings',
      icon: <SettingOutlined />,
      label: '个人中心',
    });

    return baseItems;
  };

  const menuItems = getMenuItems();

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '账户设置',
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 移动端遮罩层 */}
      {!collapsed && window.innerWidth <= 768 && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            zIndex: 1000,
          }}
          onClick={() => setCollapsed(true)}
        />
      )}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        className="fixed-sider"
      >
        <div style={{
          height: 64,
          margin: 16,
          background: 'rgba(255, 255, 255, 0.15)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: collapsed ? 16 : 18,
          fontWeight: 'bold',
        }}>
          {collapsed ? '智投' : '智投系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            background: 'transparent',
            border: 'none'
          }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />

          <Space size="large" className="header-right-section">
            <Tag
              icon={<DollarOutlined />}
              color="gold"
              style={{ fontSize: 14, padding: '4px 12px', cursor: 'pointer' }}
              onClick={() => navigate('/coins')}
              className="coin-balance-tag"
            >
              <span className="coin-label">金币：</span>¥{coinBalance.toFixed(2)}
            </Tag>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }} className="user-info-space">
                <Avatar icon={<UserOutlined />} />
                <span className="username-text">{user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: isMobile ? '0' : '16px',
            padding: isMobile ? 0 : 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: isMobile ? 0 : borderRadiusLG,
          }}
          className={isMobile ? 'main-content mobile-content' : 'main-content'}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
