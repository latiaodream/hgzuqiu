import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  DatePicker,
  Select,
  Button,
  Space,
  Spin,
  message,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../contexts/AuthContext';
import { betApi, staffApi, accountApi } from '../services/api';
import type { User, CrownAccount } from '../types';

const { RangePicker } = DatePicker;

interface DashboardStats {
  totalBetAmount: number;      // 投注金额
  actualAmount: number;         // 实数金额
  actualWinLoss: number;        // 实数输赢
  totalTickets: number;         // 票单数
  totalBets: number;            // 注单数
  canceledBets: number;         // 划单数（含赛中）
}

const DashboardPage: React.FC = () => {
  const { user, isAdmin, isAgent } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('day'),
    dayjs().endOf('day'),
  ]);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [subUsers, setSubUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalBetAmount: 0,
    actualAmount: 0,
    actualWinLoss: 0,
    totalTickets: 0,
    totalBets: 0,
    canceledBets: 0,
  });

  // 检测是否为移动端
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    loadSubUsers();
    loadAccounts();
    loadDashboardData();
  }, []);

  // 加载下级用户列表
  const loadSubUsers = async () => {
    if (!isAdmin && !isAgent) return;

    try {
      const response = await staffApi.getStaffList();
      if (response.success && response.data) {
        setSubUsers(response.data);
      }
    } catch (error) {
      console.error('加载下级用户失败:', error);
    }
  };

  // 加载账号列表
  const loadAccounts = async () => {
    try {
      const response = await accountApi.getAccounts();
      if (response.success && response.data) {
        setAccounts(response.data);
      }
    } catch (error) {
      console.error('加载账号列表失败:', error);
    }
  };

  // 加载数据
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 构建查询参数
      const params: any = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD'),
      };

      if (selectedUserId) {
        params.user_id = selectedUserId;
      }

      if (selectedAccountId) {
        params.account_id = selectedAccountId;
      }

      // 获取下注统计数据
      const response = await betApi.getStats(params);

      if (response.success && response.data) {
        const data = response.data;
        setStats({
          totalBetAmount: data.total_bet_amount || 0,
          actualAmount: data.actual_amount || 0,
          actualWinLoss: data.actual_win_loss || 0,
          totalTickets: data.total_tickets || 0,
          totalBets: data.total_bets || 0,
          canceledBets: data.canceled_bets || 0,
        });
      }
    } catch (error: any) {
      console.error('加载数据失败:', error);
      message.error(error.response?.data?.error || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadDashboardData();
  };

  return (
    <div style={{ margin: 0, padding: 0 }}>
      {/* 筛选条件 */}
      <Card style={{ marginBottom: isMobile ? 8 : 16 }}>
        <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
          <Space style={{ width: isMobile ? '100%' : 'auto' }}>
            <span>开始</span>
            <DatePicker
              value={dateRange[0]}
              onChange={(date) => date && setDateRange([date, dateRange[1]])}
              format="YYYY-MM-DD"
              style={{ flex: isMobile ? 1 : undefined }}
            />
          </Space>

          <Space style={{ width: isMobile ? '100%' : 'auto' }}>
            <span>结束</span>
            <DatePicker
              value={dateRange[1]}
              onChange={(date) => date && setDateRange([dateRange[0], date])}
              format="YYYY-MM-DD"
              style={{ flex: isMobile ? 1 : undefined }}
            />
          </Space>

          {(isAdmin || isAgent) && (
            <Select
              style={{ width: isMobile ? '100%' : 200 }}
              placeholder="子用户"
              allowClear
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={[
                ...subUsers.map(u => ({
                  label: u.username,
                  value: u.id,
                }))
              ]}
            />
          )}

          <Select
            style={{ width: isMobile ? '100%' : 200 }}
            placeholder="账号筛选"
            showSearch
            allowClear
            value={selectedAccountId || undefined}
            onChange={(value) => setSelectedAccountId(value || '')}
            options={accounts.map(acc => ({
              label: acc.username,
              value: acc.id.toString(),
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
            style={{ width: isMobile ? '100%' : 'auto' }}
          >
            查询
          </Button>
        </Space>
      </Card>

      {/* 统计卡片 */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={isMobile ? [8, 8] : [16, 16]}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="投注金额"
                  value={stats.totalBetAmount}
                  precision={2}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="实数金额"
                  value={stats.actualAmount}
                  precision={2}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="实数输赢"
                  value={stats.actualWinLoss}
                  precision={2}
                  valueStyle={{
                    color: stats.actualWinLoss >= 0 ? '#3f8600' : '#cf1322'
                  }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={isMobile ? [8, 8] : [16, 16]} style={{ marginTop: isMobile ? 8 : 16 }}>
            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="票单数"
                  value={stats.totalTickets}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="注单数"
                  value={stats.totalBets}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8}>
              <Card>
                <Statistic
                  title="划单数(含赛中)"
                  value={stats.canceledBets}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
