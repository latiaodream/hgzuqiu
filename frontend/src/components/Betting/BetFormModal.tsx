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
  Tooltip,
} from 'antd';
import { TrophyOutlined, ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { Match, CrownAccount, BetCreateRequest, AccountSelectionResponse } from '../../types';
import { betApi, accountApi, crownApi } from '../../services/api';
import dayjs from 'dayjs';
import type { AxiosError } from 'axios';

const { Option } = Select;

export type MarketCategory = 'moneyline' | 'handicap' | 'overunder';
export type MarketScope = 'full' | 'half';
export type MarketSide = 'home' | 'away' | 'draw' | 'over' | 'under';

export interface SelectionMeta {
  bet_type: string;
  bet_option: string;
  odds: number | string;
  label?: string;
  market_category?: MarketCategory;
  market_scope?: MarketScope;
  market_side?: MarketSide;
  market_line?: string;
  market_index?: number;
  market_wtype?: string;
  market_rtype?: string;
  market_chose_team?: 'H' | 'C' | 'N';
}

interface BetFormModalProps {
  visible: boolean;
  match: Match | null;
  accounts: CrownAccount[];
  onCancel: () => void;
  onSubmit: () => void;
  defaultSelection?: SelectionMeta | null;
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [loading, setLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [estimatedPayout, setEstimatedPayout] = useState(0);
  const [selectionLabel, setSelectionLabel] = useState('');
  const [betMode, setBetMode] = useState<'优选' | '平均'>('优选');
  const [autoSelection, setAutoSelection] = useState<AccountSelectionResponse | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [oddsPreview, setOddsPreview] = useState<{ odds: number | null; closed: boolean; message?: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoRefreshOdds, setAutoRefreshOdds] = useState(true); // 自动刷新赔率开关

  // 监听表单值变化以触发重渲染
  const totalAmount = Form.useWatch('total_amount', form);
  const singleLimit = Form.useWatch('single_limit', form);
  const intervalRange = Form.useWatch('interval_range', form);
  const quantity = Form.useWatch('quantity', form);
  const minOdds = Form.useWatch('min_odds', form);

  const accountDict = useMemo(() => {
    const map = new Map<number, CrownAccount>();
    accounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const selectionMeta = defaultSelection || undefined;
  const matchKey = match ? (match.crown_gid || match.match_id || match.id) : null;
  const marketSnapshot = useMemo(() => {
    if (!matchKey) return match;
    if (!getMatchSnapshot) return match;
    return getMatchSnapshot(matchKey) || match;
  }, [matchKey, match, getMatchSnapshot]);

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
      setOddsPreview(null);
      setPreviewError(null);
      // 设置默认值
      form.setFieldsValue({
        bet_type: defaults.bet_type,
        bet_option: defaults.bet_option,
        bet_amount: 100,
        odds: defaults.odds,
        single_limit: undefined,  // 默认为空，使用账号限额
        interval_seconds: 3,
        quantity: 1,
        min_odds: defaults.odds,
        total_amount: 100,
        interval_range: '1-3',
        group: undefined,
        account_ids: [],
      });
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

  const deriveOddsFromMarkets = useCallback(() => {
    if (!marketSnapshot || !selectionMeta) {
      return null;
    }

    const markets = marketSnapshot.markets || {};
    const scope: MarketScope = selectionMeta.market_scope || 'full';
    const category: MarketCategory | undefined = selectionMeta.market_category;
    const side: MarketSide | undefined = selectionMeta.market_side;

    const normalizeLine = (value?: string | number | null) => {
      if (value === null || value === undefined) return undefined;
      return String(value).trim();
    };

    const toNumber = (value: any): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const pickLineEntry = (lines?: Array<{ line?: string; home?: string; away?: string; over?: string; under?: string }>) => {
      if (!Array.isArray(lines) || lines.length === 0) return null;
      if (selectionMeta.market_line !== undefined) {
        const target = normalizeLine(selectionMeta.market_line);
        const found = lines.find(item => normalizeLine(item.line) === target);
        if (found) return found;
      }
      if (selectionMeta.market_index !== undefined && Number.isFinite(selectionMeta.market_index)) {
        const entry = lines[selectionMeta.market_index as number];
        if (entry) return entry;
      }
      return lines[0];
    };

    const buildResponse = (value: any) => {
      const numeric = toNumber(value);
      return {
        odds: numeric,
        message: 'iSports 实时赔率',
      };
    };

    if (category === 'moneyline') {
      const ml = scope === 'half'
        ? markets?.half?.moneyline || markets?.half?.moneyLine
        : markets.moneyline || markets.moneyLine;
      if (!ml) return null;
      const value = side === 'away' ? ml.away : side === 'draw' ? ml.draw : ml.home;
      return buildResponse(value);
    }

    if (category === 'handicap') {
      const lines = scope === 'half'
        ? markets?.half?.handicapLines || (markets?.half?.handicap ? [markets.half.handicap] : [])
        : markets?.full?.handicapLines || (markets?.handicap ? [markets.handicap] : []);
      const entry = pickLineEntry(lines);
      if (!entry) return null;
      const value = side === 'away' ? entry.away : entry.home;
      return buildResponse(value);
    }

    if (category === 'overunder') {
      const lines = scope === 'half'
        ? markets?.half?.overUnderLines || (markets?.half?.ou ? [markets.half.ou] : [])
        : markets?.full?.overUnderLines || (markets?.ou ? [markets.ou] : []);
      const entry = pickLineEntry(lines);
      if (!entry) return null;
      const value = side === 'under' ? entry.under : entry.over;
      return buildResponse(value);
    }

    return null;
  }, [marketSnapshot, selectionMeta]);

  const previewOddsRequest = useCallback(async (silent = false) => {
    if (!match) {
      setOddsPreview(null);
      setPreviewError(null);
      return { success: false };
    }

    const currentValues = form.getFieldsValue();

    // 先获取前端计算的赔率作为备用，但不立即设置到 oddsPreview
    const derived = deriveOddsFromMarkets();

    // 获取在线账号列表
    const onlineAccounts = accounts.filter(acc => isAccountOnline(acc.id));

    // 如果没有选择账号，使用第一个在线账号
    let accountId = selectedAccounts.length > 0 ? selectedAccounts[0] : null;
    if (!accountId && onlineAccounts.length > 0) {
      accountId = onlineAccounts[0].id;
    }

    if (!accountId) {
      // 没有在线账号时，使用前端计算的赔率
      if (derived) {
        setOddsPreview({
          odds: derived.odds ?? null,
          closed: false,
          message: derived.message,
        });
        if (derived.odds !== null) {
          form.setFieldValue('odds', derived.odds);
        }
      } else if (!silent) {
        setOddsPreview(null);
        setPreviewError('没有可用的在线账号');
      }
      return { success: false, message: '没有可用的在线账号' };
    }

    const betTypeValue = currentValues.bet_type ?? defaultSelection?.bet_type ?? '让球';
    const betOptionValue = currentValues.bet_option ?? defaultSelection?.bet_option ?? '主队';
    const oddsValue = currentValues.odds ?? defaultSelection?.odds ?? 1;

    const payload = {
      account_id: accountId,
      match_id: match.id,
      crown_match_id: match.crown_gid || match.match_id,
      bet_type: betTypeValue,
      bet_option: betOptionValue,
      odds: oddsValue,
      bet_amount: currentValues.bet_amount ?? 0,
      league_name: match.league_name,
      home_team: match.home_team,
      away_team: match.away_team,
      market_category: selectionMeta?.market_category,
      market_scope: selectionMeta?.market_scope,
      market_side: selectionMeta?.market_side,
      market_line: selectionMeta?.market_line,
      market_index: selectionMeta?.market_index,
      market_wtype: selectionMeta?.market_wtype,
      market_rtype: selectionMeta?.market_rtype,
      market_chose_team: selectionMeta?.market_chose_team,
    };

    if (!silent) {
      setPreviewLoading(true);
    }

    try {
      const response = await crownApi.previewOdds(payload);
      if (response.success && response.data) {
        const previewData = response.data;

        // 检查盘口线是否匹配
        if (previewData.spread_mismatch) {
          console.warn('⚠️ Crown API 返回的盘口线与用户选择不匹配:', {
            requested: previewData.requested_line,
            returned: previewData.returned_spread,
          });
          // 使用前端已有的赔率
          const frontendOdds = deriveOddsFromMarkets();
          if (frontendOdds?.odds) {
            setOddsPreview({
              odds: frontendOdds.odds,
              closed: false,
              message: '使用前端赔率',
            });
            setPreviewError(null);
            // 更新表单中的赔率
            form.setFieldValue('odds', frontendOdds.odds);
          } else {
            setOddsPreview(null);
            setPreviewError('盘口线不匹配，无法获取赔率');
          }
          // 返回成功，但标记为使用前端赔率
          return { success: true, data: { ...previewData, odds: frontendOdds?.odds } };
        }

        setOddsPreview({
          odds: previewData.odds ?? null,
          closed: !!previewData.closed,
          message: previewData.message,
        });
        if (previewData.closed) {
          setPreviewError(previewData.message || '盘口已封盘或暂时不可投注');
        } else {
          setPreviewError(null);
        }
        // 更新表单中的赔率
        if (previewData.odds !== null && previewData.odds !== undefined) {
          form.setFieldValue('odds', previewData.odds);
        }
        return { success: true, data: previewData };
      }

      const msg = response.error || response.message || '获取赔率失败';
      if (!silent) {
        setPreviewError(msg);
      }
      setOddsPreview(response.data?.closed ? {
        odds: response.data.odds ?? null,
        closed: true,
        message: msg,
      } : null);
      return { success: false, message: msg, data: response.data };
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || '获取赔率失败';
      if (!silent) {
        setPreviewError(msg);
      }
      setOddsPreview(null);
      return { success: false, message: msg };
    } finally {
      if (!silent) {
        setPreviewLoading(false);
      }
    }
  }, [match, selectedAccounts, form, defaultSelection, accounts, isAccountOnline]);

  // 自动刷新赔率：每 2 秒刷新一次
  const previewOddsRef = React.useRef(previewOddsRequest);
  previewOddsRef.current = previewOddsRequest;

  useEffect(() => {
    if (!visible || !match || !autoRefreshOdds) return;

    // 首次加载时立即获取赔率
    previewOddsRef.current(true);

    // 设置定时器
    const timer = setInterval(() => {
      previewOddsRef.current(true);
    }, 2000); // 每 2 秒刷新一次

    return () => clearInterval(timer);
  }, [visible, match, autoRefreshOdds]);

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
      setTimeout(() => {
        previewOddsRequest(true);
      }, 0);

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
  }, [form, match, accountDict, previewOddsRequest]);

  const matchId = match?.id;
  useEffect(() => {
    if (!visible || !matchId) return;
    // 弹窗打开时自动优选账号（静默模式，不显示提示）
    fetchAutoSelection(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, matchId]);

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
    const totalAmount = form.getFieldValue('total_amount') || 0;
    const odds = form.getFieldValue('odds') || 1;

    // 预估盈利 = 总金额 × 赔率
    const payout = totalAmount * odds;
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
    if (!match) return;

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
        match_id: match.id,
        bet_type: betTypeValue,
        bet_option: betOptionValue,
        total_amount: values.total_amount,
        odds: finalOdds,
        single_limit: values.single_limit,
        interval_range: values.interval_range,
        quantity: values.quantity,
        min_odds: values.min_odds,
        crown_match_id: match.crown_gid || match.match_id,
        league_name: match.league_name,
        home_team: match.home_team,
        away_team: match.away_team,
        match_time: match.match_time,
        match_status: match.status,
        current_score: match.current_score,
        match_period: match.match_period,
        market_category: selectionMeta?.market_category,
        market_scope: selectionMeta?.market_scope,
        market_side: selectionMeta?.market_side,
        market_line: selectionMeta?.market_line,
        market_index: selectionMeta?.market_index,
        market_wtype: selectionMeta?.market_wtype,
        market_rtype: selectionMeta?.market_rtype,
        market_chose_team: selectionMeta?.market_chose_team,
      };

      const response = await betApi.createBet(requestData);
      if (response.success) {
        message.success(`成功为 ${selectedAccounts.length} 个账号创建下注`);
        onSubmit();
      } else {
        // 显示详细的错误信息
        const data = response.data as any;
        if (data?.failed && data.failed.length > 0) {
          // 显示每个失败账号的错误原因
          const errorMessages = data.failed.map((f: any) => {
            const accountName = accounts.find(a => a.id === f.accountId)?.username || `账号${f.accountId}`;
            return `${accountName}: ${f.error}`;
          }).join('\n');

          message.error({
            content: (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>下注失败</div>
                <div style={{ whiteSpace: 'pre-line', fontSize: '13px' }}>{errorMessages}</div>
              </div>
            ),
            duration: 8,
          });
        } else {
          const errMsg = response.error || response.message || '创建下注失败';
          message.error(errMsg);
        }
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
      title={null}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={isMobile ? '100%' : 480}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', padding: 0 } : undefined}
      maskClosable={false}
      className="bet-modal-v2"
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleCancel} style={{ flex: 1 }}>取消</Button>
          <Button type="primary" onClick={handleSubmit} loading={loading} style={{ flex: 2 }}>
            确认下注 ({selectedAccounts.length}个账号)
          </Button>
        </div>
      }
    >
      {match ? (
        <div className="bet-v2">
          {/* 隐藏字段 */}
          <Form form={form} onValuesChange={handleFormValuesChange} style={{ display: 'none' }}>
            <Form.Item name="bet_type"><Input /></Form.Item>
            <Form.Item name="bet_option"><Input /></Form.Item>
            <Form.Item name="odds"><InputNumber /></Form.Item>
            <Form.Item name="account_ids"><Input /></Form.Item>
            <Form.Item name="total_amount"><InputNumber /></Form.Item>
            <Form.Item name="single_limit"><Input /></Form.Item>
            <Form.Item name="interval_range"><Input /></Form.Item>
            <Form.Item name="quantity"><InputNumber /></Form.Item>
            <Form.Item name="min_odds"><InputNumber /></Form.Item>
          </Form>

          {/* 比赛信息头部 */}
          <div className="bet-v2-header">
            <div className="bet-v2-match">
              <span className="teams">{match.home_team} vs {match.away_team}</span>
              {match.current_score && <span className="score">{match.current_score}</span>}
            </div>
            <div className="bet-v2-meta">
              <span>{match.league_name}</span>
              <span>{matchTimeLabel}</span>
            </div>
          </div>

          {/* 赔率显示 */}
          <div className="bet-v2-odds">
            <div className="odds-main">
              <span className="odds-label">{selectionLabel || '当前赔率'}</span>
              <span className={`odds-value ${oddsPreview?.closed ? 'closed' : ''} ${minOdds && oddsPreview?.odds && oddsPreview.odds < minOdds ? 'below-min' : ''}`}>
                {oddsPreview ? (oddsPreview.odds ?? '-') : '--'}
              </span>
              {previewLoading && <Spin size="small" />}
            </div>
            <div className="odds-actions">
              <Button size="small" icon={<ReloadOutlined />} onClick={() => previewOddsRequest(false)} />
              <Checkbox checked={autoRefreshOdds} onChange={(e) => setAutoRefreshOdds(e.target.checked)}>
                <span style={{ fontSize: 11 }}>自动</span>
              </Checkbox>
            </div>
            {previewError && <div className="odds-error">{previewError}</div>}
            {minOdds && oddsPreview?.odds && oddsPreview.odds < minOdds && (
              <div className="odds-warning">当前赔率 {oddsPreview.odds} 低于最低赔率 {minOdds}</div>
            )}
          </div>

          {/* 表单区域 - 紧凑网格 */}
          <div className="bet-v2-form">
            <div className="form-grid">
              <div className="form-cell">
                <label>总金额</label>
                <InputNumber
                  size="small"
                  min={50}
                  style={{ width: '100%' }}
                  placeholder="50000"
                  value={totalAmount}
                  onChange={(v) => { form.setFieldValue('total_amount', v); handleFormValuesChange(); }}
                />
              </div>
              <div className="form-cell">
                <label>单笔限额</label>
                <Input
                  size="small"
                  placeholder="留空自动"
                  value={singleLimit}
                  onChange={(e) => form.setFieldValue('single_limit', e.target.value)}
                />
              </div>
              <div className="form-cell">
                <label>间隔(秒)</label>
                <Input
                  size="small"
                  placeholder="3-15"
                  value={intervalRange}
                  onChange={(e) => form.setFieldValue('interval_range', e.target.value)}
                />
              </div>
              <div className="form-cell">
                <label>数量</label>
                <InputNumber
                  size="small"
                  min={1}
                  max={10}
                  style={{ width: '100%' }}
                  value={quantity}
                  onChange={(v) => form.setFieldValue('quantity', v)}
                />
              </div>
              <div className="form-cell">
                <label>最低赔率</label>
                <InputNumber
                  size="small"
                  min={0}
                  step={0.01}
                  style={{ width: '100%' }}
                  placeholder="可选"
                  value={minOdds}
                  onChange={(v) => form.setFieldValue('min_odds', v)}
                />
              </div>
              <div className="form-cell">
                <label>模式</label>
                <div className="mode-switch">
                  {(['优选', '平均'] as const).map(mode => (
                    <span
                      key={mode}
                      className={mode === betMode ? 'active' : ''}
                      onClick={() => handleModeSwitch(mode)}
                    >{mode}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 账号选择 */}
          <div className="bet-v2-accounts">
            <div className="accounts-header">
              <span>账号 <b>{selectedAccounts.length}</b>/{sortedAccounts.length}</span>
              <Space size={4}>
                {betMode === '优选' && (
                  <Button type="link" size="small" onClick={() => fetchAutoSelection()} disabled={autoLoading} style={{ padding: 0, fontSize: 11 }}>
                    重选
                  </Button>
                )}
                {autoLoading && <Spin size="small" />}
              </Space>
            </div>
            <div className="accounts-list">
              {sortedAccounts.map(account => {
                const selected = selectedAccounts.includes(account.id);
                const online = isAccountOnline(account.id);
                return (
                  <div
                    key={account.id}
                    className={`account-item ${selected ? 'selected' : ''} ${online ? '' : 'offline'}`}
                    onClick={() => {
                      if (!online) return;
                      const newSelected = selected
                        ? selectedAccounts.filter(id => id !== account.id)
                        : [...selectedAccounts, account.id];
                      handleAccountsChange(newSelected);
                    }}
                  >
                    <span className="name">{account.username}</span>
                    <span className={`status ${online ? 'on' : 'off'}`}>{online ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <Empty description="请选择比赛" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 20 }} />
      )}
    </Modal>
  );
};

export default BetFormModal;
