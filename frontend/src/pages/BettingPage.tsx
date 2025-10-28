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
  account_username: string;
  amount_display: string;
  bet_amount: number;
  single_limit: number;
  official_odds?: number;
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

      return {
        key: key,
        match_info: `${firstBet.league_name || ''}\n${firstBet.home_team} vs ${firstBet.away_team}`,
        bet_target: `[${firstBet.bet_type}]${firstBet.bet_option}@${formatOdds(resolveOfficialOdds(firstBet))}`,
        completed_amount: `${completedAmount.toFixed(0)}/${totalAmount.toFixed(0)}`,
        bet_rate: betRate,
        bet_count: `${completedBets.length}/${groupBets.length}`,
        result_count: `${groupBets.filter(b => b.status === 'settled').length}/0/0`,
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
      render: (status: string, record: BetGroup) => {
        if (status === 'completed') {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              100%
            </Tag>
          );
        } else {
          const percentage = Math.round(record.bet_rate * 100);
          return (
            <Tag color="processing" icon={<CloseCircleOutlined />}>
              {percentage}%
            </Tag>
          );
        }
      },
    },
    {
      title: '比赛',
      dataIndex: 'match_info',
      key: 'match_info',
      width: 200,
      render: (text: string) => {
        const lines = text.split('\n');
        return (
          <Space direction="vertical" size={0}>
            <Text type="secondary" style={{ fontSize: 12 }}>{lines[0]}</Text>
            <Text strong style={{ fontSize: 13 }}>{lines[1]}</Text>
          </Space>
        );
      },
    },
    {
      title: '目标盘口',
      dataIndex: 'bet_target',
      key: 'bet_target',
      width: 250,
    },
    {
      title: '完成金额',
      dataIndex: 'completed_amount',
      key: 'completed_amount',
      width: 120,
      align: 'right',
    },
    {
      title: '综合赔率',
      dataIndex: 'bet_rate',
      key: 'bet_rate',
      width: 100,
      align: 'right',
      render: (rate: number) => (rate * 100).toFixed(1) + '%',
    },
    {
      title: '输赢',
      key: 'win_loss',
      width: 100,
      align: 'right',
      render: () => '0',
    },
    {
      title: '总单/结算/划单',
      dataIndex: 'bet_count',
      key: 'bet_count',
      width: 120,
      align: 'center',
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      align: 'center',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center',
      render: () => '-',
    },
  ];

  // 展开的子表格列定义
  const expandedColumns: ColumnsType<BetDetail> = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        if (status === 'confirmed' || status === 'settled') {
          return <Tag color="success">已下单</Tag>;
        }
        return <Tag color="default">待处理</Tag>;
      },
    },
    {
      title: '单号',
      dataIndex: 'order_id',
      key: 'order_id',
      width: 180,
    },
    {
      title: '账号',
      dataIndex: 'account_username',
      key: 'account_username',
      width: 120,
    },
    {
      title: '金额(实/虚)',
      dataIndex: 'amount_display',
      key: 'amount_display',
      width: 120,
      align: 'right',
    },
    {
      title: '赔率',
      dataIndex: 'official_odds',
      key: 'official_odds',
      width: 80,
      align: 'right',
      render: (value?: number) => formatOdds(value),
    },
    {
      title: '输赢(实/虚)',
      dataIndex: 'input_display',
      key: 'input_display',
      width: 120,
      align: 'right',
    },
    {
      title: '时间',
      dataIndex: 'time',
      key: 'time',
      width: 100,
      align: 'center',
    },
  ];

  // 展开的行渲染
  const expandedRowRender = (record: BetGroup) => {
  const detailData: BetDetail[] = record.bets.map(bet => ({
    key: bet.id.toString(),
    status: bet.status,
    order_id: bet.official_bet_id || `OU${bet.id}`,
    account_username: bet.account_username || '',
    amount_display: `${bet.bet_amount}/${bet.single_limit}`,
    bet_amount: bet.bet_amount,
    single_limit: bet.single_limit,
    official_odds: resolveOfficialOdds(bet),
    input_display: `${bet.profit_loss || 0}/${bet.single_limit}`,
    input_amount: bet.profit_loss || 0,
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
    <div style={{ padding: '24px', background: '#f0f2f5' }}>
      <Card style={{ marginBottom: 16 }}>
        {/* 筛选条件 */}
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Text>平台</Text>
          </Col>
          <Col>
            <Select
              value={selectedPlatform}
              onChange={setSelectedPlatform}
              style={{ width: 120 }}
              options={[
                { label: '皇冠', value: '皇冠' },
              ]}
            />
          </Col>
          <Col>
            <Text>代理</Text>
          </Col>
          <Col>
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
          </Col>
          <Col>
            <Text>日期</Text>
          </Col>
          <Col>
            <DatePicker
              value={selectedDate}
              onChange={(date) => date && setSelectedDate(date)}
              format="YYYY-MM-DD"
            />
          </Col>
          <Col>
            <Text>时区</Text>
          </Col>
          <Col>
            <Select
              value={selectedTimezone}
              onChange={setSelectedTimezone}
              style={{ width: 100 }}
              options={[
                { label: 'UTC+8', value: 'UTC+8' },
                { label: 'UTC+0', value: 'UTC+0' },
              ]}
            />
          </Col>
          <Col>
            <Button
              type="primary"
              onClick={handleSyncSettlements}
              loading={syncing}
              disabled={loading}
            >
              结算
            </Button>
          </Col>
          <Col>
            <Button onClick={() => message.info('清理功能待实现')}>清理</Button>
          </Col>
        </Row>
      </Card>

      {/* 统计栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col>
            <Text strong>
              票单:{stats.total_tickets} 注单:{stats.total_bets} 未结:{stats.pending_bets} 取消:{stats.cancelled_bets} 金额:{stats.total_amount.toFixed(2)} 输赢:{stats.total_profit.toFixed(2)} 回报率:{stats.return_rate.toFixed(1)}%
            </Text>
          </Col>
        </Row>
      </Card>

      {/* 主表格 */}
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadBets}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={mainColumns}
          dataSource={betGroups}
          rowKey="key"
          loading={loading}
          expandable={{
            expandedRowRender,
            defaultExpandAllRows: false,
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize }));
            },
          }}
          scroll={{ x: 1400 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default BettingPage;
