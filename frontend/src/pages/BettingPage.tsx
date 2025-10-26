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
  Select,
  DatePicker,
  Statistic,
  Progress,
  Badge,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Bet, CrownAccount, User, TablePagination } from '../types';
import { betApi, accountApi, agentApi } from '../services/api';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

// 注单分组界面
interface BetGroup {
  key: string;
  match_info: string;
  bet_target: string;
  completed_amount: string;
  bet_rate: number;
  average_odds?: number;
  total_profit_loss: number;
  bet_count: string;
  result_count: string;
  time: string;
  bets: Bet[];
  status: 'completed' | 'pending';
}

// 子注单界面
interface BetDetail {
  key: string;
  status: string;
  order_id: string;
  user_username?: string;  // 员工用户名
  account_username: string;
  amount_display: string;
  bet_amount: number;
  single_limit: number;
  official_odds?: number;
  virtual_amount_display?: string;
  virtual_profit_display?: string;
  result_score?: string;
  result_text?: string;
  input_display: string;
  input_amount: number;
  input_limit: number;
  time: string;
}

const formatOdds = (value?: number | null | string) => {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '-';
  }
  return parsed.toFixed(3).replace(/\.?0+$/, '');
};

const resolveOfficialOdds = (bet: Bet): number | undefined => {
  if (typeof bet.official_odds === 'number') {
    return bet.official_odds;
  }
  if (typeof bet.odds === 'number') {
    return bet.odds;
  }
  return undefined;
};

const BettingPage: React.FC = () => {
  const [betGroups, setBetGroups] = useState<BetGroup[]>([]);
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 筛选条件
  const [selectedPlatform, setSelectedPlatform] = useState<string>('皇冠');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedTimezone, setSelectedTimezone] = useState<string>('UTC+8');

  // 统计数据
  const [stats, setStats] = useState({
    total_tickets: 10,
    total_bets: 71,
    pending_bets: 71,
    cancelled_bets: 0,
    total_amount: 173904.99,
    total_profit: 0,
    return_rate: 0,
  });

  const [pagination, setPagination] = useState<TablePagination>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadBets();
  }, [selectedAgent, selectedDate, selectedPlatform]);

  const loadInitialData = async () => {
    try {
      const [accountsRes, agentsPromise] = await Promise.allSettled([
        accountApi.getAccounts(),
        agentApi.getAgentList(),
      ]);

      if (accountsRes.status === 'fulfilled' && accountsRes.value.success && accountsRes.value.data) {
        setAccounts(accountsRes.value.data);
      }

      if (agentsPromise.status === 'fulfilled' && agentsPromise.value.success && agentsPromise.value.data) {
        setAgents(agentsPromise.value.data);
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadBets = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (selectedAgent) params.agent_id = selectedAgent;
      if (selectedDate) params.date = selectedDate.format('YYYY-MM-DD');

      const response = await betApi.getBets(params);
      if (response.success && response.data) {
        // 将注单按比赛分组
        const grouped = groupBetsByMatch(response.data.bets);
        setBetGroups(grouped);

        // 更新统计数据
        setStats({
          total_tickets: grouped.length,
          total_bets: response.data.bets.length,
          pending_bets: response.data.bets.filter((b: Bet) => b.status === 'pending').length,
          cancelled_bets: response.data.bets.filter((b: Bet) => b.status === 'cancelled').length,
          total_amount: response.data.stats.total_amount || 0,
          total_profit: response.data.stats.total_profit_loss || 0,
          return_rate: response.data.stats.total_profit_loss && response.data.stats.total_amount
            ? (response.data.stats.total_profit_loss / response.data.stats.total_amount) * 100
            : 0,
        });

        setPagination(prev => ({
          ...prev,
          total: grouped.length,
        }));
      }
    } catch (error) {
      console.error('Failed to load bets:', error);
      message.error('加载下注记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSettlements = async () => {
    try {
      setSyncing(true);
      const response = await betApi.syncSettlements();
      if (response.success) {
        const updatedCount = response.data?.updated_bets?.length ?? 0;
        const errorCount = response.data?.errors?.length ?? 0;
        const skippedCount = response.data?.skipped?.length ?? 0;
        const summaryText = response.message
          || `已同步 ${updatedCount} 条注单${errorCount ? `，${errorCount} 个账号失败` : ''}${skippedCount ? `，${skippedCount} 条跳过` : ''}`;

        if (errorCount > 0) {
          message.warning(summaryText);
        } else {
          message.success(summaryText);
        }
      } else {
        message.warning(response.error || '结算同步失败');
      }
      await loadBets();
    } catch (error) {
      console.error('Failed to sync settlements:', error);
      message.error('结算同步失败');
    } finally {
      setSyncing(false);
    }
  };

  // 按比赛分组注单
  const groupBetsByMatch = (bets: Bet[]): BetGroup[] => {
    const groups: { [key: string]: Bet[] } = {};

    bets.forEach(bet => {
      const matchKey = `${bet.match_id}_${bet.bet_type}_${bet.bet_option}`;
      if (!groups[matchKey]) {
        groups[matchKey] = [];
      }
      groups[matchKey].push(bet);
    });

    return Object.keys(groups).map((key, index) => {
      const groupBets = groups[key];
      const firstBet = groupBets[0];
      const completedBets = groupBets.filter(b => b.status === 'confirmed' || b.status === 'settled');
      const totalAmount = groupBets.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
      const completedAmount = completedBets.reduce((sum, b) => sum + Number(b.bet_amount || 0), 0);
      const betRate = totalAmount > 0 ? (completedAmount / totalAmount) : 0;

      // 计算平均赔率：所有账号的 official_odds 的平均值
      const validOdds = groupBets
        .map(b => resolveOfficialOdds(b))
        .filter((odds): odds is number => typeof odds === 'number');
      const averageOdds = validOdds.length > 0
        ? validOdds.reduce((sum, odds) => sum + odds, 0) / validOdds.length
        : undefined;

      // 计算盈亏：所有注单的 profit_loss 之和
      const totalProfitLoss = groupBets.reduce((sum, b) => sum + Number(b.profit_loss || 0), 0);

      // 统计已结算和已取消的注单数
      const settledCount = groupBets.filter(b => b.status === 'settled' && b.result !== 'cancelled').length;
      const cancelledCount = groupBets.filter(b => b.result === 'cancelled').length;

      return {
        key: key,
        match_info: `${firstBet.league_name || ''}\n${firstBet.home_team} vs ${firstBet.away_team}`,
        bet_target: `[${firstBet.bet_type}]${firstBet.bet_option}@${formatOdds(averageOdds)}`,
        completed_amount: `${completedAmount.toFixed(0)}/${totalAmount.toFixed(0)}`,
        bet_rate: betRate,
        average_odds: averageOdds,
        total_profit_loss: totalProfitLoss,
        bet_count: `${completedBets.length}/${groupBets.length}`,
        result_count: `${groupBets.length}/${settledCount}/${cancelledCount}`,
        time: dayjs(firstBet.created_at).format('HH:mm:ss'),
        bets: groupBets,
        status: completedBets.length === groupBets.length ? 'completed' : 'pending',
      };
    });
  };

  // 主表格列定义
  const mainColumns: ColumnsType<BetGroup> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      fixed: 'left',
      render: (status: string, record: BetGroup) => {
        if (status === 'completed') {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 13, padding: '4px 12px' }}>
              已完成
            </Tag>
          );
        } else {
          const percentage = Math.round(record.bet_rate * 100);
          return (
            <Tag color="processing" icon={<CloseCircleOutlined />} style={{ fontSize: 13, padding: '4px 12px' }}>
              {percentage}%
            </Tag>
          );
        }
      },
    },
    {
      title: '比赛信息',
      dataIndex: 'match_info',
      key: 'match_info',
      width: 220,
      fixed: 'left',
      render: (text: string) => {
        const lines = text.split('\n');
        return (
          <Space direction="vertical" size={2}>
            <Text type="secondary" style={{ fontSize: 11 }}>{lines[0]}</Text>
            <Text strong style={{ fontSize: 13, color: '#262626' }}>{lines[1]}</Text>
          </Space>
        );
      },
    },
    {
      title: '目标盘口',
      dataIndex: 'bet_target',
      key: 'bet_target',
      width: 250,
      render: (text: string) => (
        <Text style={{ fontSize: 13, color: '#1890ff', fontWeight: 500 }}>{text}</Text>
      ),
    },
    {
      title: '完成金额',
      dataIndex: 'completed_amount',
      key: 'completed_amount',
      width: 120,
      align: 'right',
      render: (text: string) => {
        const [completed, total] = text.split('/');
        return (
          <Space direction="vertical" size={0} style={{ width: '100%', alignItems: 'flex-end' }}>
            <Text strong style={{ fontSize: 14 }}>{completed}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>/ {total}</Text>
          </Space>
        );
      },
    },
    {
      title: '综合赔率',
      dataIndex: 'average_odds',
      key: 'average_odds',
      width: 100,
      align: 'center',
      render: (odds?: number) => (
        <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px', fontWeight: 'bold' }}>
          {formatOdds(odds)}
        </Tag>
      ),
    },
    {
      title: '输赢',
      dataIndex: 'total_profit_loss',
      key: 'total_profit_loss',
      width: 100,
      align: 'right',
      render: (profitLoss: number) => {
        const color = profitLoss > 0 ? '#52c41a' : profitLoss < 0 ? '#ff4d4f' : '#8c8c8c';
        const icon = profitLoss > 0 ? '↑' : profitLoss < 0 ? '↓' : '—';
        return (
          <span style={{ color, fontWeight: 'bold', fontSize: 14 }}>
            {icon} {Math.abs(profitLoss).toFixed(0)}
          </span>
        );
      },
    },
    {
      title: '总单/结算/划单',
      dataIndex: 'result_count',
      key: 'result_count',
      width: 140,
      align: 'center',
      render: (text: string) => {
        const [total, settled, cancelled] = text.split('/');
        return (
          <Space size={4}>
            <Badge count={total} style={{ backgroundColor: '#1890ff' }} />
            <Badge count={settled} style={{ backgroundColor: '#52c41a' }} />
            <Badge count={cancelled} style={{ backgroundColor: '#8c8c8c' }} />
          </Space>
        );
      },
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      align: 'center',
      render: (time: string) => (
        <Text style={{ fontSize: 13, color: '#595959' }}>{time}</Text>
      ),
    },
  ];

  // 展开的子表格列定义
  const expandedColumns: ColumnsType<BetDetail> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        if (status === 'settled') {
          return <Tag color="success" icon={<CheckCircleOutlined />}>已结算</Tag>;
        } else if (status === 'confirmed') {
          return <Tag color="processing" icon={<CloseCircleOutlined />}>已下单</Tag>;
        }
        return <Tag color="default">待处理</Tag>;
      },
    },
    {
      title: '单号',
      dataIndex: 'order_id',
      key: 'order_id',
      width: 160,
      render: (text: string) => (
        <Text copyable style={{ fontSize: 12, fontFamily: 'monospace' }}>{text}</Text>
      ),
    },
    {
      title: '员工',
      dataIndex: 'user_username',
      key: 'user_username',
      width: 100,
      render: (text: string) => (
        <Tag color="blue" style={{ fontSize: 12 }}>{text || '-'}</Tag>
      ),
    },
    {
      title: '账号',
      dataIndex: 'account_username',
      key: 'account_username',
      width: 120,
      render: (text: string) => (
        <Tag color="cyan" style={{ fontSize: 12 }}>{text}</Tag>
      ),
    },
    {
      title: '金额(实/虚)',
      dataIndex: 'amount_display',
      key: 'amount_display',
      width: 120,
      align: 'right',
      render: (text: string) => (
        <Text strong style={{ fontSize: 13 }}>{text}</Text>
      ),
    },
    {
      title: '赔率',
      dataIndex: 'official_odds',
      key: 'official_odds',
      width: 80,
      align: 'center',
      render: (value?: number) => (
        <Tag color="blue" style={{ fontWeight: 'bold' }}>{formatOdds(value)}</Tag>
      ),
    },
    {
      title: '输赢(实/虚)',
      dataIndex: 'input_display',
      key: 'input_display',
      width: 120,
      align: 'right',
      render: (text: string) => {
        const [real] = text.split('/');
        const value = parseFloat(real);
        const color = value > 0 ? '#52c41a' : value < 0 ? '#ff4d4f' : '#8c8c8c';
        return <Text strong style={{ color, fontSize: 13 }}>{text}</Text>;
      },
    },
    {
      title: '结果',
      dataIndex: 'result_score',
      key: 'result_score',
      width: 100,
      align: 'center',
      render: (score?: string) => score ? (
        <Tag color="purple" style={{ fontSize: 12, fontWeight: 'bold' }}>{score}</Tag>
      ) : (
        <Text type="secondary">-</Text>
      ),
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      align: 'center',
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{time}</Text>
      ),
    },
  ];

  // 展开的行渲染
  const expandedRowRender = (record: BetGroup) => {
  const detailData: BetDetail[] = record.bets.map(bet => ({
    key: bet.id.toString(),
    status: bet.status,
    order_id: bet.official_bet_id || `OU${bet.id}`,
    user_username: bet.user_username,  // 添加员工用户名
    account_username: bet.account_username || '',
    amount_display: `${bet.bet_amount}/${bet.single_limit}`,
    virtual_amount_display: bet.virtual_bet_amount !== undefined ? `${bet.virtual_bet_amount}/${bet.single_limit}` : undefined,
    bet_amount: bet.bet_amount,
    single_limit: bet.single_limit,
    official_odds: resolveOfficialOdds(bet),
    input_display: bet.virtual_profit_loss !== undefined
      ? `${bet.profit_loss || 0}/${bet.virtual_profit_loss}`
      : `${bet.profit_loss || 0}/${bet.single_limit}`,
    input_amount: bet.profit_loss || 0,
    result_score: bet.result_score,
    result_text: bet.result_text,
      input_limit: bet.single_limit,
      time: dayjs(bet.created_at).format('HH:mm:ss'),
    }));

    return (
      <Table
        columns={expandedColumns}
        dataSource={detailData}
        pagination={false}
        size="small"
      />
    );
  };

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>下注记录</Title>
        <Text type="secondary">查看和管理所有下注记录</Text>
      </div>

      {/* 筛选条件 */}
      <Card
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Space>
              <Text type="secondary">平台:</Text>
              <Select
                value={selectedPlatform}
                onChange={setSelectedPlatform}
                style={{ width: 120 }}
                options={[
                  { label: '皇冠', value: '皇冠' },
                ]}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Text type="secondary">代理:</Text>
              <Select
                value={selectedAgent}
                onChange={setSelectedAgent}
                placeholder="请选择代理"
                allowClear
                style={{ width: 150 }}
                options={agents.map(agent => ({
                  label: agent.username,
                  value: agent.id.toString(),
                }))}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Text type="secondary">日期:</Text>
              <DatePicker
                value={selectedDate}
                onChange={(date) => date && setSelectedDate(date)}
                format="YYYY-MM-DD"
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Text type="secondary">时区:</Text>
              <Select
                value={selectedTimezone}
                onChange={setSelectedTimezone}
                style={{ width: 100 }}
                options={[
                  { label: 'UTC+8', value: 'UTC+8' },
                  { label: 'UTC+0', value: 'UTC+0' },
                ]}
              />
            </Space>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button
                type="primary"
                onClick={handleSyncSettlements}
                loading={syncing}
                disabled={loading}
                icon={<CheckCircleOutlined />}
              >
                结算
              </Button>
              <Button
                onClick={() => message.info('清理功能待实现')}
                icon={<ReloadOutlined />}
              >
                清理
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 统计栏 - 卡片式布局 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={3}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>票单数</Text>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff', marginTop: 8 }}>
                {stats.total_tickets}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={3}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>注单数</Text>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff', marginTop: 8 }}>
                {stats.total_bets}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={3}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>未结算</Text>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14', marginTop: 8 }}>
                {stats.pending_bets}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={3}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>已取消</Text>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#8c8c8c', marginTop: 8 }}>
                {stats.cancelled_bets}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={4}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>总金额</Text>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#722ed1', marginTop: 8 }}>
                {stats.total_amount.toFixed(0)}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={4}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>输赢</Text>
              <div style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: stats.total_profit > 0 ? '#52c41a' : stats.total_profit < 0 ? '#ff4d4f' : '#8c8c8c',
                marginTop: 8
              }}>
                {stats.total_profit > 0 ? '+' : ''}{stats.total_profit.toFixed(0)}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={4}>
          <Card bodyStyle={{ padding: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>回报率</Text>
              <div style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: stats.return_rate > 0 ? '#52c41a' : stats.return_rate < 0 ? '#ff4d4f' : '#8c8c8c',
                marginTop: 8
              }}>
                {stats.return_rate.toFixed(1)}%
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 主表格 */}
      <Card
        title={
          <Space>
            <Text strong style={{ fontSize: 16 }}>下注列表</Text>
            <Badge count={betGroups.length} style={{ backgroundColor: '#1890ff' }} />
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={loadBets}
            loading={loading}
            type="text"
          >
            刷新
          </Button>
        }
        bodyStyle={{ padding: '0' }}
      >
        <Table
          columns={mainColumns}
          dataSource={betGroups}
          rowKey="key"
          loading={loading}
          expandable={{
            expandedRowRender,
            defaultExpandAllRows: false,
            expandIcon: ({ expanded, onExpand, record }) => (
              expanded ? (
                <Button
                  type="link"
                  size="small"
                  onClick={e => onExpand(record, e)}
                  style={{ padding: 0 }}
                >
                  收起 ▲
                </Button>
              ) : (
                <Button
                  type="link"
                  size="small"
                  onClick={e => onExpand(record, e)}
                  style={{ padding: 0 }}
                >
                  展开 ▼
                </Button>
              )
            ),
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize }));
            },
            style: { padding: '16px 24px' },
          }}
          scroll={{ x: 1400 }}
          size="middle"
          rowClassName={(record, index) => index % 2 === 0 ? 'table-row-light' : 'table-row-dark'}
        />
      </Card>

      <style>{`
        .table-row-light {
          background-color: #ffffff;
        }
        .table-row-dark {
          background-color: #fafafa;
        }
        .table-row-light:hover,
        .table-row-dark:hover {
          background-color: #e6f7ff !important;
        }
        .ant-table-expanded-row > td {
          background-color: #f5f5f5 !important;
        }
      `}</style>
    </div>
  );
};

export default BettingPage;
