import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Tag,
  Space,
  Statistic,
  Row,
  Col,
  message,
  Spin,
  Typography,
  Tooltip
} from 'antd';
import {
  ReloadOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import oddsApiService from '../services/oddsapi.service';
import type { OddsApiEvent, OddsApiLeague, OddsApiStats } from '../types/oddsapi.types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const OddsApiMatchesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [events, setEvents] = useState<OddsApiEvent[]>([]);
  const [leagues, setLeagues] = useState<OddsApiLeague[]>([]);
  const [stats, setStats] = useState<OddsApiStats | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');

  // 加载统计信息
  const loadStats = async () => {
    try {
      const response = await oddsApiService.getStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (error: any) {
      console.error('加载统计信息失败:', error);
    }
  };

  // 加载联赛列表
  const loadLeagues = async () => {
    try {
      const response = await oddsApiService.getLeagues('football');
      if (response.success) {
        setLeagues(response.data);
      }
    } catch (error: any) {
      console.error('加载联赛列表失败:', error);
      message.error('加载联赛列表失败');
    }
  };

  // 加载赛事列表
  const loadEvents = async () => {
    setLoading(true);
    try {
      const response = await oddsApiService.getEvents({
        sport: 'football',
        league: selectedLeague || undefined,
        status: selectedStatus,
        limit: 100
      });
      
      if (response.success) {
        setEvents(response.data);
      }
    } catch (error: any) {
      console.error('加载赛事失败:', error);
      message.error('加载赛事失败');
    } finally {
      setLoading(false);
    }
  };

  // 手动同步数据
  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await oddsApiService.syncData('football');
      if (response.success) {
        message.success('数据同步已启动，请稍后刷新查看');
        setTimeout(() => {
          loadEvents();
          loadLeagues();
          loadStats();
        }, 3000);
      }
    } catch (error: any) {
      console.error('同步失败:', error);
      message.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadLeagues();
    loadEvents();
  }, [selectedLeague, selectedStatus]);

  // 获取赔率显示
  const getOddsDisplay = (event: OddsApiEvent) => {
    if (!event.odds || event.odds.length === 0) {
      return <Text type="secondary">暂无赔率</Text>;
    }

    const mlOdds = event.odds.find(o => o.market_name === 'ML');
    const spreadOdds = event.odds.find(o => o.market_name === 'Spread');
    const totalsOdds = event.odds.find(o => o.market_name === 'Totals');

    return (
      <Space direction="vertical" size="small">
        {mlOdds && (
          <Text style={{ fontSize: '12px' }}>
            独赢: {mlOdds.ml_home?.toFixed(2)} / {mlOdds.ml_draw?.toFixed(2)} / {mlOdds.ml_away?.toFixed(2)}
          </Text>
        )}
        {spreadOdds && (
          <Text style={{ fontSize: '12px' }}>
            让球: {spreadOdds.spread_hdp} ({spreadOdds.spread_home?.toFixed(2)} / {spreadOdds.spread_away?.toFixed(2)})
          </Text>
        )}
        {totalsOdds && (
          <Text style={{ fontSize: '12px' }}>
            大小: {totalsOdds.totals_hdp} ({totalsOdds.totals_over?.toFixed(2)} / {totalsOdds.totals_under?.toFixed(2)})
          </Text>
        )}
      </Space>
    );
  };

  // 表格列定义
  const columns = [
    {
      title: '联赛',
      dataIndex: 'league_name',
      key: 'league_name',
      width: 200,
      render: (_: any, record: OddsApiEvent) => (
        <Text strong>{(record as any).league_name_zh || record.league_name}</Text>
      )
    },
    {
      title: '比赛',
      key: 'match',
      width: 300,
      render: (_: any, record: OddsApiEvent) => (
        <Space direction="vertical" size="small">
          <Text>{(record as any).home_zh || record.home} vs {(record as any).away_zh || record.away}</Text>
          {record.status === 'live' && (
            <Text type="danger">
              比分: {record.home_score} - {record.away_score}
            </Text>
          )}
          {record.status === 'settled' && (
            <Text type="secondary">
              结果: {record.home_score} - {record.away_score}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: '时间',
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (date: string) => (
        <Text>{dayjs(date).format('MM-DD HH:mm')}</Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'blue', text: '未开始' },
          live: { color: 'red', text: '进行中' },
          settled: { color: 'default', text: '已结束' }
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: 'Crown 赔率',
      key: 'odds',
      width: 300,
      render: (_: any, record: OddsApiEvent) => getOddsDisplay(record)
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: OddsApiEvent) => (
        <Button
          type="primary"
          size="small"
          disabled={record.status !== 'pending' || !record.odds || record.odds.length === 0}
        >
          下注
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <TrophyOutlined /> Odds-API 赛事中心
      </Title>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总赛事数"
                value={stats.total_events}
                prefix={<TrophyOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="未开始"
                value={stats.pending_events}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="进行中"
                value={stats.live_events}
                prefix={<SyncOutlined spin />}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="有赔率"
                value={stats.events_with_odds}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选和操作栏 */}
      <Card style={{ marginBottom: '16px' }}>
        <Space>
          <Select
            style={{ width: 200 }}
            placeholder="选择联赛"
            allowClear
            value={selectedLeague || undefined}
            onChange={setSelectedLeague}
          >
            {leagues.map(league => (
              <Option key={league.league_slug} value={league.league_slug}>
                {league.league_name} ({league.event_count})
              </Option>
            ))}
          </Select>

          <Select
            style={{ width: 120 }}
            value={selectedStatus}
            onChange={setSelectedStatus}
          >
            <Option value="pending">未开始</Option>
            <Option value="live">进行中</Option>
            <Option value="settled">已结束</Option>
          </Select>

          <Button
            icon={<ReloadOutlined />}
            onClick={loadEvents}
            loading={loading}
          >
            刷新
          </Button>

          <Tooltip title="从 Odds-API.io 同步最新数据">
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleSync}
              loading={syncing}
            >
              同步数据
            </Button>
          </Tooltip>
        </Space>
      </Card>

      {/* 赛事列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={events}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showTotal: (total) => `共 ${total} 场比赛`,
            showSizeChanger: true,
            showQuickJumper: true
          }}
        />
      </Card>
    </div>
  );
};

export default OddsApiMatchesPage;

