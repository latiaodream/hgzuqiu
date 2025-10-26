import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  Row,
  Col,
  Space,
  Tag,
  Checkbox,
  message,
  Button,
  Spin,
  Empty,
  Alert,
  Statistic,
} from 'antd';
import { TrophyOutlined, DollarOutlined } from '@ant-design/icons';
import type { Match, CrownAccount, BetCreateRequest, AccountSelectionResponse } from '../../types';
import { betApi, accountApi, coinApi } from '../../services/api';
import dayjs from 'dayjs';
import type { AxiosError } from 'axios';

const { Option } = Select;

interface BetFormModalProps {
  visible: boolean;
  match: Match | null;
  accounts: CrownAccount[];
  onCancel: () => void;
  onSubmit: () => void;
  defaultSelection?: {
    bet_type: string;
    bet_option: string;
    odds: number;
    label?: string;
  } | null;
}

const BetFormModal: React.FC<BetFormModalProps> = ({
  visible,
  match,
  accounts,
  onCancel,
  onSubmit,
  defaultSelection,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [estimatedPayout, setEstimatedPayout] = useState(0);
  const [selectionLabel, setSelectionLabel] = useState('');
  const [betMode, setBetMode] = useState<'优选' | '平均'>('优选');
  const [autoSelection, setAutoSelection] = useState<AccountSelectionResponse | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [requiredCoins, setRequiredCoins] = useState(0);

  const formatOddsValue = (value: number) => Number(value).toFixed(3).replace(/\.?0+$/, '');

  const accountDict = useMemo(() => {
    const map = new Map<number, CrownAccount>();
    accounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const getLineKey = useCallback((accountId: number): string => {
    const meta = autoSelection?.eligible_accounts.find(entry => entry.account.id === accountId)
      || autoSelection?.excluded_accounts.find(entry => entry.account.id === accountId);
    if (meta?.account.line_key) {
      return meta.account.line_key;
    }

    const account = accounts.find(item => item.id === accountId);
    const base = (account?.original_username || account?.username || '').trim();
    return base ? base.slice(0, 4).toUpperCase() : 'UNKNOWN';
  }, [accounts, autoSelection]);


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

  const watchedBetType = Form.useWatch('bet_type', form);
  const watchedBetOption = Form.useWatch('bet_option', form);
  const watchedOdds = Form.useWatch('odds', form);

  useEffect(() => {
    if (visible && match) {
      form.resetFields();
      setSelectedAccounts([]);
      setEstimatedPayout(0);
      const defaults = {
        bet_type: defaultSelection?.bet_type || '让球',
        bet_option: defaultSelection?.bet_option || '主队',
        odds: defaultSelection?.odds || 1.85,
      };
      setSelectionLabel(defaultSelection?.label || '');
      setAutoSelection(null);
      setAutoLoading(false);
      form.setFieldsValue({
        bet_type: defaults.bet_type,
        bet_option: defaults.bet_option,
        bet_amount: 100,
        odds: defaults.odds,
        single_limit: 100,
        interval_seconds: 3,
        quantity: 1,
        total_amount: undefined,
        interval_range: '1-3',
        group: undefined,
        account_ids: [],
      });
      loadCoinBalance();
    }
  }, [visible, match, form, defaultSelection]);

  const isTruthy = (value: any): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return ['1', 'true', 'TRUE', 'True', 'online', 'ONLINE'].includes(value.trim());
    }
    return !!value;
  };

  const accountMetaMap = useMemo(() => {
    const map = new Map<number, AccountSelectionResponse['eligible_accounts'][number]>();
    if (autoSelection) {
      autoSelection.eligible_accounts.forEach(entry => {
        map.set(entry.account.id, entry);
      });
      autoSelection.excluded_accounts.forEach(entry => {
        map.set(entry.account.id, entry);
      });
    }
    return map;
  }, [autoSelection]);

  const isAccountOnline = useCallback((accountId: number): boolean => {
    const meta = accountMetaMap.get(accountId);
    if (meta) {
      if (meta.flags?.offline) {
        return false;
      }
      if (meta.account && meta.account.is_online !== undefined) {
        return isTruthy(meta.account.is_online);
      }
    }

    const account = accountDict.get(accountId);
    if (account && account.is_online !== undefined) {
      return isTruthy(account.is_online);
    }

    return false;
  }, [accountMetaMap, accountDict]);

  const fetchAutoSelection = useCallback(async (limit?: number, silent = false) => {
    if (!match) return;

    try {
      setAutoLoading(true);
      const response = await accountApi.autoSelect({ match_id: match.id, limit });
      if (!response.success || !response.data) {
        if (!silent) {
          message.error(response.error || '优选账号失败');
        }
        return;
      }

      setAutoSelection(response.data);

      const usedLines = new Set<string>();
      const recommended: number[] = [];
      response.data.eligible_accounts.forEach((entry) => {
        if (entry.flags?.offline) {
          return;
        }
        const fallbackOnline = accountDict.get(entry.account.id)?.is_online;
        const entryOnline = entry.account.is_online !== undefined
          ? isTruthy(entry.account.is_online)
          : isTruthy(fallbackOnline);
        if (!entryOnline) {
          return;
        }
        const lineKey = entry.account.line_key || 'UNKNOWN';
        if (usedLines.has(lineKey)) {
          return;
        }
        usedLines.add(lineKey);
        recommended.push(entry.account.id);
      });
      const skippedCount = response.data.eligible_accounts.length - recommended.length;
      if (recommended.length === 0) {
      setSelectedAccounts([]);
      form.setFieldValue('account_ids', []);
      if (!silent) {
        message.warning('当前无符合条件的在线账号');
      }
      return;
    }

      setSelectedAccounts(recommended);
      form.setFieldValue('account_ids', recommended);
      calculatePayout(recommended.length);

      if (!silent) {
        const baseMsg = `已优选 ${recommended.length} 个在线账号`;
        message.success(skippedCount > 0 ? `${baseMsg}（自动跳过 ${skippedCount} 个同线路账号）` : baseMsg);
      }
    } catch (error) {
      console.error('Auto select accounts failed:', error);
      if (!silent) {
        message.error('优选账号失败');
      }
    } finally {
      setAutoLoading(false);
    }
  }, [form, match, accountDict]);

  useEffect(() => {
    if (!visible || !match) return;
    if (betMode !== '优选') return;
    fetchAutoSelection(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, match, betMode]);

  const handleAccountsChange = (accountIds: Array<number | string>) => {
    const normalized = accountIds.map(id => Number(id));
    setSelectedAccounts(normalized);
    form.setFieldValue('account_ids', normalized);

    // 如果总金额有值，重新计算单注金额
    const totalAmount = form.getFieldValue('total_amount');
    if (totalAmount > 0) {
      const quantity = form.getFieldValue('quantity') || 1;
      const accountCount = normalized.length || 1;
      const betAmount = Math.floor(totalAmount / (quantity * accountCount));
      form.setFieldValue('bet_amount', betAmount);
    }

    calculatePayout(normalized.length);
  };

  const calculatePayout = (accountCountOverride?: number) => {
    const betAmount = form.getFieldValue('bet_amount') || 0;
    const odds = form.getFieldValue('odds') || 1;
    const quantity = form.getFieldValue('quantity') || 1;
    const accountCount = accountCountOverride ?? selectedAccounts.length;

    const payout = betAmount * odds * quantity * accountCount;
    setEstimatedPayout(payout);

    // 计算需要的金币（下注金额 × 数量 × 账号数量）
    const required = betAmount * quantity * accountCount;
    setRequiredCoins(required);
  };

  const handleFormValuesChange = (changedValues: any) => {
    console.log('🔄 表单值变化:', changedValues);

    // 如果总金额变化，自动计算单注金额
    if ('total_amount' in changedValues) {
      const totalAmount = changedValues.total_amount || 0;
      const quantity = form.getFieldValue('quantity') || 1;
      const accountCount = selectedAccounts.length || 1;

      console.log('💰 总金额变化:', { totalAmount, quantity, accountCount });

      if (totalAmount > 0) {
        // 单注金额 = 总金额 / (数量 × 账号数量)
        const betAmount = Math.floor(totalAmount / (quantity * accountCount));
        console.log('✅ 计算单注金额:', betAmount);
        form.setFieldValue('bet_amount', betAmount);
      }
    }

    // 如果数量或账号数量变化，且总金额有值，重新计算单注金额
    if (('quantity' in changedValues || 'account_ids' in changedValues)) {
      const totalAmount = form.getFieldValue('total_amount');
      if (totalAmount > 0) {
        const quantity = form.getFieldValue('quantity') || 1;
        const accountCount = selectedAccounts.length || 1;
        const betAmount = Math.floor(totalAmount / (quantity * accountCount));
        console.log('✅ 重新计算单注金额:', betAmount);
        form.setFieldValue('bet_amount', betAmount);
      }
    }

    calculatePayout();
  };

  const handleModeSwitch = (mode: '优选' | '平均') => {
    setBetMode(mode);
    if (mode === '优选') {
      fetchAutoSelection(undefined, true);
    }
  };

  const handleSubmit = async () => {
    if (!match) return;

    try {
      const values = await form.validateFields();

      const betTypeValue = values.bet_type ?? defaultSelection?.bet_type ?? '让球';
      const betOptionValue = values.bet_option ?? defaultSelection?.bet_option ?? '主队';
      const oddsValueRaw = values.odds ?? defaultSelection?.odds ?? 1;
      const oddsValueNumber = typeof oddsValueRaw === 'number' ? oddsValueRaw : Number(oddsValueRaw);
      const oddsValue = Number.isFinite(oddsValueNumber) ? oddsValueNumber : 1;

      const usedLines = new Set<string>();
      const conflictAccounts: number[] = [];
      selectedAccounts.forEach((accountId) => {
        const lineKey = getLineKey(accountId);
        if (usedLines.has(lineKey)) {
          conflictAccounts.push(accountId);
          return;
        }
        usedLines.add(lineKey);
      });

      if (conflictAccounts.length > 0) {
        const conflictLabels = conflictAccounts
          .map(id => accounts.find(acc => acc.id === id)?.username || String(id))
          .join('、');
        message.error(`所选账号存在同线路冲突：${conflictLabels}。每个线路同场只能下注一次。`);
        return;
      }

      setLoading(true);

      const requestData: BetCreateRequest = {
        account_ids: selectedAccounts,
        match_id: match.id,
        bet_type: betTypeValue,
        bet_option: betOptionValue,
        bet_amount: values.bet_amount,
        odds: oddsValue,
        single_limit: values.single_limit,
        interval_seconds: values.interval_seconds,
        quantity: values.quantity,
        crown_match_id: match.match_id,
        league_name: match.league_name,
        home_team: match.home_team,
        away_team: match.away_team,
        match_time: match.match_time,
        match_status: match.status,
        current_score: match.current_score,
        match_period: match.match_period,
      };

      const response = await betApi.createBet(requestData);
      if (response.success) {
        message.success(`成功为 ${selectedAccounts.length} 个账号创建下注`);
        onSubmit();
      } else {
        const errMsg = response.error || response.message || '创建下注失败';
        message.error(errMsg);
      }
    } catch (error) {
      console.error('Failed to create bet:', error);
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;
      const serverMessage = axiosError.response?.data?.error || axiosError.response?.data?.message;
      message.error(serverMessage || axiosError.message || '创建下注失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedAccounts([]);
    setEstimatedPayout(0);
    setSelectionLabel('');
    setBetMode('优选');
    setAutoSelection(null);
    setAutoLoading(false);
    onCancel();
  };

  const matchTimeLabel = useMemo(() => {
    if (!match) {
      return '-';
    }
    return dayjs(match.match_time).isValid()
      ? dayjs(match.match_time).format('YYYY-MM-DD HH:mm')
      : (match.match_time || '-');
  }, [match]);

  const recommendedOrder = useMemo(() => (
    autoSelection ? autoSelection.eligible_accounts.map(entry => entry.account.id) : []
  ), [autoSelection]);

  const sortedAccounts = useMemo(() => {
    // 在优选模式下，只显示 eligible_accounts 中的账号
    if (betMode === '优选' && autoSelection) {
      const eligibleIds = new Set(autoSelection.eligible_accounts.map(entry => entry.account.id));
      const filtered = accounts.filter(acc => eligibleIds.has(acc.id));

      if (!recommendedOrder.length) {
        return filtered;
      }

      const orderMap = new Map<number, number>();
      recommendedOrder.forEach((id, index) => orderMap.set(id, index));
      return [...filtered].sort((a, b) => {
        const rankA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.POSITIVE_INFINITY;
        const rankB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.POSITIVE_INFINITY;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return a.username.localeCompare(b.username);
      });
    }

    // 平均模式下，显示所有账号
    if (!recommendedOrder.length) {
      return accounts;
    }
    const orderMap = new Map<number, number>();
    recommendedOrder.forEach((id, index) => orderMap.set(id, index));
    return [...accounts].sort((a, b) => {
      const rankA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.POSITIVE_INFINITY;
      const rankB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.username.localeCompare(b.username);
    });
  }, [accounts, recommendedOrder, betMode, autoSelection]);

  const formatAmount = (value: number) => {
    if (!Number.isFinite(value)) {
      return '-';
    }
    return value.toLocaleString();
  };

  const isBalanceInsufficient = requiredCoins > coinBalance;

  return (
    <Modal
      title={
        <Space size={6}>
          <TrophyOutlined />
          <span>创建下注</span>
        </Space>
      }
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={620}
      maskClosable={false}
      className="bet-modal compact"
      okText="下单"
      okButtonProps={{ disabled: isBalanceInsufficient }}
      cancelButtonProps={{ style: { display: 'none' } }}
    >
      <div className="bet-modal-body compact">
        {match ? (
          <>
            <div className="bet-quick-head">
              <div className="bet-quick-title">
                <strong>{match.home_team} - {match.away_team}</strong>
                {match.current_score && <span className="score">({match.current_score})</span>}
              </div>
              <div className="bet-quick-sub">
                <span className="league">[{match.league_name}]</span>
                <span className="time">{matchTimeLabel}</span>
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              onValuesChange={handleFormValuesChange}
              className="bet-quick-form"
            >
              <Form.Item
                name="bet_type"
                rules={[{ required: true, message: '请选择投注类型' }]}
                hidden
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="bet_option"
                rules={[{ required: true, message: '请选择投注选项' }]}
                hidden
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="odds"
                rules={[{ required: true, message: '缺少赔率' }]}
                hidden
              >
                <InputNumber min={0} />
              </Form.Item>

              {selectionLabel && (
                <div className="bet-quick-selection">{selectionLabel}</div>
              )}
              <div className="bet-quick-summary">
                <Space size={12} wrap>
                  <span>类型：{watchedBetType || '-'}</span>
                  <span>选项：{watchedBetOption || '-'}</span>
                  <span>赔率：{watchedOdds !== undefined ? formatOddsValue(Number(watchedOdds) || 0) : '-'}</span>
                </Space>
              </div>

              {/* 金币余额显示 */}
              <Alert
                message={
                  <Space>
                    <DollarOutlined />
                    <span>金币余额：¥{coinBalance.toFixed(2)}</span>
                    {requiredCoins > 0 && (
                      <span style={{ marginLeft: 8 }}>
                        | 本次需要：¥{requiredCoins.toFixed(2)}
                      </span>
                    )}
                  </Space>
                }
                type={requiredCoins > coinBalance ? 'error' : 'info'}
                showIcon
                style={{ marginBottom: 12 }}
                description={
                  requiredCoins > coinBalance
                    ? `金币余额不足！还需要 ¥${(requiredCoins - coinBalance).toFixed(2)}`
                    : undefined
                }
              />

              <Row gutter={8} className="bet-quick-row">
                <Col span={24}>
                  <Form.Item name="total_amount" label="总金额（实数）" className="bet-quick-item">
                    <InputNumber size="small" min={0} placeholder="输入总金额自动计算单注金额" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={8} className="bet-quick-row">
                <Col span={12}>
                  <Form.Item name="single_limit" label="单笔限额" className="bet-quick-item">
                    <Input size="small" placeholder="虚数" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="interval_range" label="间隔时间 (S)" className="bet-quick-item">
                    <Input size="small" placeholder="1-3" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={8} className="bet-quick-row">
                <Col span={8}>
                  <Form.Item
                    name="quantity"
                    label="数量"
                    className="bet-quick-item"
                    rules={[{ required: true, message: '请输入数量' }]}
                  >
                    <InputNumber size="small" min={1} max={10} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="bet_amount"
                    label="单注金额"
                    className="bet-quick-item"
                    rules={[{ required: true, message: '请输入下注金额' }]}
                  >
                    <InputNumber size="small" min={1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <div className="bet-quick-mode">
                    <span className="label">模式</span>
                    <div className="mode-buttons">
                      {(['优选', '平均'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          className={mode === betMode ? 'active' : ''}
                          onClick={() => handleModeSwitch(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </Col>
              </Row>

              <Form.Item name="group" label="分组" className="bet-quick-item">
                <Select size="small" allowClear placeholder="选择分组">
                  {[...new Set(accounts.map(acc => acc.group_name))]
                    .filter(Boolean)
                    .map(group => (
                      <Option key={group as string} value={group as string}>{group as string}</Option>
                    ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="account_ids"
                label={(
                  <div className="bet-account-label">
                    <span>选择账号 ({selectedAccounts.length})</span>
                    <Space size={8}>
                      {betMode === '优选' && (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => fetchAutoSelection()}
                          disabled={autoLoading}
                        >
                          重新优选
                        </Button>
                      )}
                      {autoLoading && <Spin size="small" />}
                    </Space>
                  </div>
                )}
                rules={[{ required: true, message: '请选择下注账号' }]}
                className="bet-quick-item"
              >
                <Checkbox.Group
                  value={selectedAccounts}
                  onChange={(values) => handleAccountsChange(values as Array<number | string>)}
                >
                  <div className="bet-account-grid compact">
                    {sortedAccounts.map(account => {
                      const selected = selectedAccounts.includes(account.id);
                      const meta = accountMetaMap.get(account.id);
                      const online = isAccountOnline(account.id);
                      return (
                        <Checkbox
                          key={account.id}
                          value={account.id}
                          className="bet-account-checkbox"
                          disabled={!online}
                        >
                          <div className={`bet-account-card compact ${selected ? 'active' : ''} ${meta ? 'recommended' : ''} ${online ? 'online' : 'offline'}`}>
                            <div className="bet-account-info">
                              <span className="name">{account.username}</span>
                              <span className="sub">{account.display_name || account.group_name || '-'}</span>
                              <span className={`status ${online ? 'status-online' : 'status-offline'}`}>
                                {online ? '在线' : '离线'}
                              </span>
                            </div>
                            {meta && (
                              <span className="stats">
                                日有效 {formatAmount(meta.stats.daily_effective_amount)}｜
                                日盈亏 {formatAmount(meta.stats.daily_profit)}
                              </span>
                            )}
                          </div>
                        </Checkbox>
                      );
                    })}
                  </div>
                </Checkbox.Group>
              </Form.Item>

              {autoSelection && (
                <div className="bet-selection-summary">
                  <Tag color="blue">优选</Tag>
                  <span>
                    共 {autoSelection.eligible_accounts.length} 个账号符合条件，
                    截止时间 {dayjs(autoSelection.generated_at).format('HH:mm:ss')}
                  </span>
                </div>
              )}
            </Form>
          </>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <Empty description="请选择比赛后再进行下注" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BetFormModal;
