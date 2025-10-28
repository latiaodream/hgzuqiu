import React, { useEffect, useMemo, useState } from 'react';
import { Card, Select, Button, Input, message, Empty, Typography, Segmented, Spin, Space } from 'antd';
import { crownApi, matchApi, accountApi } from '../services/api';
import { ReloadOutlined } from '@ant-design/icons';
import BetFormModal from '../components/Betting/BetFormModal';
import type { CrownAccount, Match as MatchType } from '../types';
import dayjs from 'dayjs';

const { Title } = Typography;

const MatchesPage: React.FC = () => {
  const [showtype, setShowtype] = useState<'live' | 'today' | 'early'>('live');
  const [gtype, setGtype] = useState<'ft' | 'bk'>('ft');
  const [mode, setMode] = useState<'live' | 'local'>('live');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [useSSE, setUseSSE] = useState<boolean>(true);
  const sseRef = React.useRef<EventSource | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [betModalVisible, setBetModalVisible] = useState(false);
  const [betModalKey, setBetModalKey] = useState(0);
  const [selectedMatch, setSelectedMatch] = useState<MatchType | null>(null);
  const [selectionPreset, setSelectionPreset] = useState<{ bet_type: string; bet_option: string; odds: number; label?: string } | null>(null);
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAccounts = async (silent = false) => {
    try {
      const res = await accountApi.getAccounts();
      if (res.success && res.data) {
        setAccounts(res.data);
      } else if (!silent) {
        message.error(res.error || '获取账号列表失败');
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
      if (!silent) {
        message.error('获取账号列表失败');
      }
    }
  };

  useEffect(() => {
    fetchAccounts(true);
  }, []);

  const loadMatches = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      if (mode === 'local') {
        const statusMap: Record<typeof showtype, string | undefined> = {
          live: 'live',
          today: 'scheduled',
          early: 'scheduled',
        };
        const res = await matchApi.getMatches({ status: statusMap[showtype], limit: 200 });
        if (res.success && res.data) {
          setMatches(res.data || []);
          setLastUpdatedAt(Date.now());
        } else {
          message.error(res.error || '获取本地赛事失败');
        }
      } else {
        const res = await crownApi.getMatchesSystem({
          gtype,
          showtype,
          rtype: showtype === 'live' ? 'rb' : 'r',
          ltype: '3',
          sorttype: 'L',
        });
        if (res.success && res.data) {
          setMatches(res.data.matches || []);
          setLastUpdatedAt(Date.now());
        }
        else message.error((res as any).error || '抓取赛事失败');
      }
    } catch (e: any) {
      console.error(e);
      message.error('抓取赛事失败');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showtype, gtype, mode]);

  // 自动刷新：live 模式下默认开启，滚球每 3s，其它每 15s（SSE 开启时不使用轮询）
  useEffect(() => {
    if (useSSE) return;
    if (mode !== 'live' || !autoRefresh) return;
    const interval = showtype === 'live' ? 3000 : 15000;
    let timer: number | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      await loadMatches({ silent: true });
      if (!stopped) timer = window.setTimeout(tick, interval);
    };
    timer = window.setTimeout(tick, interval);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [mode, autoRefresh, showtype, gtype, useSSE]);

  // SSE 推送：live 模式下默认开启
  useEffect(() => {
    if (mode !== 'live' || !useSSE) {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      return;
    }
    try {
      const token = localStorage.getItem('token') || '';
      const params = new URLSearchParams({
        gtype,
        showtype,
        rtype: showtype === 'live' ? 'rb' : 'r',
        ltype: '3',
        sorttype: 'L',
        token,
      });
      const es = new EventSource(`/api/crown-automation/matches/system/stream?${params.toString()}`);
      sseRef.current = es;
      es.addEventListener('matches', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data || '{}');
          if (payload && payload.matches) {
            setMatches(payload.matches);
            setLastUpdatedAt(Date.now());
          }
        } catch {}
      });
      es.addEventListener('status', () => {});
      es.addEventListener('ping', () => {});
      es.onerror = () => {
        if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
        setUseSSE(false);
        message.warning('实时推送中断，已回退到自动刷新');
      };
    } catch {
      setUseSSE(false);
    }
    return () => {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    };
  }, [mode, useSSE, showtype, gtype]);

  const filtered = useMemo(() => {
    if (!search.trim()) return matches;
    const k = search.trim().toLowerCase();
    return matches.filter((m: any) => {
      const leagueLabel = m.league || m.league_name;
      const homeLabel = m.home || m.home_team;
      const awayLabel = m.away || m.away_team;
      return [leagueLabel, homeLabel, awayLabel].some((v: any) => String(v || '').toLowerCase().includes(k));
    });
  }, [matches, search]);

  const parseOdds = (value?: string): number | null => {
    if (value === undefined || value === null) return null;
    const sanitized = String(value).replace(/[^0-9.\-]/g, '');
    if (!sanitized) return null;
    const parsed = parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // 格式化盘口数字，添加 + 或 - 符号
  const formatHandicapLine = (line?: string): string => {
    if (!line) return '';

    // 移除可能存在的空格和特殊字符
    const cleanLine = String(line).trim();

    // 如果已经有 + 或 - 符号，直接返回
    if (cleanLine.startsWith('+') || cleanLine.startsWith('-')) {
      return cleanLine;
    }

    const num = parseFloat(cleanLine);
    if (isNaN(num)) return cleanLine;
    if (num === 0) return '+0';
    if (num > 0) return `+${cleanLine}`;
    return cleanLine; // 负数已经有 - 符号
  };

  const getScoreParts = (score: string) => {
    if (!score) return { home: '-', away: '-' };
    const cleaned = String(score).replace(/[^0-9:.-]/g, '');
    const separator = cleaned.includes('-') ? '-' : cleaned.includes(':') ? ':' : null;
    if (!separator) return { home: cleaned || '-', away: '-' };
    const [home, away] = cleaned.split(separator);
    return {
      home: home !== undefined && home !== '' ? home : '-',
      away: away !== undefined && away !== '' ? away : '-',
    };
  };

  const convertMatch = (matchData: any): MatchType => {
    const nowIso = new Date().toISOString();
    return {
      id: Number(matchData.gid) || 0,
      match_id: String(matchData.gid || nowIso),
      league_name: matchData.league || '',
      home_team: matchData.home || '',
      away_team: matchData.away || '',
      match_time: matchData.time || nowIso,
      status: mode === 'live' ? 'live' : 'scheduled',
      current_score: matchData.score || '',
      match_period: [matchData.period, matchData.clock].filter(Boolean).join(' '),
      markets: matchData.markets || {},
      last_synced_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    } as MatchType;
  };

  const openBetModal = async (matchData: any, preset: { bet_type: string; bet_option: string; odds: string | number; label?: string }) => {
    await fetchAccounts(true);
    const oddsValue = parseOdds(String(preset.odds));
    if (!oddsValue || oddsValue <= 0) {
      message.warning('未获取到有效赔率');
      return;
    }
    setSelectedMatch(convertMatch(matchData));
    setSelectionPreset({ bet_type: preset.bet_type, bet_option: preset.bet_option, odds: oddsValue, label: preset.label });
    setBetModalVisible(true);
    setBetModalKey((prev) => prev + 1);
  };

  const closeBetModal = () => {
    setBetModalVisible(false);
    setSelectedMatch(null);
    setSelectionPreset(null);
  };

  const renderLastUpdated = () => {
    if (!lastUpdatedAt) {
      return '未刷新';
    }
    const fromNow = dayjs(lastUpdatedAt).format('HH:mm:ss');
    const diffSeconds = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    return `${fromNow}（${diffSeconds}s 前）`;
  };

  const renderMoneyline = (match: any, markets: any) => {
    const ml = markets.moneyline || {};
    if (!ml.home && !ml.draw && !ml.away) return <span>-</span>;
    return (
      <div className="odds-stack">
        {ml.home && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '独赢',
              bet_option: '主队',
              odds: ml.home as string,
              label: `[全场] ${(match.home || '主队')} 胜 @${ml.home}`,
            })}
          >
            <span className="odds-line">主胜</span>
            <span className="odds-value">{ml.home}</span>
          </div>
        )}
        {ml.draw && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '独赢',
              bet_option: '和局',
              odds: ml.draw as string,
              label: `[全场] 和局 @${ml.draw}`,
            })}
          >
            <span className="odds-line">和局</span>
            <span className="odds-value">{ml.draw}</span>
          </div>
        )}
        {ml.away && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '独赢',
              bet_option: '客队',
              odds: ml.away as string,
              label: `[全场] ${(match.away || '客队')} 胜 @${ml.away}`,
            })}
          >
            <span className="odds-line">客胜</span>
            <span className="odds-value">{ml.away}</span>
          </div>
        )}
      </div>
    );
  };

  const renderHandicap = (match: any, lines?: Array<{ line?: string; home?: string; away?: string }>) => {
    if (!lines || lines.length === 0) return '-';

    return (
      <div className="odds-stack-grid">
        {lines.map((data, index) => {
          // 调试：打印原始数据
          if (index === 0) {
            console.log('🔍 让球盘口原始数据:', { line: data.line, type: typeof data.line });
          }
          const formattedLine = formatHandicapLine(data.line);
          console.log('🔍 格式化后:', { original: data.line, formatted: formattedLine });
          return (
            <div key={index} className="odds-row">
              {data.home && (
                <div
                  className="odds-item-left"
                  onClick={() => openBetModal(match, {
                    bet_type: '让球',
                    bet_option: `${match.home || '主队'} ${formattedLine ? `(${formattedLine})` : ''}`,
                    odds: data.home as string,
                    label: `[让球] ${(match.home || '主队')} ${formattedLine ? `(${formattedLine})` : ''} @${data.home}`,
                  })}
                >
                  <span className="odds-team">{match.home || '主'} {formattedLine}</span>
                  <span className="odds-value">{data.home}</span>
                </div>
              )}
              {data.away && (
                <div
                  className="odds-item-right"
                  onClick={() => openBetModal(match, {
                    bet_type: '让球',
                    bet_option: `${match.away || '客队'} ${formattedLine ? `(${formattedLine})` : ''}`,
                    odds: data.away as string,
                    label: `[让球] ${(match.away || '客队')} ${formattedLine ? `(${formattedLine})` : ''} @${data.away}`,
                  })}
                >
                  <span className="odds-team">{match.away || '客'} {formattedLine}</span>
                  <span className="odds-value">{data.away}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderOverUnder = (match: any, lines?: Array<{ line?: string; over?: string; under?: string }>) => {
    if (!lines || lines.length === 0) return '-';

    return (
      <div className="odds-stack-grid">
        {lines.map((data, index) => {
          const formattedLine = formatHandicapLine(data.line);
          return (
            <div key={index} className="odds-row">
              {data.over && (
                <div
                  className="odds-item-left"
                  onClick={() => openBetModal(match, {
                    bet_type: '大小球',
                    bet_option: `大球${formattedLine ? `(${formattedLine})` : ''}`,
                    odds: data.over as string,
                    label: `[大小] 大球${formattedLine ? `(${formattedLine})` : ''} @${data.over}`,
                  })}
                >
                  <span className="odds-team">大 {formattedLine}</span>
                  <span className="odds-value">{data.over}</span>
                </div>
              )}
              {data.under && (
                <div
                  className="odds-item-right"
                  onClick={() => openBetModal(match, {
                    bet_type: '大小球',
                    bet_option: `小球${formattedLine ? `(${formattedLine})` : ''}`,
                    odds: data.under as string,
                    label: `[大小] 小球${formattedLine ? `(${formattedLine})` : ''} @${data.under}`,
                  })}
                >
                  <span className="odds-team">小 {formattedLine}</span>
                  <span className="odds-value">{data.under}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderHalfMoneyline = (match: any, ml?: { home?: string; draw?: string; away?: string }) => {
    if (!ml || (!ml.home && !ml.draw && !ml.away)) return '-';
    return (
      <div className="odds-stack">
        {ml.home && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '半场独赢',
              bet_option: '主队',
              odds: ml.home as string,
              label: `[半场独赢] ${(match.home || '主队')} 胜 @${ml.home}`,
            })}
          >
            <span className="odds-line">主半</span>
            <span className="odds-value">{ml.home}</span>
          </div>
        )}
        {ml.draw && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '半场独赢',
              bet_option: '和局',
              odds: ml.draw as string,
              label: `[半场独赢] 和局 @${ml.draw}`,
            })}
          >
            <span className="odds-line">平半</span>
            <span className="odds-value">{ml.draw}</span>
          </div>
        )}
        {ml.away && (
          <div
            className="odds-item"
            onClick={() => openBetModal(match, {
              bet_type: '半场独赢',
              bet_option: '客队',
              odds: ml.away as string,
              label: `[半场独赢] ${(match.away || '客队')} 胜 @${ml.away}`,
            })}
          >
            <span className="odds-line">客半</span>
            <span className="odds-value">{ml.away}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="matches-page" style={{ padding: isMobile ? 0 : undefined }}>
      {!isMobile && <Title level={2}>赛事中心</Title>}
      <Card
        className="matches-filter-card"
        bodyStyle={{ padding: isMobile ? 8 : 14 }}
        style={isMobile ? { marginBottom: 1, borderRadius: 0 } : {}}
      >
        <div className="filter-grid" style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : undefined }}>
          <div className="filter-left" style={{ width: isMobile ? '100%' : undefined }}>
            <div className="filter-group" style={{ flexWrap: 'wrap', gap: 4 }}>
              <Select
                size="small"
                value={gtype}
                onChange={(v) => setGtype(v as any)}
                style={{ width: isMobile ? 70 : undefined }}
                options={[
                  { label: '足球', value: 'ft' },
                  { label: '篮球', value: 'bk' },
                ]}
              />
              <Select
                size="small"
                value={showtype}
                onChange={(v) => setShowtype(v as any)}
                style={{ width: isMobile ? 70 : undefined }}
                options={[
                  { label: '滚球', value: 'live' },
                  { label: '今日', value: 'today' },
                  { label: '早盘', value: 'early' },
                ]}
              />
              {!isMobile && (
                <Segmented
                  size="small"
                  className="filter-segmented"
                  options={[
                    { label: '实时抓取', value: 'live' },
                    { label: '本地缓存', value: 'local' },
                  ]}
                  value={mode}
                  onChange={(val) => setMode(val as 'live' | 'local')}
                />
              )}
            </div>
            <div className="matches-meta" style={{ fontSize: isMobile ? 12 : undefined }}>
              当前赛事：{filtered.length} 场
            </div>
          </div>
          <div className="filter-group filter-actions" style={{ width: isMobile ? '100%' : undefined, justifyContent: isMobile ? 'space-between' : undefined }}>
            <Input
              size="small"
              allowClear
              placeholder={isMobile ? '搜索' : '搜索联赛/球队'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: isMobile ? '60%' : undefined }}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => loadMatches()}>
              {isMobile ? '' : '刷新'}
            </Button>
            {!isMobile && (
              <div className="matches-meta">
                最近刷新：{renderLastUpdated()}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="matches-card" style={isMobile ? { marginBottom: 0, borderRadius: 0 } : {}}>
        <Spin spinning={loading} tip="加载中..." delay={200}>
          {filtered.length === 0 ? (
            <Empty description="暂无赛事" />
          ) : (
            <div className="compact-matches-table">
              {/* 赛事列表 */}
              {filtered.map((m: any, idx: number) => {
                const leagueLabel = m.league || m.league_name || '未识别联赛';
                const homeLabel = m.home || m.home_team || '-';
                const awayLabel = m.away || m.away_team || '-';
                const period = m.period || m.match_period || '';
                const clock = m.clock || '';
                const scoreLabel = m.score || m.current_score || '';
                const markets = m.markets || {};
                let timeLabel = m.time || '';
                if (!timeLabel && m.match_time) {
                  try {
                    timeLabel = new Date(m.match_time).toLocaleString('zh-CN', { hour12: false });
                  } catch {
                    timeLabel = m.match_time;
                  }
                }

                const scoreDisplay = scoreLabel || '0-0';
                const { home: homeScore, away: awayScore } = getScoreParts(scoreDisplay);
                const fallbackScore = homeScore === '-' && awayScore === '-' ? '-' : `${homeScore}-${awayScore}`;
                const scoreMain = scoreLabel ? String(scoreLabel).replace(/\s+/g, '') : fallbackScore;
                const periodClock = [period, clock].filter(Boolean).join(' ');
                const matchExtra = periodClock && periodClock !== timeLabel ? periodClock : '';
                if (!timeLabel) {
                  timeLabel = matchExtra || '-';
                }
                const isEvenRow = idx % 2 === 0;

                return (
                  <div
                    key={`${m.gid || m.match_id || idx}-${idx}`}
                    className={`compact-match-card ${isEvenRow ? 'even' : 'odd'} ${isMobile ? 'mobile' : ''}`}
                  >
                    <div className="match-header-box">
                      <div className="match-league">☆ {leagueLabel}</div>
                      <div className="match-score-box">
                        <span className="match-team home">{homeLabel}</span>
                        <div className="match-score-center">
                          <span className="score-main">{scoreMain}</span>
                          <span className="score-sub">{matchExtra || timeLabel}</span>
                        </div>
                        <span className="match-team away">{awayLabel}</span>
                      </div>
                    </div>

                    {/* 全场盘口 */}
                    <div className="odds-section">
                      {!isMobile && <div className="odds-section-title">全场</div>}
                      <div className="odds-header-row">
                        <div className="odds-header-cell">独赢</div>
                        <div className="odds-header-cell">让球</div>
                        <div className="odds-header-cell">大/小</div>
                      </div>
                      <div className="odds-grid">
                        <div className="odds-col">{renderMoneyline(m, markets)}</div>
                        <div className="odds-col">{renderHandicap(m, markets.full?.handicapLines || (markets.handicap ? [markets.handicap] : []))}</div>
                        <div className="odds-col">{renderOverUnder(m, markets.full?.overUnderLines || (markets.ou ? [markets.ou] : []))}</div>
                      </div>
                    </div>

                    {/* 半场盘口 */}
                    <div className="odds-section half">
                      {!isMobile && <div className="odds-section-title">半场</div>}
                      <div className="odds-header-row">
                        <div className="odds-header-cell">独赢(半)</div>
                        <div className="odds-header-cell">让球(半)</div>
                        <div className="odds-header-cell">大/小(半)</div>
                      </div>
                      <div className="odds-grid">
                        <div className="odds-col">{renderHalfMoneyline(m, markets.half?.moneyline)}</div>
                        <div className="odds-col">{renderHandicap(m, markets.half?.handicapLines || (markets.half?.handicap ? [markets.half.handicap] : []))}</div>
                        <div className="odds-col">{renderOverUnder(m, markets.half?.overUnderLines || (markets.half?.ou ? [markets.half.ou] : []))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Spin>
      </Card>
      <BetFormModal
        key={betModalKey}
        visible={betModalVisible}
        match={selectedMatch}
        accounts={accounts}
        defaultSelection={selectionPreset}
        onCancel={closeBetModal}
        onSubmit={async () => {
          closeBetModal();
          await fetchAccounts(true);
          await loadMatches({ silent: true });
        }}
      />
    </div>
  );
};

export default MatchesPage;
