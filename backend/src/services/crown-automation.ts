import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CrownAccount } from '../types';
import { query } from '../models/database';
import { CrownApiClient } from './crown-api-client';
import { getCrownSiteManager } from './crown-site-manager';

interface BetRequest {
  betType: string;
  betOption: string;
  amount: number;
  odds: number;
  min_odds?: number;
  platformAmount?: number;
  discount?: number;
  match_id?: number;
  matchId?: number;
  crown_match_id?: string;
  crownMatchId?: string;
  gid?: string;
  wtype?: string;
  chose_team?: string;
  market?: string;
  side?: string;
  line?: string;
  league_name?: string;
  leagueName?: string;
  home_team?: string;
  homeTeam?: string;
  away_team?: string;
  awayTeam?: string;
}

interface CrownLoginResult {
  success: boolean;
  message: string;
  error?: string;
  sessionInfo?: any;
}

interface CrownBetResult {
  success: boolean;
  message: string;
  betId?: string;
  actualOdds?: number;
}

interface OddsSnapshot {
  ioratio?: string;
  ratio?: string;
  con?: string;
}

interface AccountInitResult {
  success: boolean;
  message: string;
  updatedCredentials: {
    username: string;
    password: string;
  };
}

/**
 * 纯 API 版本的皇冠自动化服务
 * 不使用 Playwright，只使用 HTTP API
 */
export class CrownAutomationService {
  private apiClients: Map<number, CrownApiClient> = new Map();
  private accountSessions: Map<number, { uid: string; mid: string; loginTime: number }> = new Map();
  private systemApiClient?: CrownApiClient;
  private systemAccount?: CrownAccount | null;
  // 并发控制与轻量缓存，避免同一时间段重复抓取导致 doubleLogin 或会话抖动
  private systemFetchInFlight?: Promise<{ matches: any[]; xml?: string }>;
  private systemFetchCache?: { key: string; matches: any[]; xml?: string; ts: number };

  private warmupDone: boolean = false;
  // 保持在线与自动恢复
  private keepAliveTimers: Map<number, NodeJS.Timeout> = new Map();
  private keepAliveIntervalMs: number = 4 * 60 * 1000; // 4 分钟心跳
  private resumeTimer?: NodeJS.Timeout;
  private resumeIntervalMs: number = 2 * 60 * 1000; // 2 分钟扫描一次 DB



  constructor() {
    console.log('🚀 初始化皇冠自动化服务 (纯API版本)');
    // 启动预热：服务初始化后短暂等待，完成系统账号登录并拉取一次赛事，记忆健康主机
    setTimeout(() => {
      this.triggerFetchWarmup().catch(() => undefined);
    }, 1500);
    // 启动自动恢复与保活循环
    this.startAutoResumeLoop();

  }


  /**
   * 初始化系统账号（用于抓取赛事）
   * 尝试所有可用账号，直到找到一个能成功登录的
   */
  async initSystemAccount(): Promise<void> {
    try {
      const result = await query(
        'SELECT * FROM crown_accounts WHERE use_for_fetch = true AND is_enabled = true ORDER BY id'
      );

      if (result.rows.length === 0) {
        console.warn('⚠️ 未找到用于抓取的系统账号');
        return;
      }

      console.log(`🔍 找到 ${result.rows.length} 个可用的系统账号，尝试登录...`);

      // 尝试每个账号，直到找到一个能成功登录的
      for (const account of result.rows) {
        this.systemAccount = account as CrownAccount;
        console.log(`🔄 尝试系统账号: ${this.systemAccount.username} (ID: ${this.systemAccount.id})`);

        const loginSuccess = await this.loginSystemAccount();
        if (loginSuccess) {
          console.log(`✅ 系统账号登录成功: ${this.systemAccount.username}`);
          return;
        } else {
          console.warn(`⚠️ 系统账号 ${this.systemAccount.username} 登录失败，尝试下一个...`);
        }
      }

      console.error('❌ 所有系统账号都登录失败');
      this.systemAccount = null;
    } catch (error) {
      console.error('❌ 初始化系统账号失败:', error);
    }
  }

  /**
   * 登录系统账号
   */
  private async loginSystemAccount(): Promise<boolean> {
    if (!this.systemAccount) {
      return false;
    }
    try {
      // 构建代理配置（如果系统账号配置了代理）
      let proxyConfig: { host: string; port: number; username?: string; password?: string; type?: string } | undefined;
      if (this.systemAccount.proxy_host && this.systemAccount.proxy_port) {
        proxyConfig = {
          host: this.systemAccount.proxy_host,
          port: this.systemAccount.proxy_port,
          username: this.systemAccount.proxy_username || undefined,
          password: this.systemAccount.proxy_password || undefined,
          type: this.systemAccount.proxy_type || undefined,
        };
      }

      this.systemApiClient = new CrownApiClient(undefined, proxyConfig);
      const result = await this.systemApiClient.login(
        this.systemAccount.username,
        this.systemAccount.password
      );
      if (result.success && result.uid) {
        console.log(`✅ 系统账号登录成功: uid=${result.uid}`);
        return true;
      } else {
        console.error(`❌ 系统账号登录失败: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error('❌ 系统账号登录异常:', error);
      return false;
    }
  }

  /**
   * 启动后预热：登录系统账号并抓一次 live 列表
   */
  public async triggerFetchWarmup(): Promise<void> {
    if (this.warmupDone) return;
    this.warmupDone = true;
    try {
      // 优先初始化系统账号
      await this.initSystemAccount();
      if (!this.systemApiClient || !this.systemApiClient.isLoggedIn()) {
        console.warn('⚠️  预热跳过：系统账号未登录');
        return;
      }
      const rs = await this.systemApiClient.getMatches({ gtype: 'ft', showtype: 'live', rtype: 'rb', ltype: '3', sorttype: 'L' });
      if (rs.success) {
        console.log(`🔥 预热完成：已抓到 ${rs.xml ? rs.xml.length : 0} 字节 XML`);
      } else {
        console.warn(`⚠️  预热抓取失败：${(rs as any).error || '未知错误'}`);
      }
    } catch (e: any) {
      console.warn('⚠️  预热异常：', e?.message || e);
      this.warmupDone = false;
    }
  }

  private async ensureSystemClient(): Promise<CrownApiClient | undefined> {
    if (this.systemApiClient && this.systemApiClient.isLoggedIn()) {
      return this.systemApiClient;
    }
    await this.initSystemAccount();
    if (this.systemApiClient && this.systemApiClient.isLoggedIn()) {
      return this.systemApiClient;
    }
    return undefined;
  }
  /**
   * 启动自动恢复循环：
   * - 服务启动后以及每隔一段时间，从 DB 恢复 is_online=true 的账号
   */
  private startAutoResumeLoop(): void {
    try { if (this.resumeTimer) clearInterval(this.resumeTimer); } catch {}
    // 启动后 3 秒先恢复一次
    setTimeout(() => { this.resumeOnlineAccounts().catch(() => undefined); }, 3000);
    // 周期性恢复
    this.resumeTimer = setInterval(() => {
      this.resumeOnlineAccounts().catch((e) => console.warn('⚠️  自动恢复异常：', e?.message || e));
    }, this.resumeIntervalMs);
  }

  /**
   * 从数据库恢复在线账号登录状态（避免进程重启后前端显示离线）
   */
  private async resumeOnlineAccounts(): Promise<void> {
    try {
      const rs = await query(
        `SELECT id, username, password FROM crown_accounts WHERE is_enabled = true AND is_online = true`
      );
      for (const row of rs.rows || []) {
        const id = Number(row.id);
        const client = this.getApiClient(id);
        if (client && client.isLoggedIn()) {
          // 确保有保活
          this.startKeepAlive(id);
          continue;
        }
        // 未在内存在线，自动补登录
        try {
          await this.loginAccount(row as any);
        } catch (e) {
          console.warn(`⚠️  恢复账号登录失败: id=${id}`, (e as any)?.message || e);
        }
      }
    } catch (e: any) {
      console.warn('⚠️  恢复在线账号异常：', e?.message || e);
    }
  }

  /**
   * 为指定账号启动保活：周期性访问轻量接口保持会话活跃，失败则自愈重登
   */
  private startKeepAlive(accountId: number): void {
    // 已存在则重置
    const existed = this.keepAliveTimers.get(accountId);
    if (existed) { try { clearInterval(existed); } catch {} }

    const timer = setInterval(async () => {
      try {
        const client = this.getApiClient(accountId);
        if (!client || !client.isLoggedIn()) {
          await this.ensureAccountSession(accountId);
          return;
        }
        // 使用 transform 获取余额（forceRefresh=true 确保真正触发请求）
        const bal = await client.getBalance(true);
        if (!bal.success) {
          await this.ensureAccountSession(accountId);
        }
      } catch (e) {
        // 任何异常均尝试自愈
        await this.ensureAccountSession(accountId).catch(() => undefined);
      }
    }, this.keepAliveIntervalMs);

    this.keepAliveTimers.set(accountId, timer);
  }

  /**
   * 停止指定账号的保活
   */
  private stopKeepAlive(accountId: number): void {
    const t = this.keepAliveTimers.get(accountId);
    if (t) {
      try { clearInterval(t); } catch {}
      this.keepAliveTimers.delete(accountId);
    }
  }

  /**
   * 确保账号在内存中已登录；若未登录则尝试按 DB 凭证自动登录
   */
  private async ensureAccountSession(accountId: number): Promise<boolean> {
    let client = this.getApiClient(accountId);
    if (client && client.isLoggedIn()) return true;
    const rs = await query('SELECT * FROM crown_accounts WHERE id = $1 AND is_enabled = true LIMIT 1', [accountId]);
    if (rs.rows.length === 0) return false;
    const acc = rs.rows[0] as any;
    const ret = await this.loginAccount(acc);
    return ret.success === true;
  }


  /**
   * 登录账号
   */
  private isTransientLoginError(message?: string): boolean {
    if (!message) return false;
    return /请求失败|status code|timeout|网络|network/i.test(message);
  }

  async loginAccount(account: CrownAccount): Promise<CrownLoginResult> {
    const siteManager = getCrownSiteManager();
    const triedSites = new Set<string>();
    let lastError = '';

    for (let attempt = 0; attempt < siteManager.getAllSites().length; attempt++) {
      const currentSite = siteManager.getCurrentSite();
      triedSites.add(currentSite);

      try {
        console.log(`🔐 [API] 登录账号: ${account.username} (站点: ${currentSite})`);

        let proxyConfig: { host: string; port: number; username?: string; password?: string; type?: string } | undefined;
        if (account.proxy_host && account.proxy_port) {
          proxyConfig = {
            host: account.proxy_host,
            port: account.proxy_port,
            username: account.proxy_username || undefined,
            password: account.proxy_password || undefined,
            type: account.proxy_type || undefined,
          };
        }

        const apiClient = new CrownApiClient(undefined, proxyConfig);
        const result = await apiClient.login(account.username, account.password);

        if (result.success && result.uid && result.mid) {
          this.apiClients.set(account.id, apiClient);
          this.accountSessions.set(account.id, {
            uid: result.uid,
            mid: result.mid,
            loginTime: Date.now(),
          });

          await query(
            `UPDATE crown_accounts
             SET is_online = true,
                 last_login_at = CURRENT_TIMESTAMP,
                 status = 'active',
                 error_message = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [account.id]
          );

          this.startKeepAlive(account.id);

          console.log(`✅ [API] 账号登录成功: ${account.username}`);
          return {
            success: true,
            message: '登录成功',
            sessionInfo: { uid: result.uid, mid: result.mid },
          };
        }

        lastError = result.error || result.message || '登录失败';
        console.error(`❌ [API] 账号登录失败: ${lastError}`);

        if (!this.isTransientLoginError(lastError)) {
          break;
        }
      } catch (error: any) {
        lastError = error.message || '登录异常';
        console.error('❌ [API] 登录异常:', lastError);
        if (!this.isTransientLoginError(lastError)) {
          break;
        }
      }

      const nextSite = await siteManager.autoSwitchToAvailableSite();
      if (!nextSite || triedSites.has(nextSite)) {
        break;
      }
    }

    return {
      success: false,
      message: lastError || '登录失败',
      error: lastError || '登录失败',
    };
  }

  /**
   * 登出账号
   */
  async logoutAccount(accountId: number): Promise<boolean> {
    try {
      const apiClient = this.apiClients.get(accountId);
      if (apiClient) {
        try {
          apiClient.logout();
        } catch (err) {
          console.warn('⚠️ [API] 登出客户端异常(忽略继续):', (err as any)?.message || err);
        }
        this.apiClients.delete(accountId);
        this.accountSessions.delete(accountId);
        // 停止保活
        this.stopKeepAlive(accountId);
      }

      await query(
        `UPDATE crown_accounts
         SET is_online = false,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [accountId]
      );

      console.log(`✅ [API] 账号已登出: ${accountId}`);
      return true;
    } catch (error: any) {
      console.error('❌ [API] 登出账号异常:', error?.message || error);
      return false;
    }
  }

  async initializeAccountCredentials(account: CrownAccount, credentials: { username: string; password: string }): Promise<AccountInitResult> {
    console.log(`🔐 [API] 开始初始化账号: ${account.username} -> ${credentials.username}`);

    try {
      // 1. 使用原始账号和密码登录
      const client = this.getOrCreateClient(account.id);

      console.log(`📝 [API] 步骤1: 使用原始凭据登录...`);
      const loginResult = await client.login(account.username, account.password || '');

      if (!loginResult.success) {
        console.error(`❌ [API] 登录失败: ${loginResult.message}`);
        return {
          success: false,
          message: `登录失败: ${loginResult.message}`,
          updatedCredentials: {
            username: account.username,
            password: account.password || '',
          },
        };
      }

      // 检查是否需要修改密码（msg=109表示首次登录需要修改密码）
      if (loginResult.msg !== '109') {
        console.log(`ℹ️ [API] 账号无需初始化 (msg=${loginResult.msg})`);
        return {
          success: false,
          message: '该账号无需初始化，可能已经完成过首次登录',
          updatedCredentials: {
            username: account.username,
            password: account.password || '',
          },
        };
      }

      console.log(`✅ [API] 登录成功，检测到需要修改密码 (msg=109)`);

      // 2. 修改密码
      console.log(`📝 [API] 步骤2: 修改密码为 ${credentials.password}...`);
      const changeResult = await client.changePassword(credentials.password);

      if (!changeResult.success) {
        console.error(`❌ [API] 修改密码失败: ${changeResult.message}`);
        return {
          success: false,
          message: `修改密码失败: ${changeResult.message}`,
          updatedCredentials: {
            username: account.username,
            password: account.password || '',
          },
        };
      }

      console.log(`✅ [API] 密码修改成功`);

      // 3. 使用新密码重新登录验证
      console.log(`📝 [API] 步骤3: 使用新密码重新登录验证...`);
      const verifyResult = await client.login(credentials.username, credentials.password);

      if (!verifyResult.success) {
        console.error(`❌ [API] 新密码登录验证失败: ${verifyResult.message}`);
        return {
          success: false,
          message: `新密码登录验证失败: ${verifyResult.message}`,
          updatedCredentials: {
            username: credentials.username,
            password: credentials.password,
          },
        };
      }

      console.log(`✅ [API] 账号初始化完成: ${account.username} -> ${credentials.username}`);

      return {
        success: true,
        message: '账号初始化成功',
        updatedCredentials: {
          username: credentials.username,
          password: credentials.password,
        },
      };
    } catch (error: any) {
      console.error(`❌ [API] 账号初始化异常:`, error);
      return {
        success: false,
        message: `初始化异常: ${error.message || '未知错误'}`,
        updatedCredentials: {
          username: account.username,
          password: account.password || '',
        },
      };
    }
  }

  async getExternalIP(accountId: number): Promise<string | null> {
    try {
      const result = await query(
        `SELECT proxy_enabled, proxy_type, proxy_host, proxy_port, proxy_username, proxy_password
         FROM crown_accounts WHERE id = $1`,
        [accountId]
      );
      if (result.rows.length === 0) {
        return null;
      }

      const agent = this.buildProxyAgent(result.rows[0]);
      const response = await axios.get('https://api.ipify.org?format=json', {
        timeout: 8000,
        ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
      });

      if (response && response.data) {
        if (typeof response.data === 'string') {
          return response.data.trim() || null;
        }
        const value = response.data.ip ?? response.data.origin;
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
      }
      return null;
    } catch (error: any) {
      console.warn('⚠️ [API] 获取出口 IP 失败:', error?.message || error);
      return null;
    }
  }

  async getAccountCredit(accountId: number): Promise<number | null> {
    try {
      const summary = await this.getAccountFinancialSummary(accountId);
      return summary.credit ?? null;
    } catch (error: any) {
      console.warn('⚠️ [API] 获取账号额度失败:', error?.message || error);
      return null;
    }
  }

  /**
   * 检查账号是否在线
   */
  isAccountOnline(accountId: number): boolean {
    return this.apiClients.has(accountId);
  }

  /**
   * 获取活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.apiClients.size;
  }

  /**
   * 获取系统状态
   */
  getSystemStatus(): {
    systemAccountOnline: boolean;
    totalAccounts: number;
    onlineAccounts: number;
  } {
    return {
      systemAccountOnline: this.systemApiClient?.isLoggedIn() || false,
      totalAccounts: this.apiClients.size,
      onlineAccounts: this.apiClients.size,
    };
  }

  /**
   * 获取账号的 API 客户端
   */
  private getApiClient(accountId: number): CrownApiClient | undefined {
    return this.apiClients.get(accountId);
  }

  /**
   * 获取账号财务信息（余额和信用额度）
   *
   * 通过解析主页 HTML 获取余额信息
   */
  async getAccountFinancialSummary(accountId: number): Promise<{
    balance: number | null;
    credit: number | null;
    balanceSource: string;
    creditSource: string;
  }> {
    try {
      const client = this.getApiClient(accountId);

      if (!client || !client.isLoggedIn()) {
        console.log(`ℹ️  账号 ${accountId} 未登录，无法获取余额`);
        return {
          balance: null,
          credit: null,
          balanceSource: 'not_logged_in',
          creditSource: 'not_logged_in',
        };
      }

      // 调用 API 获取余额（强制刷新，不使用缓存）
      const result = await client.getBalance(true);

      // 即使 success 为 false，也检查是否有余额或额度数据
      if (result.balance !== null || result.credit !== null) {
        const effectiveBalance = result.balance ?? result.credit ?? null;
        console.log(`✅ [API] 账号 ${accountId} 余额: ${effectiveBalance} (balance=${result.balance}, credit=${result.credit})`);
        return {
          balance: effectiveBalance,
          credit: result.credit,
          balanceSource: result.balance !== null ? 'api_fetch' : (result.credit !== null ? 'credit_only' : 'unavailable'),
          creditSource: result.credit !== null ? 'api_fetch' : 'unavailable',
        };
      } else {
        console.warn(`⚠️  [API] 账号 ${accountId} 余额获取失败: ${result.error || '未知错误'}`);
        return {
          balance: null,
          credit: null,
          balanceSource: 'error',
          creditSource: 'error',
        };
      }
    } catch (error: any) {
      console.error(`❌ 获取账号 ${accountId} 余额异常:`, error);
      return {
        balance: null,
        credit: null,
        balanceSource: 'error',
        creditSource: 'error',
      };
    }
  }

  /**
   * 抓取赛事列表
   */
  async fetchMatchesSystem(params: {
    gtype?: string;
    showtype?: string;
    rtype?: string;
    ltype?: string;
    sorttype?: string;
  }): Promise<{ matches: any[]; xml?: string }> {
    const gtype = String(params.gtype || 'ft');
    const showtype = String(params.showtype || 'live');
    const rtype = String(params.rtype || (showtype === 'live' ? 'rb' : 'r'));
    const ltype = String(params.ltype || '3');
    const sorttype = String(params.sorttype || 'L');
    const key = `${gtype}|${showtype}|${rtype}|${ltype}|${sorttype}`;

    // 命中最近缓存（2秒内）直接返回，降低抖动
    if (this.systemFetchCache && this.systemFetchCache.key === key && Date.now() - this.systemFetchCache.ts < 2000) {
      return { matches: this.systemFetchCache.matches, xml: this.systemFetchCache.xml };
    }

    // 存在进行中的同参数请求则复用
    if (this.systemFetchInFlight) {
      try {
        return await this.systemFetchInFlight;
      } catch {
        // 忽略，继续执行新的抓取
      }
    }

    this.systemFetchInFlight = (async () => {
      try {
        // 确保系统账号已登录
        if (!this.systemApiClient || !this.systemApiClient.isLoggedIn()) {
          console.log('🔄 系统账号未登录，尝试登录...');
          const success = await this.loginSystemAccount();
          if (!success) {
            console.error('❌ 系统账号登录失败');
            const fallback = { matches: [] as any[] };
            this.systemFetchCache = { key, ...fallback, ts: Date.now() };
            return fallback;
          }
        }

        // 获取赛事列表
        const result = await this.systemApiClient!.getMatches({ gtype, showtype, rtype, ltype, sorttype });

        if (result.success && result.xml) {
          const matches = await this.parseMatchesFromXml(result.xml);
          console.log(`✅ [API] 获取赛事成功: ${matches.length} 场`);
          const ok = { matches, xml: result.xml };
          this.systemFetchCache = { key, ...ok, ts: Date.now() };
          return ok;
        } else {
          console.error(`❌ [API] 获取赛事失败: ${result.error}`);
          const fallback = { matches: [] as any[] };
          this.systemFetchCache = { key, ...fallback, ts: Date.now() };
          return fallback;
        }
      } catch (error: any) {
        console.error('❌ [API] 抓取赛事异常:', error);
        const fallback = { matches: [] as any[] };
        this.systemFetchCache = { key, ...fallback, ts: Date.now() };
        return fallback;
      } finally {
        // 清理 inFlight 标记
        this.systemFetchInFlight = undefined;
      }
    })();

    return await this.systemFetchInFlight;
  }
  /**
   * 抓取赛事列表（指定账号）
   * 如果账号未登录，会自动尝试登录一次
   */
  async fetchMatches(accountId: number, params: {
    gtype?: string;
    showtype?: string;
    rtype?: string;
    ltype?: string;
    sorttype?: string;
  }): Promise<{ matches: any[]; xml?: string }> {
    try {
      let client = this.getApiClient(accountId);
      if (!client || !client.isLoggedIn()) {
        console.log(`ℹ️  账号 ${accountId} 未在线，尝试自动登录...`);
        const rs = await query('SELECT * FROM crown_accounts WHERE id = $1 AND is_enabled = true LIMIT 1', [accountId]);
        if (rs.rows.length > 0) {
          const account = rs.rows[0] as CrownAccount;
          const loginRet = await this.loginAccount(account);
          if (!loginRet.success) {
            console.error(`❌ [API] 自动登录失败: ${loginRet.message}`);
            return { matches: [] };
          }
          client = this.getApiClient(accountId);
        } else {
          console.error(`❌ [API] 未找到账号 ${accountId}`);
          return { matches: [] };
        }
      }

      const result = await client!.getMatches(params);
      if (result.success && result.xml) {
        const matches = await this.parseMatchesFromXml(result.xml);
        console.log(`✅ [API] 获取赛事成功(账号${accountId}): ${matches.length} 场`);
        return { matches, xml: result.xml };
      } else {
        console.error(`❌ [API] 获取赛事失败(账号${accountId}): ${result.error}`);
        return { matches: [] };
      }
    } catch (e: any) {
      console.error('❌ [API] 抓取赛事异常:', e);
      return { matches: [] };
    }
  }


  /**
   * 解析赛事 XML
   */
  private async parseMatchesFromXml(xmlString: string): Promise<any[]> {
    if (!xmlString) {
      return [];
    }
    const results: any[] = [];
    const gameRegex = /<game\b[^>]*>([\s\S]*?)<\/game>/gi;
    let match: RegExpExecArray | null;

    const pickTag = (block: string, tags: string[]): string => {
      for (const tag of tags) {
        const regex = new RegExp(`<${tag}>([\s\S]*?)<\\/${tag}>`, 'i');
        const found = block.match(regex);
        if (found && found[1] !== undefined) {
          return found[1].trim();
        }
      }
      return '';
    };

    // 兼容含属性/CDATA 的标签提取
    const pickField = (block: string, tags: string[]): string => {
      const cleanup = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/\s+/g, ' ').trim();
      for (const tag of tags) {
        const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = block.match(regex);
        if (match && match[1] !== undefined) {
          return cleanup(match[1]);
        }
      }
      return '';
    };

    while ((match = gameRegex.exec(xmlString)) !== null) {
      const fullBlock = match[0];
      const block = match[1];
      const openTag = fullBlock.split('>')[0];
      const attrIdMatch = openTag.match(/id="(\d+)/i);

      const league = pickField(block, ['LEAGUE', 'league', 'L']);
      const home = pickField(block, ['TEAM_H', 'team_h', 'H', 'TEAM_H_E', 'TEAM_H_TW']);
      const away = pickField(block, ['TEAM_C', 'team_c', 'C', 'TEAM_C_E', 'TEAM_C_TW']);
      const time = pickField(block, ['DATETIME', 'datetime', 'TIME']);
      const gid = pickField(block, ['GID', 'gid']) || (attrIdMatch ? attrIdMatch[1] : '');
      const scoreH = pickField(block, ['SCORE_H', 'score_h']);
      const scoreC = pickField(block, ['SCORE_C', 'score_c']);
      const score = (scoreH || scoreC) ? `${scoreH || '0'}-${scoreC || '0'}` : pickField(block, ['SCORE', 'score']);
      const status = pickField(block, ['RUNNING', 'STATUS', 'running', 'status']);
      const retime = pickField(block, ['RETIMESET', 'retimeset']);

      let period = '', clock = '';
      if (retime && retime.includes('^')) {
        const parts = retime.split('^');
        period = (parts[0] || '').trim();
        clock = (parts[1] || '').trim();
      }

      const markets = this.parseMarkets(block);

      if (league || (home && away)) {
        results.push({ gid, league, home, away, time, score, status, period, clock, markets });
      }
    }

    return results;
  }

  /**
   * 下注
   */
  async placeBet(accountId: number, betRequest: BetRequest): Promise<CrownBetResult> {
    try {
      const apiClient = this.getApiClient(accountId);
      if (!apiClient) {
        return {
          success: false,
          message: '账号未登录',
        };
      }

      // 提取下注参数
      const gid = betRequest.gid || betRequest.crownMatchId || betRequest.crown_match_id || '';
      if (!gid) {
        return {
          success: false,
          message: '缺少比赛ID',
        };
      }

      // 映射 wtype 和 chose_team
      const { wtype, chose_team, line } = this.mapBetParams(betRequest);
      const oddsValue = Number(betRequest.odds);

      // 下单前若设置了最低赔率，则先拉取一次官网赔率，满足再继续
      let preCheckOdds: OddsSnapshot | null = null;
      const shouldCheckMinOdds = typeof betRequest.min_odds === 'number' && Number.isFinite(betRequest.min_odds) && betRequest.min_odds > 0;
      if (shouldCheckMinOdds) {
        preCheckOdds = await this.fetchOddsSnapshot(apiClient, { gid, wtype, chose_team });
        if (preCheckOdds && preCheckOdds.ioratio) {
          const snapshotValue = Number(preCheckOdds.ioratio);
          if (Number.isFinite(snapshotValue) && snapshotValue < (betRequest.min_odds as number)) {
            return {
              success: false,
              message: `当前官方赔率 ${snapshotValue} 低于最低赔率 ${betRequest.min_odds}`,
            };
          }
        } else {
          console.warn(`⚠️ [API] accountId=${accountId} 预检官方赔率失败，直接交由官方接口校验。`);
          preCheckOdds = null;
        }
      }

      // 仅打印我们本地可见的上下文，实际 con/ratio/ioratio 将由下游自动补齐
      console.log(`🔍 [API] 下注参数(预提交): gid=${gid}, wtype=${wtype}, chose_team=${chose_team}, gold=${betRequest.amount}, line=${line}`);
      console.log(`🔍 [API] betRequest.betOption=${betRequest.betOption}`);

      // 下注
      const result = await apiClient.placeBet({
        gid,
        wtype,
        chose_team,
        gold: betRequest.amount,
        con: preCheckOdds?.con,
        ratio: preCheckOdds?.ratio,
        ioratio: preCheckOdds?.ioratio,
        minOdds: shouldCheckMinOdds ? betRequest.min_odds : undefined,
      });

      if (result.success) {
        try { apiClient.clearBalanceCache(); } catch {}
        console.log(`✅ [API] 下注成功: accountId=${accountId}, gid=${gid}, amount=${betRequest.amount}`);
        return {
          success: true,
          message: '下注成功',
          betId: result.betId,
          actualOdds: result.odds ?? oddsValue,
        };
      } else {
        console.error(`❌ [API] 下注失败: accountId=${accountId}, gid=${gid}, reason=${result.error || '未知错误'}, requestOdds=${betRequest.odds}, minOdds=${betRequest.min_odds}`);
        return {
          success: false,
          message: result.error || '下注失败',
        };
      }
    } catch (error: any) {
      console.error('❌ [API] 下注异常:', error);
      return {
        success: false,
        message: error.message || '下注异常',
      };
    }
  }

  /**
   * 拉取账号的指定日期注单（对账用）
   * @param accountId 账号ID
   * @param date 可选参数，格式为 YYYY-MM-DD，如果不传则默认查询昨天
   */
  async fetchTodayWagers(accountId: number, date?: string): Promise<Array<{ ticketId: string; gold?: string; winGold?: string; ballActRet?: string; resultText?: string }>> {
    console.log(`🔍 [Automation] 开始获取账号 ${accountId} 的注单 (日期: ${date || '昨天'})...`);

    let client = this.getApiClient(accountId);
    if (!client || !client.isLoggedIn()) {
      console.log(`⚠️ [Automation] 账号 ${accountId} 未登录，尝试 ensureAccountSession...`);
      const ok = await this.ensureAccountSession(accountId);
      if (!ok) {
        throw new Error('重新登录失败: ensureAccountSession 返回 false');
      }
      client = this.getApiClient(accountId);
      if (!client || !client.isLoggedIn()) {
        throw new Error('登录后客户端不可用');
      }
    }

    console.log(`✅ [Automation] 账号 ${accountId} 客户端已就绪，调用 getTodayWagers(${date || '昨天'})...`);

    // 第一次尝试
    let res = await client.getTodayWagers(date);

    console.log(`📊 [Automation] 账号 ${accountId} getTodayWagers() 返回: success=${res.success}, error=${res.error}`);

    // 如果返回 doubleLogin 错误，尝试重新登录
    if (!res.success && res.error === 'doubleLogin') {
      console.log(`⚠️  [Automation] 账号 ${accountId} getTodayWagers 返回 doubleLogin，尝试重新登录...`);

      const ok = await this.ensureAccountSession(accountId);
      if (!ok) {
        throw new Error('重新登录失败: ensureAccountSession 返回 false');
      }

      const refreshedClient = this.getApiClient(accountId);
      if (!refreshedClient) {
        throw new Error('重新登录后客户端不可用');
      }

      // 重试获取注单
      console.log(`🔄 [Automation] 账号 ${accountId} 重新登录成功，重试获取注单...`);
      res = await refreshedClient.getTodayWagers(date);
      console.log(`📊 [Automation] 账号 ${accountId} 重试后 getTodayWagers() 返回: success=${res.success}, error=${res.error}`);
    }

    if (res.success && res.items) {
      console.log(`✅ [Automation] 账号 ${accountId} 成功获取 ${res.items.length} 条注单`);
      return res.items;
    }

    console.log(`❌ [Automation] 账号 ${accountId} 获取注单失败: ${res.error}`);
    throw new Error(res.error || '获取今日注单失败');
  }

  /**
   * 查询单个注单的结算详情
   */
  async fetchBetDetail(accountId: number, ticketId: string): Promise<{ success: boolean; winGold?: string; ballActRet?: string; resultText?: string; error?: string }> {
    const client = this.getApiClient(accountId);
    if (!client || !client.isLoggedIn()) {
      return { success: false, error: '账号未登录' };
    }
    const res = await client.getBetDetail(ticketId);
    return res;
  }

  /**
   * 获取当前官方赔率（仅预览，不会下单）
   */
  async previewBetOdds(accountId: number, betRequest: BetRequest): Promise<{ success: boolean; odds?: number; error?: string }> {
    try {
      const apiClient = this.getApiClient(accountId);
      if (!apiClient) {
        return { success: false, error: '账号未登录' };
      }

      const gid = betRequest.gid || betRequest.crownMatchId || betRequest.crown_match_id || '';
      if (!gid) {
        return { success: false, error: '缺少比赛ID' };
      }

      const { wtype, chose_team } = this.mapBetParams(betRequest);
      const snapshot = await this.fetchOddsSnapshot(apiClient, { gid, wtype, chose_team });
      if (!snapshot || !snapshot.ioratio) {
        return { success: false, error: '无法获取官方赔率' };
      }

      const oddsNumber = Number(snapshot.ioratio);
      if (!Number.isFinite(oddsNumber)) {
        return { success: false, error: '无法解析官方赔率' };
      }

      return {
        success: true,
        odds: oddsNumber,
      };
    } catch (error: any) {
      console.error('❌ [API] 获取官方赔率异常:', error);
      return {
        success: false,
        error: error.message || '获取官方赔率失败',
      };
    }
  }

  async previewMatchOdds(betRequest: BetRequest): Promise<{ success: boolean; odds?: number; error?: string }> {
    try {
      const gid = betRequest.gid || betRequest.crownMatchId || betRequest.crown_match_id || '';
      if (!gid) {
        return { success: false, error: '缺少比赛ID' };
      }

      const { wtype, chose_team } = this.mapBetParams(betRequest);
      const systemClient = await this.ensureSystemClient();
      if (!systemClient) {
        return { success: false, error: '暂无可用的系统账号' };
      }

      const snapshot = await this.fetchOddsSnapshot(systemClient, { gid, wtype, chose_team });
      if (!snapshot || !snapshot.ioratio) {
        return { success: false, error: '无法获取官方赔率' };
      }

      const oddsNumber = Number(snapshot.ioratio);
      if (!Number.isFinite(oddsNumber)) {
        return { success: false, error: '无法解析官方赔率' };
      }

      return {
        success: true,
        odds: oddsNumber,
      };
    } catch (error: any) {
      console.error('❌ [API] 系统赔率预览异常:', error);
      return {
        success: false,
        error: error.message || '获取官方赔率失败',
      };
    }
  }

  private parseOddsPayload(payload: any): OddsSnapshot {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
    const pick = (re: RegExp) => {
      const match = raw.match(re);
      return match && match[1] ? match[1] : undefined;
    };
    return {
      ioratio: pick(/ioratio["'=:\s>]*([0-9.]+)/i),
      ratio: pick(/ratio["'=:\s>]*([-0-9.]+)/i) || '2000',
      con: pick(/con["'=:\s>]*([-0-9./]+)/i) || '0',
    };
  }

  private async fetchOddsSnapshot(apiClient: CrownApiClient, params: { gid: string; wtype: string; chose_team: string }): Promise<OddsSnapshot | null> {
    try {
      const odds = await apiClient.getOdds({
        gid: params.gid,
        gtype: 'FT',
        wtype: params.wtype,
        chose_team: params.chose_team,
      });
      if (!odds.success || !odds.data) {
        return null;
      }
      return this.parseOddsPayload(odds.data);
    } catch (error: any) {
      console.warn('⚠️ [API] 获取官方赔率失败:', error?.message || error);
      return null;
    }
  }

  private buildProxyAgent(account: {
    proxy_enabled?: boolean;
    proxy_type?: string | null;
    proxy_host?: string | null;
    proxy_port?: number | null;
    proxy_username?: string | null;
    proxy_password?: string | null;
  }): any | undefined {
    if (!account || !account.proxy_enabled) {
      return undefined;
    }
    if (!account.proxy_host || !account.proxy_port) {
      return undefined;
    }

    const protocol = (account.proxy_type || 'http').toLowerCase().includes('socks') ? 'socks' : 'http';
    const auth = account.proxy_username && account.proxy_password
      ? `${encodeURIComponent(account.proxy_username)}:${encodeURIComponent(account.proxy_password)}@`
      : '';
    const proxyUrl = `${protocol === 'socks' ? 'socks5' : 'http'}://${auth}${account.proxy_host}:${account.proxy_port}`;

    try {
      if (protocol === 'socks') {
        return new SocksProxyAgent(proxyUrl);
      }
      return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
      console.warn('⚠️ [API] 创建代理 Agent 失败:', (error as any)?.message || error);
      return undefined;
    }
  }

  /**
   * 获取账号的历史总览
   */
  async getAccountHistory(accountId: number, params?: {
    startDate?: string;
    endDate?: string;
    sportType?: string;
  }): Promise<{
    success: boolean;
    data?: Array<{
      date: string;
      dayOfWeek: string;
      betAmount: number;
      validAmount: number;
      winLoss: number;
    }>;
    total?: {
      betAmount: number;
      validAmount: number;
      winLoss: number;
    };
    error?: string;
  }> {
    const { startDate, endDate } = params || {};

    // 1. 先从数据库查询
    try {
      const dbResult = await query(
        `SELECT date, day_of_week, bet_amount, valid_amount, win_loss
         FROM account_history
         WHERE account_id = $1
           AND date >= $2
           AND date <= $3
         ORDER BY date DESC`,
        [accountId, startDate || '2020-01-01', endDate || '2099-12-31']
      );

      if (dbResult.rows.length > 0) {
        console.log(`📦 [数据库] 从数据库获取到 ${dbResult.rows.length} 条历史记录`);

        const data = dbResult.rows.map((row: any) => ({
          date: row.date.toISOString().split('T')[0],
          dayOfWeek: row.day_of_week,
          betAmount: parseFloat(row.bet_amount),
          validAmount: parseFloat(row.valid_amount),
          winLoss: parseFloat(row.win_loss),
        }));

        const total = data.reduce((acc, item) => ({
          betAmount: acc.betAmount + item.betAmount,
          validAmount: acc.validAmount + item.validAmount,
          winLoss: acc.winLoss + item.winLoss,
        }), { betAmount: 0, validAmount: 0, winLoss: 0 });

        return { success: true, data, total };
      }
    } catch (error) {
      console.error('❌ [数据库] 查询历史数据失败:', error);
    }

    // 2. 数据库没有数据，从API获取
    console.log('📡 [API] 数据库无数据，从皇冠API获取');
    const client = this.getApiClient(accountId);
    if (!client || !client.isLoggedIn()) {
      return { success: false, error: '账号未登录' };
    }

    const apiResult = await client.getAccountHistory(params || {});

    // 3. 保存到数据库
    if (apiResult.success && apiResult.data && apiResult.data.length > 0) {
      await this.saveHistoryToDB(accountId, apiResult.data);
    }

    return apiResult;
  }

  /**
   * 保存历史数据到数据库
   */
  private async saveHistoryToDB(accountId: number, data: Array<{
    date: string;
    dayOfWeek: string;
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }>) {
    try {
      for (const record of data) {
        await query(
          `INSERT INTO account_history (account_id, date, day_of_week, bet_amount, valid_amount, win_loss)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (account_id, date)
           DO UPDATE SET
             day_of_week = EXCLUDED.day_of_week,
             bet_amount = EXCLUDED.bet_amount,
             valid_amount = EXCLUDED.valid_amount,
             win_loss = EXCLUDED.win_loss,
             updated_at = CURRENT_TIMESTAMP`,
          [accountId, record.date, record.dayOfWeek, record.betAmount, record.validAmount, record.winLoss]
        );
      }
      console.log(`💾 [数据库] 已保存 ${data.length} 条历史记录`);
    } catch (error) {
      console.error('❌ [数据库] 保存历史数据失败:', error);
    }
  }


  /**
   * 解析赛事盘口信息
   */
  private parseMarkets(block: string): any {
    const cleanup = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/\s+/g, ' ').trim();
    const pick = (tags: string[]): string => {
      for (const tag of tags) {
        const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = block.match(regex);
        if (match && match[1] !== undefined) {
          return cleanup(match[1]);
        }
      }
      return '';
    };

    const markets: any = {
      full: {},
      half: {},
    };

    // 独赢
    const moneyline = {
      home: pick(['IOR_RMH', 'IOR_MH']),
      draw: pick(['IOR_RMN', 'IOR_MN', 'IOR_RMD']),
      away: pick(['IOR_RMC', 'IOR_MC']),
    };
    if (moneyline.home || moneyline.draw || moneyline.away) {
      markets.moneyline = { ...moneyline };
      markets.full.moneyline = { ...moneyline };
    }

    // 让球 - 支持多个盘口
    const handicapLines: Array<{ line: string; home: string; away: string }> = [];
    const addHandicapLine = (ratioKeys: string[], homeKeys: string[], awayKeys: string[]) => {
      const line = pick(ratioKeys);
      const homeOdds = pick(homeKeys);
      const awayOdds = pick(awayKeys);
      if (line || homeOdds || awayOdds) {
        handicapLines.push({ line, home: homeOdds, away: awayOdds });
      }
    };
    // 主盘口
    addHandicapLine(['RATIO_RE', 'RATIO_R'], ['IOR_REH', 'IOR_RH'], ['IOR_REC', 'IOR_RC']);
    // 额外盘口 (可能有多个)
    addHandicapLine(['RATIO_ROUHO'], ['IOR_ROUHO'], ['IOR_ROUHU']);
    addHandicapLine(['RATIO_ROUCO'], ['IOR_ROUCO'], ['IOR_ROUCU']);
    addHandicapLine(['RATIO_RE2'], ['IOR_REH2'], ['IOR_REC2']);
    addHandicapLine(['RATIO_RE3'], ['IOR_REH3'], ['IOR_REC3']);
    addHandicapLine(['RATIO_RE4'], ['IOR_REH4'], ['IOR_REC4']);
    if (handicapLines.length > 0) {
      markets.handicap = { ...handicapLines[0] };
      markets.full.handicap = { ...handicapLines[0] };
      markets.full.handicapLines = handicapLines;
    }

    // 大小球
    const ouLines: Array<{ line: string; over: string; under: string }> = [];
    const addOuLine = (
      ratioKeysO: string[],
      ratioKeysU: string[],
      overKeys: string[],
      underKeys: string[]
    ) => {
      const lineOver = pick(ratioKeysO);
      const lineUnder = pick(ratioKeysU);
      const line = lineOver || lineUnder;
      const overOdds = pick(overKeys);
      const underOdds = pick(underKeys);
      if (line || overOdds || underOdds) {
        ouLines.push({ line, over: overOdds, under: underOdds });
      }
    };
    addOuLine(['RATIO_ROUO', 'RATIO_OUO'], ['RATIO_ROUU', 'RATIO_OUU'], ['IOR_ROUH', 'IOR_OUH'], ['IOR_ROUC', 'IOR_OUC']);
    addOuLine(['RATIO_ROUHO'], ['RATIO_ROUHU'], ['IOR_ROUHO'], ['IOR_ROUHU']);
    addOuLine(['RATIO_ROUCO'], ['RATIO_ROUCU'], ['IOR_ROUCO'], ['IOR_ROUCU']);
    if (ouLines.length > 0) {
      markets.ou = { ...ouLines[0] };
      markets.full.ou = { ...ouLines[0] };
      markets.full.overUnderLines = ouLines;
    }

    // 半场独赢
    const halfMoneyline = {
      home: pick(['IOR_HRMH']),
      draw: pick(['IOR_HRMN']),
      away: pick(['IOR_HRMC']),
    };
    if (halfMoneyline.home || halfMoneyline.draw || halfMoneyline.away) {
      markets.half.moneyline = { ...halfMoneyline };
    }

    // 半场让球
    const halfHandicap: Array<{ line: string; home: string; away: string }> = [];
    const addHalfHandicap = (ratioKeys: string[], homeKeys: string[], awayKeys: string[]) => {
      const line = pick(ratioKeys);
      const homeOdds = pick(homeKeys);
      const awayOdds = pick(awayKeys);
      if (line || homeOdds || awayOdds) {
        halfHandicap.push({ line, home: homeOdds, away: awayOdds });
      }
    };
    // 主盘口
    addHalfHandicap(['RATIO_HRE'], ['IOR_HREH'], ['IOR_HREC']);
    // 额外盘口 (可能有多个)
    addHalfHandicap(['RATIO_HROUHO'], ['IOR_HROUHO'], ['IOR_HROUHU']);
    addHalfHandicap(['RATIO_HROUCO'], ['IOR_HROUCO'], ['IOR_HROUCU']);
    addHalfHandicap(['RATIO_HRE2'], ['IOR_HREH2'], ['IOR_HREC2']);
    addHalfHandicap(['RATIO_HRE3'], ['IOR_HREH3'], ['IOR_HREC3']);
    if (halfHandicap.length > 0) {
      markets.half.handicap = { ...halfHandicap[0] };
      markets.half.handicapLines = halfHandicap;
    }

    // 半场大小球
    const halfOu: Array<{ line: string; over: string; under: string }> = [];
    const addHalfOu = (
      ratioKeysO: string[],
      ratioKeysU: string[],
      overKeys: string[],
      underKeys: string[]
    ) => {
      const lineOver = pick(ratioKeysO);
      const lineUnder = pick(ratioKeysU);
      const line = lineOver || lineUnder;
      const overOdds = pick(overKeys);
      const underOdds = pick(underKeys);
      if (line || overOdds || underOdds) {
        halfOu.push({ line, over: overOdds, under: underOdds });
      }
    };
    // 主盘口
    addHalfOu(['RATIO_HROUO'], ['RATIO_HROUU'], ['IOR_HROUH'], ['IOR_HROUC']);
    // 额外盘口 (可能有多个)
    addHalfOu(['RATIO_HROUHO'], ['RATIO_HROUHU'], ['IOR_HROUHO'], ['IOR_HROUHU']);
    addHalfOu(['RATIO_HROUCO'], ['RATIO_HROUCU'], ['IOR_HROUCO'], ['IOR_HROUCU']);
    if (halfOu.length > 0) {
      markets.half.ou = { ...halfOu[0] };
      markets.half.overUnderLines = halfOu;
    }

    if (Object.keys(markets.half).length === 0) {
      delete markets.half;
    }
    if (Object.keys(markets.full).length === 0) {
      delete markets.full;
    }

    return markets;
  }

  /**
   * 映射下注参数（基础版）
   * - moneyline/独赢: wtype=RM, chose_team=H/C/N
   * - handicap/让球: wtype=RE, chose_team=H/C
   * - overUnder/大小: wtype=ROU, chose_team=C(大/Over), H(小/Under)
   */
  private mapBetParams(betRequest: BetRequest): { wtype: string; chose_team: string; line?: string } {
    // 允许直接传 wtype/chose_team 覆盖
    if (betRequest.wtype && betRequest.chose_team) {
      return { wtype: String(betRequest.wtype), chose_team: String(betRequest.chose_team), line: betRequest.line };
    }

    const type = String(betRequest.market || betRequest.betType || '').toLowerCase();
    const opt = String(betRequest.side || betRequest.betOption || '').toLowerCase();
    const lineRaw = betRequest.line
      || (betRequest.betOption && betRequest.betOption.match(/\(([^)]+)\)/)?.[1])
      || '';

    // 处理盘口值：将 "0 / 0.5" 转换成 "0.25"
    let line: string | undefined = undefined;
    if (lineRaw) {
      const cleaned = lineRaw.replace(/[^\d./+-]/g, '');
      // 检查是否是两球盘格式（如 "0/0.5", "1/1.5"）
      const twoWayMatch = cleaned.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
      if (twoWayMatch) {
        // 计算平均值
        const val1 = parseFloat(twoWayMatch[1]);
        const val2 = parseFloat(twoWayMatch[2]);
        line = String((val1 + val2) / 2);
      } else {
        line = cleaned;
      }
    }

    let wtype = 'RM';
    let chose_team = 'C';

    if (/(moneyline|独赢|ml)/.test(type) || type === '') {
      wtype = 'RM';
      if (/home|h|主/.test(opt)) chose_team = 'H';
      else if (/away|c|客/.test(opt)) chose_team = 'C';
      else if (/draw|n|和|平/.test(opt)) chose_team = 'N';
    } else if (/(handicap|让)/.test(type)) {
      wtype = 'RE';
      chose_team = /home|h|主/.test(opt) ? 'H' : 'C';
    } else if (/(over|under|大小|ou)/.test(type)) {
      wtype = 'ROU';
      // 业界常规：Over→C, Under→H（不同站点可能不同，后续可按返回校验修正）
      if (/over|大/.test(opt)) chose_team = 'C';
      else if (/under|小/.test(opt)) chose_team = 'H';
    }

    return { wtype, chose_team, line };
  }
}

// 单例
let instance: CrownAutomationService | null = null;

export function getCrownAutomation(): CrownAutomationService {
  if (!instance) {
    instance = new CrownAutomationService();
  }
  return instance;
}
