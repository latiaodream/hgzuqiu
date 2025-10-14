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
  Modal,
  Form,
  Input,
  InputNumber,
  Alert,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  SearchOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CoinTransaction, CrownAccount, TablePagination, CoinStats } from '../types';
import { coinApi, accountApi } from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const CoinsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [stats, setStats] = useState<CoinStats['transaction_summary']>({});
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // 模态框状态
  const [manualFormVisible, setManualFormVisible] = useState(false);
  const [form] = Form.useForm();

  const [pagination, setPagination] = useState<TablePagination>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  useEffect(() => {
    loadAccounts();
    loadTransactions();
    loadBalance();
    loadAnalytics();
  }, [selectedType, dateRange]);

  const loadAccounts = async () => {
    try {
      const response = await accountApi.getAccounts();
      if (response.success && response.data) {
        setAccounts(response.data);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const params: any = {};

      if (selectedType) params.type = selectedType;
      if (dateRange) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await coinApi.getTransactions(params);
      if (response.success && response.data) {
        setTransactions(response.data.transactions);
        setStats(response.data.stats.transaction_summary);
        setPagination(prev => ({
          ...prev,
          total: response.data!.transactions.length,
        }));
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      message.error('加载金币流水失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = async () => {
    try {
      const response = await coinApi.getBalance();
      if (response.success && response.data) {
        setCurrentBalance(response.data.balance);
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await coinApi.getAnalytics('7d');
      if (response.success && response.data) {
        setAnalyticsData(response.data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const handleCreateManualTransaction = () => {
    setManualFormVisible(true);
    form.resetFields();
  };

  const handleManualFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      const response = await coinApi.createTransaction({
        transaction_type: values.transaction_type,
        amount: values.amount,
        description: values.description,
        account_id: values.account_id,
      });

      if (response.success) {
        message.success('手动调整记录创建成功');
        setManualFormVisible(false);
        loadTransactions();
        loadBalance();
      }
    } catch (error) {
      console.error('Failed to create manual transaction:', error);
      message.error('创建调整记录失败');
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case '消耗': return 'red';
      case '返还': return 'green';
      case '充值': return 'blue';
      case '提现': return 'orange';
      case '调整': return 'purple';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case '消耗':
      case '提现':
        return <FallOutlined style={{ color: '#ff4d4f' }} />;
      case '返还':
      case '充值':
        return <RiseOutlined style={{ color: '#52c41a' }} />;
      default:
        return <DollarOutlined />;
    }
  };

  // 表格列定义
  const columns: ColumnsType<CoinTransaction> = [
    {
      title: '交易ID',
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      width: 150,
      render: (text: string) => (
        <Text code style={{ fontSize: 12 }}>{text}</Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      width: 100,
      render: (type: string) => (
        <Space>
          {getTypeIcon(type)}
          <Tag color={getTypeColor(type)}>{type}</Tag>
        </Space>
      ),
    },
    {
      title: '账号',
      key: 'account',
      width: 120,
      render: (_, record: CoinTransaction) => (
        record.account_username ? (
          <Space direction="vertical" size={0}>
            <Text strong>{record.account_username}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.account_display_name}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">系统操作</Text>
        )
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount: number) => (
        <Text
          strong
          style={{
            color: amount >= 0 ? '#52c41a' : '#ff4d4f',
            fontSize: 14
          }}
        >
          {amount >= 0 ? '+' : ''}¥{amount}
        </Text>
      ),
    },
    {
      title: '变动前余额',
      dataIndex: 'balance_before',
      key: 'balance_before',
      width: 120,
      render: (balance: number) => (
        <Text>¥{balance}</Text>
      ),
    },
    {
      title: '变动后余额',
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 120,
      render: (balance: number) => (
        <Text strong>¥{balance}</Text>
      ),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text: string) => dayjs(text).format('MM-DD HH:mm:ss'),
    },
  ];

  // 统计卡片数据
  const getStatsCards = () => {
    const totalIncome = Object.entries(stats)
      .filter(([type]) => ['返还', '充值'].includes(type))
      .reduce((sum, [, data]) => sum + data.total_amount, 0);

    const totalExpense = Object.entries(stats)
      .filter(([type]) => ['消耗', '提现'].includes(type))
      .reduce((sum, [, data]) => sum + Math.abs(data.total_amount), 0);

    const totalTransactions = Object.values(stats)
      .reduce((sum, data) => sum + data.count, 0);

    return [
      {
        title: '当前余额',
        value: currentBalance,
        prefix: <DollarOutlined />,
        suffix: '元',
        valueStyle: { color: '#1890ff' },
      },
      {
        title: '总收入',
        value: totalIncome,
        prefix: <RiseOutlined />,
        suffix: '元',
        valueStyle: { color: '#52c41a' },
      },
      {
        title: '总支出',
        value: totalExpense,
        prefix: <FallOutlined />,
        suffix: '元',
        valueStyle: { color: '#ff4d4f' },
      },
      {
        title: '交易笔数',
        value: totalTransactions,
        prefix: <BarChartOutlined />,
      },
    ];
  };

  return (
    <div>
      <Title level={2}>金币流水</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {getStatsCards().map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card>
              <Statistic {...stat} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs
          defaultActiveKey="transactions"
          items={[
            {
              key: 'transactions',
              label: '流水记录',
              children: (
                <>
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={8} md={6}>
                      <Select
                        placeholder="筛选类型"
                        style={{ width: '100%' }}
                        allowClear
                        value={selectedType}
                        onChange={setSelectedType}
                        options={[
                          { label: '全部类型', value: '' },
                          { label: '消耗', value: '消耗' },
                          { label: '返还', value: '返还' },
                          { label: '充值', value: '充值' },
                          { label: '提现', value: '提现' },
                          { label: '调整', value: '调整' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} sm={10} md={8}>
                      <RangePicker
                        style={{ width: '100%' }}
                        value={dateRange}
                        onChange={(dates) => {
                          if (dates && dates[0] && dates[1]) {
                            setDateRange([dates[0], dates[1]] as [dayjs.Dayjs, dayjs.Dayjs]);
                          } else {
                            setDateRange(null);
                          }
                        }}
                        format="YYYY-MM-DD"
                        placeholder={['开始日期', '结束日期']}
                      />
                    </Col>
                    <Col xs={24} sm={6} md={10}>
                      <Space>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={handleCreateManualTransaction}
                        >
                          手动调整
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={loadTransactions}
                        >
                          刷新
                        </Button>
                      </Space>
                    </Col>
                  </Row>

                  <Table
                    columns={columns}
                    dataSource={transactions}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                      ...pagination,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) =>
                        `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                    }}
                    scroll={{ x: 1200 }}
                    size="small"
                  />
                </>
              ),
            },
            {
              key: 'analytics',
              label: '统计分析',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card title="交易类型分布" size="small">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {Object.entries(stats).map(([type, data]) => (
                          <Row key={type} justify="space-between" align="middle">
                            <Col>
                              <Space>
                                {getTypeIcon(type)}
                                <Tag color={getTypeColor(type)}>{type}</Tag>
                              </Space>
                            </Col>
                            <Col>
                              <Space>
                                <Text>{data.count}笔</Text>
                                <Text strong>
                                  ¥{Math.abs(data.total_amount)}
                                </Text>
                              </Space>
                            </Col>
                          </Row>
                        ))}
                      </Space>
                    </Card>
                  </Col>

                  <Col xs={24} lg={12}>
                    <Card title="最近7天趋势" size="small">
                      {analyticsData && (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Statistic
                            title="7天交易笔数"
                            value={analyticsData.summary.total_transactions}
                            prefix={<BarChartOutlined />}
                          />
                          <Statistic
                            title="7天净收入"
                            value={analyticsData.summary.net_amount}
                            prefix={
                              analyticsData.summary.net_amount >= 0 ?
                              <RiseOutlined /> :
                              <FallOutlined />
                            }
                            valueStyle={{
                              color: analyticsData.summary.net_amount >= 0 ? '#52c41a' : '#ff4d4f'
                            }}
                            suffix="元"
                          />
                        </Space>
                      )}
                    </Card>
                  </Col>
                </Row>
              ),
            }
          ]}
        />
      </Card>

      {/* 手动调整模态框 */}
      <Modal
        title="手动调整金币"
        open={manualFormVisible}
        onOk={handleManualFormSubmit}
        onCancel={() => setManualFormVisible(false)}
        maskClosable={false}
      >
        <Alert
          message="注意"
          description="手动调整会直接影响用户金币余额，请谨慎操作。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={form} layout="vertical">
          <Form.Item
            name="transaction_type"
            label="调整类型"
            rules={[{ required: true, message: '请选择调整类型' }]}
          >
            <Select>
              <Select.Option value="充值">充值</Select.Option>
              <Select.Option value="提现">提现</Select.Option>
              <Select.Option value="调整">调整</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label="调整金额"
            rules={[
              { required: true, message: '请输入调整金额' },
              { type: 'number', message: '请输入有效数字' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="正数为增加，负数为减少"
              addonAfter="元"
            />
          </Form.Item>

          <Form.Item
            name="account_id"
            label="关联账号"
          >
            <Select placeholder="可选，选择关联的皇冠账号" allowClear>
              {accounts.map(account => (
                <Select.Option key={account.id} value={account.id}>
                  {account.username} ({account.display_name})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="调整说明"
            rules={[{ required: true, message: '请输入调整说明' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请详细说明调整原因..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CoinsPage;
