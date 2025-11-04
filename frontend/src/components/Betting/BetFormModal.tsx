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
} from 'antd';
import { TrophyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Match, CrownAccount, BetCreateRequest, AccountSelectionResponse } from '../../types';
import { betApi, accountApi } from '../../services/api';
import dayjs from 'dayjs';
import type { AxiosError } from 'axios';

const { Option } = Select;

export type MarketCategory = 'moneyline' | 'handicap' | 'overunder';
export type MarketScope = 'full' | 'half';

export interface BetSelectionMeta {
  bet_type: string;
  bet_option: string;
  odds: number | string;
  label?: string;
  market_category: MarketCategory;
  market_scope: MarketScope;
  market_side: 'home' | 'away' | 'draw' | 'over' | 'under';
  market_line?: string;
}

interface BetFormModalProps {
  visible: boolean;
  match: Match | null;
  accounts: CrownAccount[];
  onCancel: () => void;
  onSubmit: () => void;
  defaultSelection?: BetSelectionMeta | null;
  getMatchSnapshot?: (matchId: string | number | undefined | null) => any;
}

const BetFormModal: React.FC<BetFormModalProps> = ({
  visible,
  match,
  accounts,
  onCancel,
  onSubmit,
  defaultSelection,
  getMatchSnapshot,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [estimatedPayout, setEstimatedPayout] = useState(0);
  const [selectionLabel, setSelectionLabel] = useState('');
  const [betMode, setBetMode] = useState<'优选' | '平均'>('优选');
  const [autoSelection, setAutoSelection] = useState<AccountSelectionResponse | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [oddsPreview, setOddsPreview] = useState<{ odds: number | null; closed: boolean; message?: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoRefreshOdds, setAutoRefreshOdds] = useState(true); // 自动刷新赔率开关

  const accountDict = useMemo(() => {
    const map = new Map<number, CrownAccount>();
    accounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const matchKey = match ? (match.crown_gid || match.match_id || match.id) : null;
  const activeMatch = useMemo(() => {
    if (!match) return null;
    if (!matchKey || !getMatchSnapshot) return match;
    const snapshot = getMatchSnapshot(matchKey);
    if (!snapshot) return match;

    const merged = {
      ...match,
      ...snapshot,
    } as any;

    merged.league_name = snapshot.league ?? snapshot.league_name ?? match.league_name;
    merged.home_team = snapshot.home ?? snapshot.home_team ?? match.home_team;
    merged.away_team = snapshot.away ?? snapshot.away_team ?? match.away_team;
    merged.current_score = snapshot.score ?? snapshot.current_score ?? match.current_score;
    merged.match_period = snapshot.period
      ? [snapshot.period, snapshot.clock].filter(Boolean).join(' ')
      : (snapshot.match_period ?? match.match_period);
    merged.markets = snapshot.markets ?? match.markets;
    merged.match_time = snapshot.time ?? snapshot.match_time ?? match.match_time;

    return merged as Match;
  }, [match, matchKey, getMatchSnapshot]);

  const matchData = activeMatch ?? match;

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

  const parseOddsNumber = (value: any): number | null => {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const deriveOddsFromMarkets = useCallback(
    (sourceMatch: any, meta: Partial<BetSelectionMeta>): { odds: number | null; message?: string } => {
      if (!sourceMatch) {
        return { odds: null, message: '未找到比赛数据' };
      }

      const markets = sourceMatch?.markets || {};
      const scope = meta.market_scope || 'full';
      const category = meta.market_category || 'handicap';
      const side = meta.market_side || 'home';
      const line = meta.market_line;

      if (category === 'moneyline') {
        const ml = scope === 'half'
          ? markets.half?.moneyline || markets.half?.moneyLine
          : markets.moneyline || markets.moneyLine;
        if (!ml) {
          return { odds: null, message: '未找到独赢盘口' };
        }
        const value = side === 'home'
          ? ml.home
          : side === 'away'
            ? ml.away
            : ml.draw;
        return { odds: parseOddsNumber(value) };
      }

      if (category === 'handicap') {
        const lines: Array<{ line?: string; home?: string; away?: string }> = scope === 'half'
          ? (markets.half?.handicapLines || (markets.half?.handicap ? [markets.half.handicap] : []))
          : (markets.full?.handicapLines || (markets.handicap ? [markets.handicap] : []));

        if (!lines || lines.length === 0) {
          return { odds: null, message: '未找到让球盘口' };
        }

        const target = line !== undefined && line !== null
          ? lines.find(item => String(item.line ?? '') === String(line)) || lines[0]
          : lines[0];

        if (!target) {
          return { odds: null, message: '未找到对应盘口' };
        }

        const value = side === 'away' ? target.away : target.home;
        return { odds: parseOddsNumber(value) };
      }

      if (category === 'overunder') {
        const lines: Array<{ line?: string; over?: string; under?: string }> = scope === 'half'
          ? (markets.half?.overUnderLines || (markets.half?.ou ? [markets.half.ou] : []))
          : (markets.full?.overUnderLines || (markets.ou ? [markets.ou] : []));

        if (!lines || lines.length === 0) {
          return { odds: null, message: '未找到大小盘口' };
        }

        const target = line !== undefined && line !== null
          ? lines.find(item => String(item.line ?? '') === String(line)) || lines[0]
          : lines[0];

        if (!target) {
          return { odds: null, message: '未找到对应盘口' };
        }

        const value = side === 'under' ? target.under : target.over;
        return { odds: parseOddsNumber(value) };
      }

      return { odds: null, message: '不支持的盘口类型' };
    },
    []
  );

  useEffect(() => {
    if (visible && matchData) {
      form.resetFields();
      setSelectedAccounts([]);
      setEstimatedPayout(0);
      const defaults = {
        bet_type: defaultSelection?.bet_type || '让球',
        bet_option: defaultSelection?.bet_option || '主队',
        odds: defaultSelection?.odds || 1.85,
        market_category: defaultSelection?.market_category || 'handicap',
        market_scope: defaultSelection?.market_scope || 'full',
        market_side: defaultSelection?.market_side || 'home',
        market_line: defaultSelection?.market_line,
      };
      setSelectionLabel(defaultSelection?.label || '');
      setAutoSelection(null);
      setAutoLoading(false);
      setOddsPreview(null);
      setPreviewError(null);
      // 设置默认值
      form.setFieldsValue({
        bet_type: defaults.bet_type,
        bet_option: defaults.bet_option,
        bet_amount: 100,
        odds: defaults.odds,
        single_limit: 100,
        interval_seconds: 3,
        quantity: 1,
        min_odds: defaults.odds,
        total_amount: 100,
        interval_range: '1-3',
        group: undefined,
        account_ids: [],
        market_category: defaults.market_category,
        market_scope: defaults.market_scope,
        market_side: defaults.market_side,
        market_line: defaults.market_line,
      });
    }
  }, [visible, matchData, form, defaultSelection]);

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

  const previewOddsRequest = useCallback(async (silent = false) => {
    if (!matchData) {
      setOddsPreview(null);
      setPreviewError(null);
      return { success: false };
    }

    const currentValues = form.getFieldsValue();
    const meta: Partial<BetSelectionMeta> = {
      bet_type: currentValues.bet_type ?? defaultSelection?.bet_type,
      bet_option: currentValues.bet_option ?? defaultSelection?.bet_option,
      market_category: currentValues.market_category ?? defaultSelection?.market_category,
      market_scope: currentValues.market_scope ?? defaultSelection?.market_scope,
      market_side: currentValues.market_side ?? defaultSelection?.market_side,
      market_line: currentValues.market_line ?? defaultSelection?.market_line,
    };

    const matchKeyLocal = matchData.crown_gid || matchData.match_id || matchData.id;
    const latestMatch = getMatchSnapshot ? getMatchSnapshot(matchKeyLocal) || matchData : matchData;

    const derived = deriveOddsFromMarkets(latestMatch, meta);
    if (derived.odds !== null && derived.odds !== undefined) {
      setOddsPreview({
        odds: derived.odds,
        closed: false,
        message: derived.message || '基于 iSports 实时赔率',
      });
      setPreviewError(null);
      form.setFieldValue('odds', derived.odds);
      return { success: true, data: { odds: derived.odds, closed: false, message: derived.message } };
    }

    const msg = derived.message || '未找到可用赔率';
    setPreviewError(msg);
    setOddsPreview({
      odds: null,
      closed: true,
      message: msg,
    });
    return { success: false, message: msg, data: { closed: true, message: msg } };
  }, [matchData, form, defaultSelection, getMatchSnapshot, deriveOddsFromMarkets]);

  // 自动刷新赔率：每 2 秒刷新一次
  useEffect(() => {
    if (!visible || !match || !autoRefreshOdds) return;

    previewOddsRequest(true);
    const timer = setInterval(() => {
      previewOddsRequest(true);
    }, 2000);

    return () => clearInterval(timer);
  }, [visible, match, autoRefreshOdds, previewOddsRequest]);

  const fetchAutoSelection = useCallback(async (limit?: number, silent = false) => {
    if (!matchData) return;

    try {
      setAutoLoading(true);
      const response = await accountApi.autoSelect({ match_id: matchData.id, limit });
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
      setTimeout(() => {
        previewOddsRequest(true);
      }, 0);

      if (!silent) {
        const baseMsg = `已优选 ${recommended.length} 个在线账号`;
        message.success({
          content: skippedCount > 0
            ? `${baseMsg}（自动跳过 ${skippedCount} 个同线路账号）`
            : baseMsg,
          key: 'auto-select-result',
          duration: 2,
        });
      }
    } catch (error) {
      console.error('Auto select accounts failed:', error);
      if (!silent) {
        message.error('优选账号失败');
      }
    } finally {
      setAutoLoading(false);
    }
  }, [form, matchData, accountDict, previewOddsRequest]);

  useEffect(() => {
    if (!visible || !matchData) return;
    // 始终调用优选 API 来获取符合条件的账号列表
    // 在"优选"模式下会自动选中账号，其他模式只用于过滤显示
    fetchAutoSelection(undefined, betMode !== '优选');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, matchData, betMode]);

  const handleAccountsChange = (accountIds: Array<number | string>) => {
    const normalized = accountIds.map(id => Number(id));
    setSelectedAccounts(normalized);
    form.setFieldValue('account_ids', normalized);
    calculatePayout(normalized.length);
    setTimeout(() => {
      previewOddsRequest(true);
    }, 0);
  };

  const calculatePayout = (accountCountOverride?: number) => {
    const betAmount = form.getFieldValue('bet_amount') || 0;
    const odds = form.getFieldValue('odds') || 1;
    const quantity = form.getFieldValue('quantity') || 1;
    const accountCount = accountCountOverride ?? selectedAccounts.length;

    const payout = betAmount * odds * quantity * accountCount;
    setEstimatedPayout(payout);
  };

  const handleFormValuesChange = () => {
    calculatePayout();
    previewOddsRequest(true);
  };

  const handleModeSwitch = (mode: '优选' | '平均') => {
    setBetMode(mode);
    if (mode === '优选') {
      fetchAutoSelection(undefined, true);
    }
  };

  const handleSubmit = async () => {
    if (!matchData) return;

    try {
      const values = await form.validateFields();

      const betTypeValue = values.bet_type ?? defaultSelection?.bet_type ?? '让球';
      const betOptionValue = values.bet_option ?? defaultSelection?.bet_option ?? '主队';
      const oddsValue = values.odds ?? defaultSelection?.odds ?? 1;

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

      const previewCheck = await previewOddsRequest(true);
      if (!previewCheck.success) {
        message.error(previewCheck.message || '获取最新赔率失败，请稍后再试');
        setLoading(false);
        return;
      }

      if (previewCheck.data?.closed) {
        message.error(previewCheck.data.message || '盘口已封盘或暂时不可投注');
        setLoading(false);
        return;
      }

      const latestOddsValue = previewCheck.data?.odds;
      const finalOdds = typeof latestOddsValue === 'number' && Number.isFinite(latestOddsValue)
        ? latestOddsValue
        : oddsValue;

      const requestData: BetCreateRequest = {
        account_ids: selectedAccounts,
        match_id: matchData.id,
        bet_type: betTypeValue,
        bet_option: betOptionValue,
        bet_amount: values.bet_amount,
        odds: finalOdds,
        single_limit: values.single_limit,
        interval_seconds: values.interval_seconds,
        quantity: values.quantity,
        crown_match_id: matchData.crown_gid || matchData.match_id,
        league_name: matchData.league_name,
        home_team: matchData.home_team,
        away_team: matchData.away_team,
        match_time: matchData.match_time,
        match_status: matchData.status,
        current_score: matchData.current_score,
        match_period: matchData.match_period,
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
    if (!matchData) {
      return '-';
    }
    return dayjs(matchData.match_time).isValid()
      ? dayjs(matchData.match_time).format('YYYY-MM-DD HH:mm')
      : (matchData.match_time || '-');
  }, [matchData]);

  const recommendedOrder = useMemo(() => (
    autoSelection ? autoSelection.eligible_accounts.map(entry => entry.account.id) : []
  ), [autoSelection]);

  const sortedAccounts = useMemo(() => {
    // 只显示符合下注条件的账号（在线、未达止盈、无线路冲突）
    // 使用后端返回的 eligible_accounts 和 excluded_accounts 来判断
    const eligibleAccountIds = new Set<number>();

    if (autoSelection) {
      // 如果有优选数据，使用优选结果
      autoSelection.eligible_accounts.forEach(entry => {
        eligibleAccountIds.add(entry.account.id);
      });
    } else {
      // 如果没有优选数据，只显示在线的账号
      accounts.forEach(account => {
        if (isAccountOnline(account.id)) {
          eligibleAccountIds.add(account.id);
        }
      });
    }

    const eligibleAccounts = accounts.filter(account =>
      eligibleAccountIds.has(account.id)
    );

    if (!recommendedOrder.length) {
      return eligibleAccounts;
    }
    const orderMap = new Map<number, number>();
    recommendedOrder.forEach((id, index) => orderMap.set(id, index));
    return [...eligibleAccounts].sort((a, b) => {
      const rankA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.POSITIVE_INFINITY;
      const rankB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.POSITIVE_INFINITY;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.username.localeCompare(b.username);
    });
  }, [accounts, recommendedOrder, autoSelection, isAccountOnline]);

  const formatAmount = (value: number) => {
    if (!Number.isFinite(value)) {
      return '-';
    }
    return value.toLocaleString();
  };

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
      cancelButtonProps={{ style: { display: 'none' } }}
    >
      <div className="bet-modal-body compact">
        {matchData ? (
          <>
            <div className="bet-quick-head">
              <div className="bet-quick-title">
                <strong>{matchData.home_team} - {matchData.away_team}</strong>
                {matchData.current_score && <span className="score">({matchData.current_score})</span>}
              </div>
              <div className="bet-quick-sub">
                <span className="league">[{matchData.league_name}]</span>
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

              <Form.Item name="market_category" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="market_scope" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="market_side" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="market_line" hidden>
                <Input />
              </Form.Item>

              {selectionLabel && (
                <div className="bet-quick-selection">{selectionLabel}</div>
              )}

              <div style={{ marginBottom: 12 }}>
                <Space size={8} align="center" wrap>
                  <Tag color={oddsPreview?.closed ? 'red' : 'blue'} style={{ fontSize: 14, padding: '4px 8px' }}>
                    最新赔率：{oddsPreview ? (oddsPreview.odds ?? '-') : '--'}
                  </Tag>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={() => previewOddsRequest(false)}
                  >
                    刷新赔率
                  </Button>
                  <Checkbox
                    checked={autoRefreshOdds}
                    onChange={(e) => setAutoRefreshOdds(e.target.checked)}
                  >
                    自动刷新
                  </Checkbox>
                </Space>
                {previewError && (
                  <div style={{ marginTop: 4, color: '#ff4d4f', fontSize: 12 }}>{previewError}</div>
                )}
                {oddsPreview?.message && (
                  <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: 12 }}>{oddsPreview.message}</div>
                )}
              </div>

              <Row gutter={8} className="bet-quick-row">
                <Col span={12}>
                  <Form.Item name="min_odds" label="最低赔率" className="bet-quick-item">
                    <InputNumber size="small" min={0} step={0.01} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="total_amount" label="总金额" className="bet-quick-item">
                    <InputNumber size="small" min={0} style={{ width: '100%' }} />
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
