import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  message,
  Typography,
  Row,
  Col,
  Statistic,
  Modal,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  SwapOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CrownSite } from '../types';
import { crownSitesApi } from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const CrownSitesPage: React.FC = () => {
  const [sites, setSites] = useState<CrownSite[]>([]);
  const [currentSite, setCurrentSite] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      setLoading(true);
      const response = await crownSitesApi.getAllSites();
      if (response.success && response.data) {
        setSites(response.data.sites);
        setCurrentSite(response.data.currentSite);
      }
    } catch (error: any) {
      console.error('加载站点列表失败:', error);
      message.error(error.response?.data?.error || '加载站点列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchSite = (url: string) => {
    Modal.confirm({
      title: '确认切换站点',
      content: `确定要切换到 ${url} 吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true);
          const response = await crownSitesApi.switchSite(url);
          if (response.success) {
            message.success('站点切换成功');
            loadSites();
          }
        } catch (error: any) {
          console.error('切换站点失败:', error);
          message.error(error.response?.data?.error || '切换站点失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleAutoSwitch = async () => {
    try {
      setLoading(true);
      const response = await crownSitesApi.autoSwitch();
      if (response.success) {
        message.success(response.data?.message || '自动切换成功');
        loadSites();
      }
    } catch (error: any) {
      console.error('自动切换失败:', error);
      message.error(error.response?.data?.error || '自动切换失败');
    } finally {
      setLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    try {
      setLoading(true);
      message.loading('正在检查站点健康状态...', 0);
      const response = await crownSitesApi.triggerHealthCheck();
      message.destroy();
      if (response.success) {
        message.success('健康检查完成');
        loadSites();
      }
    } catch (error: any) {
      message.destroy();
      console.error('健康检查失败:', error);
      message.error(error.response?.data?.error || '健康检查失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'online':
        return <Tag icon={<CheckCircleOutlined />} color="success">在线</Tag>;
      case 'offline':
        return <Tag icon={<CloseCircleOutlined />} color="error">离线</Tag>;
      default:
        return <Tag icon={<QuestionCircleOutlined />} color="default">未知</Tag>;
    }
  };

  const getCategoryTag = (category: string) => {
    return category === 'hga' 
      ? <Tag color="blue">HGA</Tag>
      : <Tag color="purple">MOS</Tag>;
  };

  const columns: ColumnsType<CrownSite> = [
    {
      title: '站点名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space>
          {record.isActive && <Tag color="gold">当前</Tag>}
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (category: string) => getCategoryTag(category),
      filters: [
        { text: 'HGA', value: 'hga' },
        { text: 'MOS', value: 'mos' },
      ],
      onFilter: (value, record) => record.category === value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
      filters: [
        { text: '在线', value: 'online' },
        { text: '离线', value: 'offline' },
        { text: '未知', value: 'unknown' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: '响应时间',
      dataIndex: 'responseTime',
      key: 'responseTime',
      render: (time?: number) => time ? `${time}ms` : '-',
      sorter: (a, b) => (a.responseTime || 9999) - (b.responseTime || 9999),
    },
    {
      title: '失败次数',
      dataIndex: 'failureCount',
      key: 'failureCount',
      render: (count: number) => (
        <Tag color={count === 0 ? 'success' : count < 3 ? 'warning' : 'error'}>
          {count}
        </Tag>
      ),
      sorter: (a, b) => a.failureCount - b.failureCount,
    },
    {
      title: '最后检查',
      dataIndex: 'lastCheckTime',
      key: 'lastCheckTime',
      render: (time?: string) => time ? dayjs(time).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '最后成功',
      dataIndex: 'lastSuccessTime',
      key: 'lastSuccessTime',
      render: (time?: string) => time ? dayjs(time).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          {!record.isActive && (
            <Button
              type="link"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => handleSwitchSite(record.url)}
              disabled={record.status === 'offline'}
            >
              切换
            </Button>
          )}
          {record.isActive && (
            <Tag color="gold">使用中</Tag>
          )}
        </Space>
      ),
    },
  ];

  const onlineCount = sites.filter(s => s.status === 'online').length;
  const offlineCount = sites.filter(s => s.status === 'offline').length;
  const currentSiteInfo = sites.find(s => s.url === currentSite);

  return (
    <div style={{ padding: isMobile ? 0 : '24px' }}>
      {!isMobile && (
        <Title level={2}>
          <GlobalOutlined /> 皇冠站点管理
        </Title>
      )}

      {/* 当前站点信息 */}
      <Card style={isMobile ? { marginBottom: 4, borderRadius: 0 } : { marginBottom: 24 }}>
        <Row gutter={isMobile ? 8 : 16}>
          <Col xs={12} sm={6}>
            <Statistic
              title={<span style={{ fontSize: isMobile ? 11 : 14 }}>当前站点</span>}
              value={currentSiteInfo?.name || '-'}
              valueStyle={{ fontSize: isMobile ? 14 : 24 }}
              prefix={<GlobalOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={<span style={{ fontSize: isMobile ? 11 : 14 }}>在线站点</span>}
              value={onlineCount}
              suffix={`/ ${sites.length}`}
              valueStyle={{ color: '#3f8600', fontSize: isMobile ? 14 : 24 }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={<span style={{ fontSize: isMobile ? 11 : 14 }}>离线站点</span>}
              value={offlineCount}
              valueStyle={{ color: '#cf1322', fontSize: isMobile ? 14 : 24 }}
              prefix={<CloseCircleOutlined />}
            />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic
              title={<span style={{ fontSize: isMobile ? 11 : 14 }}>响应时间</span>}
              value={currentSiteInfo?.responseTime || '-'}
              suffix="ms"
              valueStyle={{ fontSize: isMobile ? 14 : 24 }}
              prefix={<ThunderboltOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* 提示信息 */}
      {!isMobile && (
        <Alert
          message="站点自动切换"
          description="系统会自动监控站点健康状态，当前站点不可用时会自动切换到可用的备用站点。您也可以手动切换站点或触发健康检查。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 站点列表 */}
      <Card style={isMobile ? { marginBottom: 0, borderRadius: 0 } : {}}>
        <Row justify="space-between" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={isMobile ? 5 : 4}>站点列表</Title>
          </Col>
          <Col>
            <Space size={isMobile ? 4 : 8}>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadSites}
                loading={loading}
                size={isMobile ? 'small' : 'middle'}
              >
                {isMobile ? '' : '刷新'}
              </Button>
              {!isMobile && (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={handleHealthCheck}
                  loading={loading}
                >
                  健康检查
                </Button>
              )}
              <Button
                type="primary"
                icon={<SwapOutlined />}
                onClick={handleAutoSwitch}
                loading={loading}
                size={isMobile ? 'small' : 'middle'}
              >
                {isMobile ? '切换' : '自动切换'}
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={sites}
          rowKey="url"
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default CrownSitesPage;

