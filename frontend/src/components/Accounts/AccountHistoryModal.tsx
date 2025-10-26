import React, { useState, useEffect } from 'react';
import { Modal, Table, message, Spin, DatePicker, Space, Button, Statistic, Row, Col, Card } from 'antd';
import { crownApi } from '../../services/api';
import type { CrownAccount } from '../../types';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface AccountHistoryModalProps {
  visible: boolean;
  account: CrownAccount | null;
  onClose: () => void;
}

interface HistoryRecord {
  date: string;
  dayOfWeek: string;
  betAmount: number;
  validAmount: number;
  winLoss: number;
}

const AccountHistoryModal: React.FC<AccountHistoryModalProps> = ({
  visible,
  account,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState<HistoryRecord[]>([]);
  const [total, setTotal] = useState<{
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }>({ betAmount: 0, validAmount: 0, winLoss: 0 });
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(8, 'day'),
    dayjs().subtract(1, 'day'),  // 默认到昨天
  ]);

  useEffect(() => {
    if (visible && account) {
      loadHistory();
    }
  }, [visible, account]);

  const loadHistory = async () => {
    if (!account) return;

    try {
      setLoading(true);
      const response = await crownApi.getAccountHistory(account.id, {
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
      });

      console.log('📊 [前端] 收到历史数据响应:', response);

      if (response.success) {
        // 后端直接返回 { success: true, data: [...], total: {...} }
        const historyRecords = response.data || [];
        const totalStats = response.total || { betAmount: 0, validAmount: 0, winLoss: 0 };

        console.log('📊 [前端] 解析后的数据:', { historyRecords, totalStats });

        setHistoryData(historyRecords);
        setTotal(totalStats);
      } else {
        message.error(response.error || '获取历史数据失败');
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      message.error('获取历史数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 150,
      render: (date: string, record: HistoryRecord) => (
        <div>
          <div>{date.substring(5)}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>星期{record.dayOfWeek}</div>
        </div>
      ),
    },
    {
      title: '投注金额',
      dataIndex: 'betAmount',
      key: 'betAmount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => (
        <span>{amount > 0 ? amount.toLocaleString() : '-'}</span>
      ),
    },
    {
      title: '有效金额',
      dataIndex: 'validAmount',
      key: 'validAmount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => (
        <span>{amount > 0 ? amount.toLocaleString() : '-'}</span>
      ),
    },
    {
      title: '赢/输',
      dataIndex: 'winLoss',
      key: 'winLoss',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => {
        if (amount === 0) return <span>-</span>;
        const color = amount > 0 ? '#52c41a' : '#ff4d4f';
        return (
          <span style={{ color, fontWeight: 'bold' }}>
            {amount > 0 ? '+' : ''}{amount.toFixed(2)}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      title={`账户历史总览 - ${account?.username || ''}`}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 日期选择器和查询按钮 */}
          <Space>
            <RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              format="YYYY-MM-DD"
              allowClear={false}
            />
            <Button type="primary" onClick={loadHistory}>
              查询
            </Button>
          </Space>

          {/* 统计卡片 */}
          <Row gutter={16}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总投注金额"
                  value={total.betAmount}
                  precision={2}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总有效金额"
                  value={total.validAmount}
                  precision={2}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总赢/输"
                  value={total.winLoss}
                  precision={2}
                  valueStyle={{ color: total.winLoss >= 0 ? '#52c41a' : '#ff4d4f' }}
                  prefix={total.winLoss > 0 ? '+' : ''}
                />
              </Card>
            </Col>
          </Row>

          {/* 历史数据表格 */}
          <Table
            columns={columns}
            dataSource={historyData}
            rowKey="date"
            pagination={false}
            scroll={{ y: 400 }}
            size="small"
            locale={{
              emptyText: '暂无数据',
            }}
          />
        </Space>
      </Spin>
    </Modal>
  );
};

export default AccountHistoryModal;

