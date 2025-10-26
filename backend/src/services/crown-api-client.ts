import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getCrownSiteManager } from './crown-site-manager';

interface LoginResponse {
  success: boolean;
  uid?: string;
  mid?: string;
  username?: string;
  msg?: string;
  message?: string;
  error?: string;
}

interface MatchesResponse {
  success: boolean;
  xml?: string;
  matches?: any[];
  error?: string;
}

interface OddsResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface BetResponse {
  success: boolean;
  message?: string;
  betId?: string;
  odds?: number;
  error?: string;
}

export class CrownApiClient {
  private axiosInstance: AxiosInstance;
  private baseUrl: string;
  private version: string = '2025-10-16-fix342_120';
  private uid?: string;
  private mid?: string;
  private username?: string;
  private password?: string;
  private loginDomain?: string; // 登录返回建议的 domain（可能为 IP）

  // Cookie 管理
  private cookies: string[] = [];

  // 余额缓存
  private balanceCache: {
    balance: number | null;
    credit: number | null;
    timestamp: number;
  } | null = null;
  private balanceCacheDuration: number = 30000; // 30秒缓存

  // 主机选择优化
  private lastGoodHost?: string; // 最近一次成功的 transform 主机（包含协议）
  private blockedHosts: Map<string, number> = new Map(); // host -> 解封时间戳

  // 赔率缓存（key: gid|wtype|team）
  private oddsCache: Map<string, { ioratio?: string; ratio?: string; con?: string; ts: number }> = new Map();
  private oddsCacheTtlMs = 1500; // 1.5s 缓存

  // 代理配置
  private proxyAgent?: any;

  constructor(baseUrl?: string, proxyConfig?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    type?: string;
  }) {
    // 使用站点管理器获取当前可用站点
    const siteManager = getCrownSiteManager();
    const envBase = process.env.CROWN_BASE_URL;
    const finalBase = baseUrl || envBase || siteManager.getCurrentSite();
    this.baseUrl = finalBase;

    // 如果提供了代理配置，创建代理agent
    if (proxyConfig) {
      // 根据代理类型选择协议前缀
      const protocol = proxyConfig.type?.toUpperCase() === 'SOCKS5' ? 'socks5' : 'http';
      const proxyUrl = proxyConfig.username && proxyConfig.password
        ? `${protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
        : `${protocol}://${proxyConfig.host}:${proxyConfig.port}`;
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      console.log(`🔒 [代理] 使用${proxyConfig.type || 'HTTP'}代理: ${proxyConfig.host}:${proxyConfig.port}`);
    }

    this.axiosInstance = axios.create({
      baseURL: finalBase,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': finalBase,
        'Referer': `${finalBase}/`,
      },
      // 如果有代理，设置代理agent
      ...(this.proxyAgent ? { httpsAgent: this.proxyAgent, httpAgent: this.proxyAgent } : {}),
    });

    // 添加响应拦截器来保存 Cookie
    this.axiosInstance.interceptors.response.use((response) => {
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        setCookieHeaders.forEach((cookie: string) => {
          const cookieName = cookie.split('=')[0];
          // 移除旧的同名 Cookie
          this.cookies = this.cookies.filter(c => !c.startsWith(cookieName + '='));
          // 添加新 Cookie
          this.cookies.push(cookie.split(';')[0]);
        });
      }
      return response;
    });

    // 添加请求拦截器来发送 Cookie
    this.axiosInstance.interceptors.request.use((config) => {
      if (this.cookies.length > 0) {
        config.headers['Cookie'] = this.cookies.join('; ');
      }
      return config;
    });
  }

  /**
   * 生成 BlackBox 字符串（简化版）
   */
  private generateBlackBox(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const data = `${timestamp}_${random}`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * 生成 UserAgent Base64
   */
  private generateUserAgentBase64(): string {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    return Buffer.from(ua).toString('base64');
  }

  /**
   * 登录接口
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    const siteManager = getCrownSiteManager();
    const startTime = Date.now();

    try {
      this.username = username;
      this.password = password;

      const params = new URLSearchParams({
        p: 'chk_login',
        langx: 'zh-cn',
        ver: this.version,
        username: username,
        password: password,
        app: 'N',
        auto: 'CFHFID',
        blackbox: this.generateBlackBox(),
        userAgent: this.generateUserAgentBase64(),
      });

      console.log(`🔐 [API] 登录账号: ${username} (站点: ${this.baseUrl})`);
      const loginUrl = `/transform.php?ver=${this.version}`;
      const response = await this.axiosInstance.post(loginUrl, params.toString());
      const data = response.data;

      // 调试：打印部分原始响应
      try {
        const preview = typeof data === 'string' ? data.substring(0, 1500) : JSON.stringify(data).substring(0, 1500);
        console.log(`🔎 [API] 登录响应片段: ${preview}`);
      } catch {}

      // 解析响应
      if (typeof data === 'string') {
        // 可能是 XML 格式，需要解析
        const uidMatch = data.match(/<uid>(.*?)<\/uid>/);
        const midMatch = data.match(/<mid>(.*?)<\/mid>/);
        const msgMatch = data.match(/<msg>(.*?)<\/msg>/);
        const usernameMatch = data.match(/<username>(.*?)<\/username>/);
        const domainMatch = data.match(/<domain>(.*?)<\/domain>/);

        const msg = msgMatch ? msgMatch[1] : '';

        // msg=100 或 109 表示登录成功
        if (msg === '100' || msg === '109') {
          this.uid = uidMatch ? uidMatch[1] : undefined;
          this.mid = midMatch ? midMatch[1] : undefined;
          this.loginDomain = domainMatch ? domainMatch[1] : undefined;

          // 报告成功
          const responseTime = Date.now() - startTime;
          siteManager.reportSuccess(this.baseUrl, responseTime);

          console.log(`✅ [API] 登录成功: uid=${this.uid}, mid=${this.mid}${this.loginDomain ? ", domain=" + this.loginDomain : ''}`);
          return {
            success: true,
            uid: this.uid,
            mid: this.mid,
            username: usernameMatch ? usernameMatch[1] : username,
            msg,
          };
        } else {
          console.error(`❌ [API] 登录失败: msg=${msg}`);
          // 登录失败不算站点故障
          return {
            success: false,
            error: `登录失败: ${msg}`,
            msg,
          };
        }
      }

      return {
        success: false,
        error: '登录响应格式错误',
      };
    } catch (error: any) {
      console.error('❌ [API] 登录异常:', error.message);

      // 报告站点失败
      siteManager.reportFailure(this.baseUrl);

      return {
        success: false,
        error: error.message || '登录请求失败',
      };
    }
  }

  /**
   * 获取赛事列表
   */
  async getMatches(params: {
    gtype?: string;
    showtype?: string;
    rtype?: string;
    ltype?: string;
    sorttype?: string;
  } = {}): Promise<MatchesResponse> {
    if (!this.uid) {
      return { success: false, error: '未登录' };
    }

    try {
      const requestParams = new URLSearchParams({
        p: 'get_game_list',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        p3type: '',
        date: '',
        gtype: params.gtype || 'ft',
        showtype: params.showtype || 'live',
        rtype: params.rtype || 'rb',
        ltype: params.ltype || '3',
        filter: '',
        cupFantasy: 'N',
        sorttype: params.sorttype || 'L',
        specialClick: '',
        isFantasy: 'N',
        ts: Date.now().toString(),
      });

      console.log(`📡 [API] 获取赛事列表: ${params.showtype || 'live'}`);

      // 构建候选主机列表：优先 lastGoodHost → 登录返回域 → baseUrl
      const hostCandidatesRaw: string[] = [];
      const pushHost = (h?: string) => {
        if (!h) return;
        if (h.startsWith('http')) hostCandidatesRaw.push(h);
        else {
          hostCandidatesRaw.push(`https://${h}`);
          hostCandidatesRaw.push(`http://${h}`);
        }
      };
      if (this.lastGoodHost) pushHost(this.lastGoodHost);
      pushHost(this.loginDomain);
      pushHost(this.baseUrl);
      // 去重
      const seen = new Set<string>();
      const hostCandidates = hostCandidatesRaw.filter(h => {
        if (seen.has(h)) return false;
        seen.add(h);
        return true;
      });

      // 把实际请求封装成函数，便于失败后重试（例如 doubleLogin）
      const tryFetch = async (): Promise<{ ok: boolean; xml?: string; err?: string; doubleLogin?: boolean }> => {
        let lastError: string | undefined;
        for (const host of hostCandidates) {
          // 跳过处于熔断期的主机
          const blockedUntil = this.blockedHosts.get(host) || 0;
          if (blockedUntil > Date.now()) {
            console.log(`🚫 [API] 跳过已熔断主机 ${host}，剩余 ${(blockedUntil - Date.now()) / 1000 | 0}s`);
            continue;
          }

          const url = `${host}/transform.php?ver=${this.version}`;
          try {
            const hostname = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
            const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
            const isHttps = url.startsWith('https://');
            const httpsAgent = isHttps && isIp ? new (require('https').Agent)({ rejectUnauthorized: false }) : undefined;
            const timeout = isIp ? 8000 : 30000; // 首次对 IP 节点使用更短超时

            const response = await this.axiosInstance.post(url, requestParams.toString(), {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': '*/*',
                'Origin': host,
                'Referer': `${host}/app/member/index.php?uid=${this.uid}&langx=zh-cn`,
              },
              httpsAgent,
              timeout,
              validateStatus: () => true,
            });

            const status = response.status;
            const xml = response.data;
            if (status >= 200 && status < 300 && typeof xml === 'string' && xml.length > 0) {
              if (/doubleLogin/i.test(xml)) {
                console.warn(`⚠️  [API] get_game_list 返回 doubleLogin，可能需要重新登录 (${host})`);
                return { ok: false, err: 'doubleLogin', doubleLogin: true };
              }
              console.log(`✅ [API] 获取赛事成功(${host}): XML长度=${xml.length}`);
              this.lastGoodHost = host; // 记住成功主机
              this.blockedHosts.delete(host); // 成功则解除可能的熔断
              return { ok: true, xml };
            }

            const preview = typeof xml === 'string' ? xml.substring(0, 200) : '[non-text]';
            console.log(`ℹ️  [API] 赛事接口 ${url} 返回状态=${status} 预览: ${preview}`);
            lastError = `status=${status}`;
          } catch (e: any) {
            const msg = e?.message || '';
            console.log(`⚠️  [API] 赛事接口尝试失败(${host}): ${msg}`);
            lastError = msg || 'request_failed';
            // 遇到典型网络问题，对 IP 主机短暂熔断 3 分钟
            if (/ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
              this.blockedHosts.set(host, Date.now() + 3 * 60 * 1000);
            }
            continue;
          }
        }
        return { ok: false, err: lastError || 'empty' };
      };

      // 第一次尝试
      let rs = await tryFetch();
      if (rs.ok) return { success: true, xml: rs.xml! };

      // 如遇 doubleLogin，尝试重新登录一次后再重试
      if (rs.doubleLogin && this.username && this.password) {
        try {
          console.log('🔄 [API] 检测到 doubleLogin，准备自动重新登录...');
          // 清空旧 cookie 后再登录
          this.cookies = [];
          const relog = await this.login(this.username, this.password);
          if (relog.success) {
            console.log('✅ [API] 重新登录成功，重试获取赛事...');
            rs = await tryFetch();
            if (rs.ok) return { success: true, xml: rs.xml! };
          } else {
            console.error('❌ [API] 重新登录失败:', relog.message);
          }
        } catch (e: any) {
          console.error('❌ [API] 重新登录异常:', e?.message || e);
        }
      }

      return { success: false, error: rs.err || '赛事数据为空' };
    } catch (error: any) {
      console.error('❌ [API] 获取赛事异常:', error.message);
      return {
        success: false,
        error: error.message || '获取赛事失败',
      };
    }
  }

  /**
   * 获取最新赔率
   */
  async getOdds(params: {
    gid: string;
    gtype?: string;
    wtype?: string;
    chose_team?: string;
  }): Promise<OddsResponse> {
    if (!this.uid) {
      return { success: false, error: '未登录' };
    }

    const keyParts = [
      params.gid,
      params.wtype || 'RM',
      params.chose_team || 'C',
    ];
    const cacheKey = keyParts.join('|');
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.oddsCacheTtlMs) {
      return {
        success: true,
        data: {
          cached: true,
          ioratio: cached.ioratio,
          ratio: cached.ratio,
          con: cached.con,
        },
      };
    }

    try {
      const requestParams = new URLSearchParams({
        p: 'FT_order_view',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        odd_f_type: 'H',
        gid: params.gid,
        gtype: params.gtype || 'FT',
        wtype: params.wtype || 'RM',
        chose_team: params.chose_team || 'C',
      });

      const response = await this.axiosInstance.post('/transform.php', requestParams.toString());
      const payload = response.data;
      // 预解析一次，便于缓存必要字段
      let raw = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
      const pick = (re: RegExp) => {
        const m = raw.match(re);
        return m && m[1] ? m[1] : undefined;
      };
      const cacheEntry = {
        ioratio: pick(/ioratio["'=:\s>]*([0-9.]+)/i),
        ratio: pick(/ratio["'=:\s>]*([-0-9.]+)/i),
        con: pick(/con["'=:\s>]*([-0-9./]+)/i),
        ts: Date.now(),
      };
      this.oddsCache.set(cacheKey, cacheEntry);
      return {
        success: true,
        data: payload,
      };
    } catch (error: any) {
      console.error('❌ [API] 获取赔率异常:', error.message);
      return {
        success: false,
        error: error.message || '获取赔率失败',
      };
    }
  }

  /**
   * 获取余额和信用额度
   *
   * 通过访问主页并解析 HTML 中的 JavaScript 变量获取余额信息
   * 余额信息存储在 _CHDomain.maxcredit 变量中
   *
   * 使用缓存机制，30秒内不会重复请求
   */
  async getBalance(forceRefresh: boolean = false): Promise<{
    success: boolean;
    balance: number | null;
    credit: number | null;
    error?: string;
  }> {
    if (!this.uid) {
      return { success: false, balance: null, credit: null, error: '未登录' };
    }

    // 检查缓存
    const now = Date.now();
    if (!forceRefresh && this.balanceCache && (now - this.balanceCache.timestamp) < this.balanceCacheDuration) {
      console.log(`📦 [API] 使用缓存的余额: ${this.balanceCache.balance}`);
      return {
        success: true,
        balance: this.balanceCache.balance,
        credit: this.balanceCache.credit,
      };
    }

    try {
      console.log(`📊 [API] 正在获取余额信息...`);

      // 优先尝试 transform.php: p=get_member_data（更稳定）
      try {
        const req = new URLSearchParams({
          p: 'get_member_data',
          uid: this.uid as string,
          ver: this.version,
          langx: 'zh-cn',
          change: 'all',
        });
        const resp = await this.axiosInstance.post('/transform.php', req.toString(), { validateStatus: () => true });
        const xml = resp.data;
        if (typeof xml === 'string' && resp.status >= 200 && resp.status < 300) {
          // 检查是否是 doubleLogin 错误
          if (/doubleLogin/i.test(xml)) {
            console.warn(`⚠️  [API] 获取余额返回 doubleLogin，需要重新登录`);
            // 如果有用户名和密码，尝试重新登录
            if (this.username && this.password) {
              console.log(`🔄 [API] 自动重新登录后重试获取余额...`);
              const loginResult = await this.login(this.username, this.password);
              if (loginResult.success) {
                // 重新登录成功，递归调用获取余额（但不再强制刷新，避免无限循环）
                return await this.getBalance(false);
              } else {
                return { success: false, balance: null, credit: null, error: 'doubleLogin且重新登录失败' };
              }
            } else {
              return { success: false, balance: null, credit: null, error: 'doubleLogin' };
            }
          }

          // 粗略解析可能的余额字段（credit/nowcredit/cash/balance）
          const pickNumber = (re: RegExp): number | null => {
            const m = xml.match(re);
            if (m && m[1]) {
              const v = parseFloat(m[1].replace(/,/g, ''));
              return isNaN(v) ? null : v;
            }
            return null;
          };
          const credit = pickNumber(/<credit>([\d.,]+)<\/credit>/i)
                      ?? pickNumber(/<nowcredit>([\d.,]+)<\/nowcredit>/i)
                      ?? pickNumber(/<maxcredit>([\d.,]+)<\/maxcredit>/i);
          const cash = pickNumber(/<cash>([\d.,]+)<\/cash>/i)
                    ?? pickNumber(/<balance>([\d.,]+)<\/balance>/i);

          const effective = credit ?? cash;
          if (effective != null) {
            console.log(`✅ [API] 通过 transform 获取余额成功: ${effective}`);
            this.balanceCache = { balance: effective, credit: credit ?? null, timestamp: now };
            return { success: true, balance: effective, credit: credit ?? null };
          } else {
            const preview = xml.substring(0, 300);
            console.log(`ℹ️  [API] transform 未解析出余额，XML 片段: ${preview}`);
          }
        } else {
          console.log(`ℹ️  [API] transform 返回状态=${resp.status}`);
        }
      } catch (e: any) {
        console.log(`⚠️  [API] transform 尝试异常: ${e?.message}`);
      }

      // 访问会员中心页面获取 HTML（必须带 uid）
      const uid = this.uid as string;
      const mid = this.mid as string | undefined;

      // 1) 组合可用 host（优先使用登录返回的 domain）
      const hostCandidates: string[] = [];
      const pushHost = (h?: string) => {
        if (!h) return;
        if (h.startsWith('http')) {
          hostCandidates.push(h);
        } else {
          hostCandidates.push(`https://${h}`);
          hostCandidates.push(`http://${h}`);
        }
      };
      pushHost(this.baseUrl);
      pushHost(this.loginDomain);

      // 2) 路径 + 参数组合
      const paths = [
        '/app/member/index.php',
        '/app/member/FT_index.php',
        '/app/member/topMenu.php',
        '/app/member/leftMenu.php',
        '/index.php',
        '/',
      ];
      const queryCombos: Array<Record<string, string>> = [
        { uid, langx: 'zh-cn' },
        { uid, langx: 'zh-cn', ltype: '3', mtype: '3' },
        mid ? { uid, langx: 'zh-cn', mid } : undefined,
        mid ? { uid, langx: 'zh-cn', mid, ltype: '3', mtype: '3' } : undefined,
      ].filter(Boolean) as Array<Record<string, string>>;

      // 3) 构造候选 URL（绝对地址），逐一尝试
      const buildUrl = (host: string, path: string, params?: Record<string, string>) => {
        if (!params || Object.keys(params).length === 0) return `${host}${path}`;
        const usp = new URLSearchParams(params);
        return `${host}${path}?${usp.toString()}`;
      };

      let html = '';
      let foundPage = false;
      let candidateBaseHost = this.baseUrl;

      for (const host of hostCandidates) {
        for (const path of paths) {
          // 无参路径也尝试一次
          const absoluteList: string[] = [buildUrl(host, path)];
          // 携带不同的查询组合
          for (const q of queryCombos) absoluteList.push(buildUrl(host, path, q));

          for (const absoluteUrl of absoluteList) {
            try {
              console.log(`🔍 [API] 尝试访问: ${absoluteUrl}`);
              const hostname = (() => { try { return new URL(absoluteUrl).hostname; } catch { return ''; } })();
              const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
              const isHttps = absoluteUrl.startsWith('https://');
              const httpsAgent = isHttps && isIp ? new https.Agent({ rejectUnauthorized: false }) : undefined;

              const response = await this.axiosInstance.get(absoluteUrl, {
                headers: {
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Referer': `${host}/app/member/index.php?uid=${uid}&langx=zh-cn`,
                  'Upgrade-Insecure-Requests': '1',
                },
                httpsAgent,
                validateStatus: () => true,
              });
              const status = response.status;
              const body = response.data;

              if (status >= 200 && status < 300) {
                if (typeof body === 'string') {
                  html = body; // 仅在 2xx 时作为候选 HTML
                  candidateBaseHost = host;
                  if (body.includes('maxcredit')) {
                    console.log(`✅ [API] 在 ${absoluteUrl} 找到 maxcredit`);
                    foundPage = true;
                    break;
                  } else {
                    const preview = body.substring(0, 200);
                    console.log(`ℹ️  [API] 访问 ${absoluteUrl} 状态=200，未命中 maxcredit，HTML 片段: ${preview}`);
                  }
                } else {
                  console.log(`ℹ️  [API] 访问 ${absoluteUrl} 状态=200，但响应非文本`);
                }
              } else {
                const preview = typeof body === 'string' ? body.substring(0, 200) : '[non-text]';
                console.log(`ℹ️  [API] 访问 ${absoluteUrl} 返回状态=${status}，HTML 片段: ${preview}`);
              }
            } catch (err: any) {
              const status = err?.response?.status;
              const preview = typeof err?.response?.data === 'string' ? err.response.data.substring(0, 200) : '';
              console.log(`⚠️  [API] 访问 ${absoluteUrl} 异常 status=${status} message=${err?.message} 片段: ${preview}`);
            }
          }
          if (foundPage) break;
        }
        if (foundPage) break;
      }

      // 如果还没找到，则从 frames/script 中提取候选 src 再试试
      if (!foundPage && typeof html === 'string') {
        const candidateSrcs = new Set<string>();
        const frameRe = /<(?:frame|iframe|script)[^>]+src=['"]([^'\"]+)['"]/gi;
        let m: RegExpExecArray | null;
        while ((m = frameRe.exec(html)) !== null) {
          const src = m[1];
          if (!src) continue;
          // 过滤掉明显无关的资源
          if (src.endsWith('.js') && !/header|top|menu/i.test(src)) continue;
          if (/\.(png|jpg|gif|css|ico)(\?|$)/i.test(src)) continue;
          candidateSrcs.add(src);
        }

        // 仅取前 8 个候选，避免过多请求
        const toTry = Array.from(candidateSrcs).slice(0, 8);
        for (const raw of toTry) {
          // 规范化 URL，并补全为绝对地址
          let pathOrAbs = raw.startsWith('http') ? raw : (raw.startsWith('/') ? raw : `/${raw}`);
          let u = pathOrAbs.startsWith('http') ? pathOrAbs : `${candidateBaseHost}${pathOrAbs}`;
          // 补充 uid/mid/langx
          if (!/([?&])uid=/.test(u)) {
            u += (u.includes('?') ? `&uid=${uid}` : `?uid=${uid}`);
          }
          if (mid && !/[?&]mid=/.test(u)) {
            u += `&mid=${mid}`;
          }
          if (!/[?&]langx=/.test(u)) {
            u += `&langx=zh-cn`;
          }
          try {
            console.log(`🔍 [API] 尝试访问候选: ${u}`);
            const hostname2 = (() => { try { return new URL(u).hostname; } catch { return ''; } })();
            const isIp2 = /^\d+\.\d+\.\d+\.\d+$/.test(hostname2);
            const isHttps2 = u.startsWith('https://');
            const httpsAgent2 = isHttps2 && isIp2 ? new https.Agent({ rejectUnauthorized: false }) : undefined;

            const r2 = await this.axiosInstance.get(u, {
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': `${candidateBaseHost}/app/member/index.php?uid=${uid}&langx=zh-cn`,
                'Upgrade-Insecure-Requests': '1',
              },
              httpsAgent: httpsAgent2,
              validateStatus: () => true,
            });
            const status2 = r2.status;
            const html2 = r2.data;
            if (status2 >= 200 && status2 < 300 && typeof html2 === 'string' && html2.includes('maxcredit')) {
              html = html2;
              console.log(`✅ [API] 在候选 ${u} 找到 maxcredit`);
              foundPage = true;
              break;
            } else {
              const preview2 = typeof html2 === 'string' ? html2.substring(0, 200) : '[non-text]';
              console.log(`ℹ️  [API] 候选 ${u} 状态=${status2}，未命中 maxcredit，HTML 片段: ${preview2}`);
            }
          } catch (e: any) {
            const status2 = e?.response?.status;
            const preview2 = typeof e?.response?.data === 'string' ? e.response.data.substring(0, 200) : '';
            console.log(`⚠️  [API] 访问候选异常: ${u} status=${status2} message=${e?.message} 片段: ${preview2}`);
          }
        }
      }

      if (!foundPage) {
        console.log(`❌ [API] 未找到包含 maxcredit 的页面（已带 uid 尝试）`);
        return {
          success: true,
          balance: null,
          credit: null,
        };
      }

      if (typeof html !== 'string') {
        console.error('❌ [API] 主页响应不是字符串');
        return {
          success: false,
          balance: null,
          credit: null,
          error: '主页响应格式错误',
        };
      }

      // 调试：打印 HTML 的前 1000 个字符
      console.log(`🔍 [API] HTML 前 1000 字符:\n${html.substring(0, 1000)}`);

      // 检查是否包含 _CHDomain
      if (html.includes('_CHDomain')) {
        console.log(`✅ [API] HTML 包含 _CHDomain`);
      } else {
        console.log(`⚠️  [API] HTML 不包含 _CHDomain`);
      }

      // 检查是否包含 maxcredit
      if (html.includes('maxcredit')) {
        console.log(`✅ [API] HTML 包含 maxcredit`);
        // 打印包含 maxcredit 的行
        const lines = html.split('\n');
        const maxcreditLines = lines.filter(line => line.includes('maxcredit'));
        console.log(`🔍 [API] 包含 maxcredit 的行 (${maxcreditLines.length} 行):`);
        maxcreditLines.slice(0, 5).forEach(line => {
          console.log(`   ${line.trim()}`);
        });
      } else {
        console.log(`⚠️  [API] HTML 不包含 maxcredit`);
      }

      // 提取 _CHDomain.maxcredit
      // 格式: _CHDomain.maxcredit = '1,000.00';
      const maxcreditMatch = html.match(/_CHDomain\.maxcredit\s*=\s*'([^']+)'/);

      let balance: number | null = null;

      if (maxcreditMatch && maxcreditMatch[1]) {
        // 移除千位分隔符并转换为数字
        const balanceStr = maxcreditMatch[1].replace(/,/g, '');
        balance = parseFloat(balanceStr);

        if (isNaN(balance)) {
          console.error(`❌ [API] 余额解析失败: ${maxcreditMatch[1]}`);
          balance = null;
        } else {
          console.log(`✅ [API] 获取余额成功: ${balance}`);
        }
      } else {
        console.warn(`⚠️  [API] 未在主页中找到 maxcredit 字段`);
      }

      // 尝试提取其他可能的余额字段
      // 格式: top.maxcredit = '1,000.00';
      if (balance === null) {
        const topMaxcreditMatch = html.match(/top\.maxcredit\s*=\s*'([^']+)'/);
        if (topMaxcreditMatch && topMaxcreditMatch[1]) {
          const balanceStr = topMaxcreditMatch[1].replace(/,/g, '');
          balance = parseFloat(balanceStr);
          if (!isNaN(balance)) {
            console.log(`✅ [API] 从 top.maxcredit 获取余额: ${balance}`);
          }
        }
      }

      // 更新缓存
      this.balanceCache = {
        balance,
        credit: null,
        timestamp: now,
      };

      return {
        success: true,
        balance,
        credit: null, // 信用额度暂时不解析
      };
    } catch (error: any) {
      console.error('❌ [API] 获取余额异常:', error.message);
      return {
        success: false,
        balance: null,
        credit: null,
        error: error.message || '获取余额失败',
      };
    }
  }
  /**
   * 获取账户历史总览（按日期范围）
   * 返回每日的投注金额、有效金额、赢/输等数据
   */
  async getAccountHistory(params: {
    startDate?: string; // 格式: YYYY-MM-DD
    endDate?: string;   // 格式: YYYY-MM-DD
    sportType?: string; // 体育类型，默认为 '所有体育'
  } = {}): Promise<{
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
    if (!this.uid) {
      return { success: false, error: '未登录' };
    }

    try {
      // 设置默认日期范围（最近7天）
      const endDate = params.endDate || new Date().toISOString().split('T')[0];
      const startDate = params.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      console.log(`📡 [API] 请求账户历史: ${startDate} 至 ${endDate}`);

      // 使用正确的接口参数
      const requestParams = new URLSearchParams({
        p: 'get_history_data',
        uid: this.uid,
        ver: this.version,
        langx: 'zh-cn',
        gtype: params.sportType || 'ALL',
        isAll: 'N',
        startdate: startDate,
        enddate: endDate,
        filter: 'Y',
      });

      console.log(`📡 [API] 请求参数: ${requestParams.toString()}`);

      const response = await this.axiosInstance.post(`/transform.php?ver=${this.version}`, requestParams.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        console.error(`❌ [API] 获取账户历史失败: HTTP ${response.status}`);
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = response.data;
      const preview = typeof data === 'string' ? data.substring(0, 300) : JSON.stringify(data).substring(0, 300);
      console.log(`📡 [API] 响应数据类型: ${typeof data}, 预览: ${preview}`);

      // 检查是否是 doubleLogin 错误
      const isDoubleLogin = (typeof data === 'string' && data.includes('doubleLogin')) ||
                            (typeof data === 'object' && data && (data.error === 'doubleLogin' || data.msg === 'doubleLogin'));
      if (isDoubleLogin) {
        console.warn('⚠️  [API] 检测到 doubleLogin，尝试重新登录...');

        // 清空旧 Cookie，避免会话冲突
        this.cookies = [];

        // 尝试重新登录
        if (this.username && this.password) {
          try {
            const loginResult = await this.login(this.username, this.password);
            if (loginResult.success) {
              console.log('✅ [API] 重新登录成功，重试获取账户历史...');

              // 使用新的 UID 重建请求参数后重试
              const retryParams = new URLSearchParams({
                p: 'get_history_data',
                uid: this.uid as string,
                ver: this.version,
                langx: 'zh-cn',
                gtype: params.sportType || 'ALL',
                isAll: 'N',
                startdate: startDate,
                enddate: endDate,
                filter: 'Y',
              });

              const retryResponse = await this.axiosInstance.post(`/transform.php?ver=${this.version}`, retryParams.toString(), {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                validateStatus: () => true,
              });

              if (retryResponse.status === 200) {
                const retryData = retryResponse.data;
                if (typeof retryData === 'string') {
                  console.log(`📡 [API] 重试响应片段: ${retryData.substring(0, 300)}`);
                }

                // 继续处理重试后的数据
                return this.parseHistoryResponse(retryData);
              }
            }
          } catch (error: any) {
            console.error(`❌ [API] 重新登录失败: ${error.message}`);
          }
        }

        return { success: false, error: 'doubleLogin - 需要重新登录' };
      }

      // 解析响应数据（若为空则做兜底重试几种常见入口）
      let parsed = this.parseHistoryResponse(data);
      if (parsed.success && Array.isArray(parsed.data) && parsed.data.length === 0) {
        console.warn('⚠️  [API] get_history_data 无数据，先做 keepalive 再重试...');

        // 先做一次 keepalive（与抓包一致）：get_systemTime -> service_mainget
        try {
          const sysParams = new URLSearchParams({ p: 'get_systemTime', ver: this.version, uid: this.uid as string, langx: 'zh-cn' });
          await this.axiosInstance.post(`/transform.php?ver=${this.version}`, sysParams.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
          const mainParams = new URLSearchParams({ p: 'service_mainget', ver: this.version, langx: 'zh-cn', uid: this.uid as string, login: 'Y' });
          await this.axiosInstance.post(`/transform.php?ver=${this.version}`, mainParams.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
        } catch {}

        // keepalive 后，主请求再重试一次
        try {
          const re = await this.axiosInstance.post(`/transform.php?ver=${this.version}`, requestParams.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
          if (re.status === 200) {
            const reParsed = this.parseHistoryResponse(re.data);
            if (reParsed.success && reParsed.data && reParsed.data.length > 0) {
              console.log('✅ [API] keepalive 后主请求命中数据');
              return reParsed;
            }
          }
        } catch {}

        console.warn('⚠️  [API] keepalive 后仍无数据，尝试兜底接口...');

        const tryFallback = async (paramsObj: Record<string, string>) => {
          const p = new URLSearchParams(paramsObj);
          const resp = await this.axiosInstance.post(`/transform.php?ver=${this.version}`, p.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true,
          });
          if (resp.status === 200) {
            const preview = typeof resp.data === 'string' ? resp.data.slice(0, 300) : JSON.stringify(resp.data).slice(0, 300);
            console.log(`📡 [API] 兜底响应片段: ${preview}`);
            return this.parseHistoryResponse(resp.data);
          }
          return { success: false, error: `fallback http ${resp.status}` } as any;
        };

        // Fallback A: p=history_data（与你抓包一致，不带日期）
        const fbA = await tryFallback({ p: 'history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn' });
        if (fbA.success && fbA.data && fbA.data.length > 0) return fbA;

        // Fallback B: p=get_history_data 但不带日期（让平台取默认范围）
        const fbB = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', gtype: params.sportType || 'ALL', isAll: 'N', startdate: '', enddate: '', filter: 'Y' });
        if (fbB.success && fbB.data && fbB.data.length > 0) return fbB;

        // Fallback C: 强制 JSON 返回（部分站点需要）
        const fbC = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', gtype: params.sportType || 'ALL', isAll: 'N', startdate: startDate, enddate: endDate, filter: 'Y', format: 'json' });
        if (fbC.success && fbC.data && fbC.data.length > 0) return fbC;

        // Fallback D: 改用 isAll=Y（含更多类型）且不带 gtype
        const fbD = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', isAll: 'Y', startdate: '', enddate: '', filter: 'Y' });
        if (fbD.success && fbD.data && fbD.data.length > 0) return fbD;

        // Fallback E: get_history_data 无 gtype，使用明确日期
        const fbE = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', isAll: 'N', startdate: startDate, enddate: endDate, filter: 'Y' });
        if (fbE.success && fbE.data && fbE.data.length > 0) return fbE;


        // Fallback F: 指定日内时间范围 00:00:00 ~ 23:59:59（部分站点要求带时间）
        const fbF = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', gtype: params.sportType || 'ALL', isAll: 'N', startdate: `${startDate} 00:00:00`, enddate: `${endDate} 23:59:59`, filter: 'Y' });
        if (fbF.success && fbF.data && fbF.data.length > 0) return fbF;

        // Fallback G: 指定时间范围 + filter=N（不过滤）
        const fbG = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', gtype: params.sportType || 'ALL', isAll: 'N', startdate: `${startDate} 00:00:00`, enddate: `${endDate} 23:59:59`, filter: 'N' });
        if (fbG.success && fbG.data && fbG.data.length > 0) return fbG;

        // Fallback H: 去掉 gtype，用 isAll=Y + 指定时间范围
        const fbH = await tryFallback({ p: 'get_history_data', uid: this.uid as string, ver: this.version, langx: 'zh-cn', isAll: 'Y', startdate: `${startDate} 00:00:00`, enddate: `${endDate} 23:59:59`, filter: 'N' });
        if (fbH.success && fbH.data && fbH.data.length > 0) return fbH;

        console.warn('⚠️  [API] 兜底接口仍无数据，返回空');
      }

      return parsed;
    } catch (error: any) {
      console.error('❌ [API] 获取账户历史异常:', error.message);
      return {
        success: false,
        error: error.message || '获取账户历史失败',
      };
    }
  }

  /**
   * 统一解析历史响应数据
   */
  private parseHistoryResponse(data: any): {
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
  } {
    // 尝试解析JSON
    if (typeof data === 'object' || (typeof data === 'string' && data.trim().startsWith('{'))) {
      try {
        const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
        console.log(`📡 [API] 解析JSON成功, 键: ${Object.keys(jsonData).join(', ')}`);

        const historyData = this.parseAccountHistoryJson(jsonData);
        if (historyData.length > 0) {
          const total = historyData.reduce(
            (acc, item) => ({
              betAmount: acc.betAmount + item.betAmount,
              validAmount: acc.validAmount + item.validAmount,
              winLoss: acc.winLoss + item.winLoss,
            }),
            { betAmount: 0, validAmount: 0, winLoss: 0 }
          );

          console.log(`✅ [API] 获取账户历史成功: ${historyData.length} 条记录`);

          return {
            success: true,
            data: historyData,
            total,
          };
        }
      } catch (error: any) {
        console.warn(`⚠️  [API] 解析JSON失败: ${error.message}`);
      }
    }

    // 尝试解析XML（仅字符串时）
    if (typeof data === 'string' && data.includes('<?xml')) {
      // 检查是否有错误
      if (data.includes('<code>error</code>')) {
        const msgMatch = data.match(/<msg>([^<]+)<\/msg>/);
        const errorMsg = msgMatch ? msgMatch[1] : '未知错误';
        console.error(`❌ [API] 获取账户历史失败: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      // 尝试解析历史数据
      const historyData = this.parseAccountHistoryXml(data);
      if (historyData.length > 0) {
        const total = historyData.reduce(
          (acc, item) => ({
            betAmount: acc.betAmount + item.betAmount,
            validAmount: acc.validAmount + item.validAmount,
            winLoss: acc.winLoss + item.winLoss,
          }),
          { betAmount: 0, validAmount: 0, winLoss: 0 }
        );

        console.log(`✅ [API] 获取账户历史成功: ${historyData.length} 条记录`);

        return {
          success: true,
          data: historyData,
          total,
        };
      }
    }

    // 尝试解析HTML（仅字符串时）
    if (typeof data === 'string' && (data.includes('<html') || data.includes('<table'))) {
      let historyData = this.parseAccountHistoryHtml(data);
      if (historyData.length === 0) {
        // 若简单解析无结果，尝试通用表格解析
        historyData = this.parseAccountHistoryHtmlGeneric(data);
      }
      if (historyData.length > 0) {
        const total = historyData.reduce(
          (acc, item) => ({
            betAmount: acc.betAmount + item.betAmount,
            validAmount: acc.validAmount + item.validAmount,
            winLoss: acc.winLoss + item.winLoss,
          }),
          { betAmount: 0, validAmount: 0, winLoss: 0 }
        );

        console.log(`✅ [API] 获取账户历史成功: ${historyData.length} 条记录`);

        return {
          success: true,
          data: historyData,
          total,
        };
      }
    }

    // 无法解析数据，返回空数据
    console.warn('⚠️  [API] 无法解析账户历史数据，返回空数据');
    return {
      success: true,
      data: [],
      total: { betAmount: 0, validAmount: 0, winLoss: 0 },
    };
  }

  /**
   * 解析账户历史JSON数据
   */
  private parseAccountHistoryJson(json: any): Array<{
    date: string;
    dayOfWeek: string;
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }> {
    const historyData: Array<{
      date: string;
      dayOfWeek: string;
      betAmount: number;
      validAmount: number;
      winLoss: number;
    }> = [];

    try {
      // 尝试多种可能的JSON结构
      let items: any[] = [];

      const pickArray = (obj: any): any[] | null => {
        if (!obj) return null;
        if (Array.isArray(obj)) return obj;
        // 常见包裹
        if (obj.data && Array.isArray(obj.data)) return obj.data;
        if (obj.data && obj.data.list && Array.isArray(obj.data.list)) return obj.data.list;
        if (obj.data && obj.data.rows && Array.isArray(obj.data.rows)) return obj.data.rows;
        if (obj.data && obj.data.data && Array.isArray(obj.data.data)) return obj.data.data;
        if (obj.list && Array.isArray(obj.list)) return obj.list;
        if (obj.items && Array.isArray(obj.items)) return obj.items;
        if (obj.rows && Array.isArray(obj.rows)) return obj.rows;
        // 其他命名
        if (obj.history && Array.isArray(obj.history)) return obj.history;
        if (obj.history_data && Array.isArray(obj.history_data)) return obj.history_data;
        if (obj.historyList && Array.isArray(obj.historyList)) return obj.historyList;
        if (obj.records && Array.isArray(obj.records)) return obj.records;
        return null;
      };

      items = (
        pickArray(json) ||
        pickArray(json?.result) ||
        pickArray(json?.payload) ||
        pickArray(json?.response) ||
        pickArray(json?.content) ||
        []
      );

      // 若未找到数组，尝试将对象字典结构转换为数组（如 {"2025-10-24": {tz:.., yx:..}, ...}）
      const toArrayFromDict = (obj: any): any[] => {
        if (!obj || Array.isArray(obj) || typeof obj !== 'object') return [];
        const arr: any[] = [];
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v === 'object') {
            const vv: any = { ...(v as any) };
            // 若内部没有日期字段，则把键作为日期
            if (!('date' in vv) && !('Date' in vv) && !('day' in vv) && !('stat_date' in vv)) {
              vv.date = k;
            }
            arr.push(vv);
          }
        }
        return arr;
      };

      if (items.length === 0) {
        items = (
          toArrayFromDict(json?.data?.list) ||
          toArrayFromDict(json?.data?.rows) ||
          toArrayFromDict(json?.list) ||
          toArrayFromDict(json?.rows) ||
          toArrayFromDict(json?.history) ||
          toArrayFromDict(json?.history_data) ||
          toArrayFromDict(json?.records) ||
          toArrayFromDict(json?.payload) ||
          toArrayFromDict(json?.result) ||
          toArrayFromDict(json?.response) ||
          toArrayFromDict(json?.content) ||
          []
        );
      }

      console.log(`📡 [API] 找到 ${items.length} 条历史记录`);

      const toNumber = (v: any): number => {
        if (typeof v === 'number') return v;
        if (v == null) return 0;
        const s = String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      };

      for (const item of items) {
        // 尝试提取日期
        const date = item.date || item.Date || item.DATE || item.day || item.Day || item.stat_date || '';
        // 尝试提取星期
        const dayOfWeek = item.dayOfWeek || item.day_of_week || item.weekday || item.week || item.week_cn || '';
        // 尝试提取投注金额
        const betAmount = toNumber(
          item.betAmount || item.bet_amount || item.bet || item.gold || item.Gold || item.total_bet ||
          item.betAmt || item.betamt || item.tz || item.bet_total
        );
        // 尝试提取有效金额
        const validAmount = toNumber(
          item.validAmount || item.valid_amount || item.valid || item.validGold || item.effective_bet ||
          item.validAmt || item.validamt || item.yx || item.valid_total
        );
        // 尝试提取赢/输
        const winLoss = toNumber(
          item.winLoss || item.win_loss || item.result || item.profit || item.win || item.winlose || item.net_win ||
          item.net || item.winLose || item.yl
        );

        if (date) {
          historyData.push({
            date,
            dayOfWeek,
            betAmount,
            validAmount,
            winLoss,
          });
        }
      }

      console.log(`📡 [API] 成功解析 ${historyData.length} 条历史记录`);
    } catch (error: any) {
      console.error(`❌ [API] 解析JSON历史数据异常: ${error.message}`);
    }

    return historyData;
  }

  /**
   * 解析账户历史XML数据
   */
  private parseAccountHistoryXml(xml: string): Array<{
    date: string;
    dayOfWeek: string;
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }> {
    const historyData: Array<{
      date: string;
      dayOfWeek: string;
      betAmount: number;
      validAmount: number;
      winLoss: number;
    }> = [];

    try {
      // 尝试匹配 <history>...</history> 块（皇冠API格式）
      const historyPattern = /<history>(.*?)<\/history>/gs;
      let historyMatch;
      let totalBlocks = 0;
      let validBlocks = 0;

      while ((historyMatch = historyPattern.exec(xml)) !== null) {
        totalBlocks++;
        const historyContent = historyMatch[1];

        // 提取日期
        const dateMatch = historyContent.match(/<date>([^<]+)<\/date>/);
        // 提取日期名称（包含星期）
        const dateNameMatch = historyContent.match(/<date_name>([^<]+)<\/date_name>/);
        // 提取投注金额 (gold)
        const goldMatch = historyContent.match(/<gold>([^<]+)<\/gold>/);
        // 提取有效金额 (vgold)
        const vgoldMatch = historyContent.match(/<vgold>([^<]+)<\/vgold>/);
        // 提取赢/输 (winloss)
        const winlossMatch = historyContent.match(/<winloss>([^<]+)<\/winloss>/);

        if (dateMatch) {
          const date = dateMatch[1];
          const gold = goldMatch ? goldMatch[1].trim() : '-';
          const vgold = vgoldMatch ? vgoldMatch[1].trim() : '-';
          const winloss = winlossMatch ? winlossMatch[1].trim() : '-';

          // 只有当金额不是 '-' 时才添加记录
          if (gold !== '-' && vgold !== '-' && winloss !== '-') {
            validBlocks++;

            // 提取星期几
            let dayOfWeek = '';
            if (dateNameMatch) {
              const dayMatch = dateNameMatch[1].match(/星期(.)/);
              dayOfWeek = dayMatch ? dayMatch[1] : '';
            }

            // 解析金额（移除逗号）
            const betAmount = parseFloat(gold.replace(/,/g, '')) || 0;
            const validAmount = parseFloat(vgold.replace(/,/g, '')) || 0;
            const winLoss = parseFloat(winloss.replace(/,/g, '')) || 0;

            historyData.push({
              date,
              dayOfWeek,
              betAmount,
              validAmount,
              winLoss,
            });
          }
        }
      }

      if (totalBlocks > 0) {
        console.log(`📊 [API] XML解析: 找到 ${totalBlocks} 个日期块，其中 ${validBlocks} 个有投注数据`);
      }

      // 如果没有找到 <history> 标签，尝试旧格式 <item> 标签
      if (totalBlocks === 0) {
        const itemPattern = /<item[^>]*>(.*?)<\/item>/gs;
        let itemMatch;

        while ((itemMatch = itemPattern.exec(xml)) !== null) {
          const itemContent = itemMatch[1];

          const dateMatch = itemContent.match(/<date>([^<]+)<\/date>/);
          const dayMatch = itemContent.match(/<day>([^<]+)<\/day>/);
          const betMatch = itemContent.match(/<bet_amount>([^<]+)<\/bet_amount>/);
          const validMatch = itemContent.match(/<valid_amount>([^<]+)<\/valid_amount>/);
          const winLossMatch = itemContent.match(/<win_loss>([^<]+)<\/win_loss>/);

          if (dateMatch && betMatch && validMatch && winLossMatch) {
            historyData.push({
              date: dateMatch[1],
              dayOfWeek: dayMatch ? dayMatch[1] : '',
              betAmount: parseFloat(betMatch[1]) || 0,
              validAmount: parseFloat(validMatch[1]) || 0,
              winLoss: parseFloat(winLossMatch[1]) || 0,
            });
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ [API] XML解析异常: ${error.message}`);
    }

    return historyData;
  }

  /**
   * 解析账户历史HTML数据
   */
  private parseAccountHistoryHtml(html: string): Array<{
    date: string;
    dayOfWeek: string;
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }> {
    const historyData: Array<{
      date: string;
      dayOfWeek: string;
      betAmount: number;
      validAmount: number;
      winLoss: number;
    }> = [];

    // 使用正则表达式提取表格数据
    // 匹配日期行和数据行
    const datePattern = /(\d{1,2})月(\d{1,2})日[^<]*星期([一二三四五六日])/g;
    const dataPattern = /<td[^>]*>(-?\d+(?:\.\d+)?)<\/td>/g;

    let dateMatch;
    const dates: Array<{ month: number; day: number; dayOfWeek: string }> = [];

    while ((dateMatch = datePattern.exec(html)) !== null) {
      dates.push({
        month: parseInt(dateMatch[1]),
        day: parseInt(dateMatch[2]),
        dayOfWeek: dateMatch[3],
      });
    }

    // 提取所有数字数据
    const allNumbers: number[] = [];
    let dataMatch;
    while ((dataMatch = dataPattern.exec(html)) !== null) {
      const num = parseFloat(dataMatch[1]);
      if (!isNaN(num)) {
        allNumbers.push(num);
      }
    }

    // 每个日期对应3个数字：投注金额、有效金额、赢/输
    for (let i = 0; i < dates.length && i * 3 + 2 < allNumbers.length; i++) {
      const dateInfo = dates[i];
      const year = new Date().getFullYear();
      const dateStr = `${year}-${String(dateInfo.month).padStart(2, '0')}-${String(dateInfo.day).padStart(2, '0')}`;

      historyData.push({
        date: dateStr,
        dayOfWeek: dateInfo.dayOfWeek,
        betAmount: allNumbers[i * 3],
        validAmount: allNumbers[i * 3 + 1],
        winLoss: allNumbers[i * 3 + 2],
      });
    }

    return historyData;
  }

  /**
   * 通用 HTML 表格解析：按表头“日期/投注/有效/输赢(结果)”定位列
   */
  private parseAccountHistoryHtmlGeneric(html: string): Array<{
    date: string;
    dayOfWeek: string;
    betAmount: number;
    validAmount: number;
    winLoss: number;
  }> {
    const out: Array<{ date: string; dayOfWeek: string; betAmount: number; validAmount: number; winLoss: number }> = [];

    const clean = (s: string) => s
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const toNumber = (v: string): number => {
      const s = (v || '').replace(/,/g, '').replace(/[^0-9.\-]/g, '');
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    const toDateStr = (s: string): string => {
      s = s.trim();
      const ymd = s.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (ymd) return `${ymd[1]}-${String(+ymd[2]).padStart(2, '0')}-${String(+ymd[3]).padStart(2, '0')}`;
      const mdCn = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (mdCn) {
        const y = new Date().getFullYear();
        return `${y}-${String(+mdCn[1]).padStart(2, '0')}-${String(+mdCn[2]).padStart(2, '0')}`;
      }
      const md = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (md) {
        const y = md[3] ? (md[3].length === 2 ? 2000 + +md[3] : +md[3]) : new Date().getFullYear();
        return `${y}-${String(+md[1]).padStart(2, '0')}-${String(+md[2]).padStart(2, '0')}`;
      }
      return '';
    };

    const dow = (dateStr: string): string => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const map = ['日', '一', '二', '三', '四', '五', '六'];
      return isNaN(d.getTime()) ? '' : map[d.getDay()];
    };

    // 逐个表解析
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tableRegex.exec(html)) !== null) {
      const table = tMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rMatch: RegExpExecArray | null;
      let headers: string[] = [];
      let indices = { date: -1, bet: -1, valid: -1, win: -1 };
      const rows: string[][] = [];

      while ((rMatch = rowRegex.exec(table)) !== null) {
        const rowHtml = rMatch[1];
        const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
        let cMatch: RegExpExecArray | null;
        const cells: string[] = [];
        while ((cMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(clean(cMatch[1]));
        }
        if (cells.length === 0) continue;
        if (!headers.length && /th/i.test(rowHtml) || (cells.some(c => /日期|投注|有效|输赢|结果/i.test(c)))) {
          headers = cells;
          const findIdx = (kw: RegExp) => headers.findIndex(h => kw.test(h));
          indices.date = findIdx(/日期|date/i);
          indices.bet = findIdx(/投注|下注|bet/i);
          indices.valid = findIdx(/有效|有效金额|effective/i);
          indices.win = findIdx(/输赢|结果|赢|win|profit|净赢/i);
          continue;
        }
        rows.push(cells);
      }

      if (headers.length === 0) continue;

      for (const cells of rows) {
        const dateText = indices.date >= 0 ? cells[indices.date] : cells[0] || '';
        const dateStr = toDateStr(dateText);
        if (!dateStr) continue;
        const bet = indices.bet >= 0 ? toNumber(cells[indices.bet] || '') : 0;
        const valid = indices.valid >= 0 ? toNumber(cells[indices.valid] || '') : 0;
        const win = indices.win >= 0 ? toNumber(cells[indices.win] || '') : 0;
        out.push({ date: dateStr, dayOfWeek: dow(dateStr), betAmount: bet, validAmount: valid, winLoss: win });
      }

      if (out.length > 0) break; // 命中一个表即可
    }

    return out;
  }


  /**
   * 查询单个注单的结算状态
   */
  async getBetDetail(ticketId: string): Promise<{ success: boolean; winGold?: string; ballActRet?: string; resultText?: string; error?: string }> {
    if (!this.uid) return { success: false, error: '未登录' };

    const common = {
      uid: this.uid as string,
      ver: this.version,
      langx: 'zh-cn',
      ticket_id: ticketId
    };

    // 尝试多个可能的参数组合
    const candidates: Array<Record<string, string>> = [
      { p: 'get_bet_detail' },
      { p: 'bet_detail' },
      { p: 'query_bet' },
      { p: 'check_bet' },
      { p: 'bet_status' },
    ];

    for (const cand of candidates) {
      try {
        const params = new URLSearchParams({ ...common, ...cand } as any);
        console.log(`🔍 [API] 尝试查询注单详情: p=${cand.p}, ticketId=${ticketId}`);
        const resp = await this.axiosInstance.post('/transform.php', params.toString(), { validateStatus: () => true });
        const data = resp.data;

        if (typeof data === 'string') {
          console.log(`📄 [API] 响应长度: ${data.length} 字符`);

          if (data.includes('doubleLogin')) {
            console.log(`⚠️  [API] 检测到 doubleLogin 错误`);
            continue;
          }

          if (data.length > 0 && data.length < 500) {
            console.log(`📄 [API] 响应内容: ${data}`);
          } else if (data.length > 0) {
            console.log(`📄 [API] 响应片段: ${data.substring(0, 500)}...`);
          }

          // 尝试解析结算信息
          const winMatch = data.match(/(?:winGold|\u6d3e\u5f69|\u53ef\u8d62|payout)["'=:\\s>]*(-?[0-9]+(?:\.[0-9]+)?)/i);
          const resultText = (data.match(/(取消|無效|无效|void|赢|輸|输|和)/i)?.[0]) || '';
          const ballActRet = (data.match(/ballActRet["'=:\\s>]*([^\s<>"]{1,40})/i)?.[1]) || '';

          if (winMatch || resultText || ballActRet) {
            console.log(`✅ [API] 成功获取注单详情: winGold=${winMatch?.[1]}, result=${resultText}`);
            return {
              success: true,
              winGold: winMatch?.[1],
              ballActRet,
              resultText
            };
          }
        }
      } catch (e: any) {
        console.log(`❌ [API] 查询注单详情失败 (p=${cand.p}): ${e.message}`);
        continue;
      }
    }

    console.log(`❌ [API] 所有候选参数都未能获取到注单详情`);
    return { success: false, error: '未能从皇冠获取到注单详情' };
  }

  /**
   * 拉取指定日期的注单（使用 history_switch API）
   * @param date 可选参数，格式为 YYYY-MM-DD，如果不传则默认查询昨天
   */
  async getTodayWagers(date?: string): Promise<{ success: boolean; items?: Array<{ ticketId: string; gold?: string; winGold?: string; ballActRet?: string; resultText?: string }>; raw?: string; error?: string }>
  {
    if (!this.uid) return { success: false, error: '未登录' };

    try {
      // 如果没有传入日期，则默认查询昨天的日期
      let todayGmt: string;
      if (date) {
        todayGmt = date; // 使用传入的日期
      } else {
        // 获取昨天的日期 (GMT格式) - 因为注单通常在前一天结算
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1); // 减去1天，获取昨天的日期
        todayGmt = yesterday.toISOString().split('T')[0]; // 格式: 2025-10-25
      }

      const params = new URLSearchParams({
        p: 'history_switch',
        uid: this.uid as string,
        langx: 'zh-cn',
        LS: 'c', // c = 已结算的注单
        today_gmt: todayGmt,
        gtype: 'ALL', // 所有体育类型
        tmp_flag: 'Y'
      } as any);

      console.log(`🔍 [API] 获取今日注单: date=${todayGmt}`);
      const resp = await this.axiosInstance.post('/transform.php', params.toString(), {
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const data = resp.data;

      if (typeof data === 'string') {
        console.log(`📄 [API] 响应长度: ${data.length} 字符`);

        // 始终打印响应内容（用于调试）
        if (data.length > 0 && data.length < 1000) {
          console.log(`📄 [API] 响应内容: ${data}`);
        } else if (data.length > 0) {
          console.log(`📄 [API] 响应片段: ${data.substring(0, 500)}...`);
        }

        // 检查是否需要重新登录
        if (data.includes('doubleLogin')) {
          console.log(`⚠️  [API] 检测到 doubleLogin 错误，需要重新登录`);
          return { success: false, error: 'doubleLogin' };
        }

        // 解析注单列表（XML格式）
        const items: Array<{ ticketId: string; gold?: string; winGold?: string; ballActRet?: string; resultText?: string }> = [];

        // 匹配注单号格式：OU + 数字
        const ticketMatches = data.matchAll(/OU(\d{11,})/g);
        for (const match of ticketMatches) {
          const ticketId = match[0]; // 完整的注单号，如 OU22864082875

          // 尝试提取该注单的相关信息
          // 查找注单号后面的金额和结算信息
          const ticketSection = data.substring(match.index!, Math.min(match.index! + 1500, data.length));

          // 匹配投注金额 <gold>50</gold>
          const goldMatch = ticketSection.match(/<gold>(-?[0-9]+(?:\.[0-9]+)?)<\/gold>/);

          // 匹配派彩金额 <win_gold>-50</win_gold> 或 <win_gold>107</win_gold>
          const winGoldMatch = ticketSection.match(/<win_gold>(-?[0-9]+(?:\.[0-9]+)?)<\/win_gold>/);

          // 匹配比分 <result_data>2 - 0</result_data>
          const scoreMatch = ticketSection.match(/<result_data>(\d+)\s*-\s*(\d+)<\/result_data>/);
          const ballActRet = scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : '';

          // 匹配结果文本 <ball_act_ret>确认</ball_act_ret> 或 <push>注单平局</push>
          const ballActRetMatch = ticketSection.match(/<ball_act_ret>([^<]*)<\/ball_act_ret>/);
          const pushMatch = ticketSection.match(/<push>([^<]*)<\/push>/);
          const resultText = ballActRetMatch?.[1] || pushMatch?.[1] || '';

          items.push({
            ticketId,
            gold: goldMatch?.[1],
            winGold: winGoldMatch?.[1],
            ballActRet,
            resultText
          });
        }

        if (items.length > 0) {
          console.log(`✅ [API] 成功获取 ${items.length} 条注单`);
          return { success: true, items, raw: data };
        } else {
          console.log(`⚠️  [API] 未找到任何注单`);
          return { success: true, items: [], raw: data };
        }
      }

      console.log(`❌ [API] 响应格式不正确`);
      return { success: false, error: '响应格式不正确' };

    } catch (e: any) {
      console.log(`❌ [API] 获取今日注单失败: ${e.message}`);
      return { success: false, error: e.message };
    }
  }


  /**
   * 清除余额缓存
   * 在下注成功后调用，以便下次获取最新余额
   */
  clearBalanceCache(): void {
    this.balanceCache = null;
    console.log(`🗑️  [API] 已清除余额缓存`);
  }

  /**
   * 下注（按皇冠 API 流程：FT_order_view → FT_bet）
   */
  async placeBet(params: {
    gid: string;
    wtype: string;
    chose_team: string;
    gold: number;
    odd_f_type?: string;
    con?: string;
    ratio?: string;
    ioratio?: string;
    minOdds?: number;
  }): Promise<BetResponse> {
    if (!this.uid) {
      return { success: false, error: '未登录' };
    }

    const makeRtype = (wtype: string, chose_team: string) => `${wtype}${chose_team}`;
    const rtype = makeRtype(params.wtype, params.chose_team);

    const fetchOdds = async () => {
      try {
        const odds = await this.getOdds({ gid: params.gid, gtype: 'FT', wtype: params.wtype, chose_team: params.chose_team });
        const raw = typeof odds.data === 'string' ? odds.data : JSON.stringify(odds.data || '');
        const pick = (re: RegExp) => {
          const m = raw.match(re);
          return m && m[1] ? m[1] : undefined;
        };
        const ioratio = pick(/ioratio["'=:\s>]*([0-9.]+)/i);
        const ratio = pick(/ratio["'=:\s>]*([0-9.]+)/i) || '2000';
        const con = pick(/con["'=:\s>]*([-0-9./]+)/i) || '0';
        return { ioratio, ratio, con };
      } catch {
        return { ioratio: undefined, ratio: '2000', con: '0' };
      }
    };

    const tryBet = async (): Promise<BetResponse & { doubleLogin?: boolean }> => {
      let fetchedOdds: { ioratio?: string; ratio?: string; con?: string } | null = null;
      try {
        fetchedOdds = await fetchOdds();
      } catch {
        fetchedOdds = null;
      }

      const ioratio = params.ioratio ?? fetchedOdds?.ioratio ?? '';
      const ratio = params.ratio ?? fetchedOdds?.ratio ?? '2000';
      const con = params.con ?? fetchedOdds?.con ?? '0';
      const parsedOdds = Number(ioratio);
      if (params.minOdds !== undefined) {
        // 如果无法获取当前赔率（ioratio为空或无效），跳过最低赔率检查，让皇冠API自己处理
        if (!ioratio || ioratio.trim() === '') {
          console.warn(`⚠️ [API] 无法获取当前赔率，跳过最低赔率检查，交由皇冠API处理`);
        } else if (!Number.isFinite(parsedOdds) || parsedOdds <= 0) {
          console.warn(`⚠️ [API] 无法解析当前赔率 (${ioratio})，跳过最低赔率检查，交由皇冠API处理`);
        } else if (parsedOdds < params.minOdds) {
          console.warn(`⚠️ [API] 当前赔率 ${parsedOdds} 低于最低赔率 ${params.minOdds}，跳过下注`);
          return { success: false, error: `当前赔率 ${parsedOdds} 低于最低赔率 ${params.minOdds}`, odds: parsedOdds };
        }
      }

      const requestParams = new URLSearchParams({
        p: 'FT_bet',
        uid: this.uid as string,
        ver: this.version,
        langx: 'zh-cn',
        odd_f_type: params.odd_f_type || 'H',
        golds: params.gold.toString(),
        gid: params.gid,
        gtype: 'FT',
        wtype: params.wtype,
        rtype,
        chose_team: params.chose_team,
        ioratio,
        con,
        ratio,
        autoOdd: 'Y',
        timestamp: String(Date.now()),
        timestamp2: '',
        isRB: params.wtype.startsWith('R') ? 'Y' : 'N',
        imp: 'N',
        ptype: '',
        isYesterday: 'N',
        f: '1R',
      });

      console.log(`💰 [API] 下注: gid=${params.gid}, wtype=${params.wtype}, rtype=${rtype}, gold=${params.gold}`);
      const resp = await this.axiosInstance.post('/transform.php', requestParams.toString(), { validateStatus: () => true });
      const data = resp.data;

      // 打印完整响应用于调试
      console.log(`📋 [API] 下注响应类型: ${typeof data}`);
      if (typeof data === 'string') {
        console.log(`📋 [API] 下注响应内容(前500字符): ${data.slice(0, 500)}`);
      } else {
        console.log(`📋 [API] 下注响应内容: ${JSON.stringify(data).slice(0, 500)}`);
      }

      const extractTicket = (payload: any): string | undefined => {
        if (!payload) return undefined;
        const candidates: Array<string | number | undefined> = [
          payload.ticket_id,
          payload.ticketID,
          payload.TicketID,
          payload.ticket,
          payload.Ticket,
          payload.data?.ticket_id,
        ];
        for (const val of candidates) {
          if (typeof val === 'number' && Number.isFinite(val)) return String(val);
          if (typeof val === 'string') {
            const match = val.match(/\d{6,}/);
            if (match) return match[0];
          }
        }
        return undefined;
      };

      const oddsNumber = Number(ioratio);

      const buildSuccess = (
        betId?: string,
        message?: string,
        overrideOdds?: number,
      ): BetResponse & { doubleLogin?: boolean } => {
        this.clearBalanceCache();
        return {
          success: true,
          message: message || '下注成功',
          betId,
          odds: overrideOdds ?? (Number.isFinite(oddsNumber) ? oddsNumber : undefined),
        };
      };

      if (typeof data === 'string') {
        const head = data.slice(0, 220);
        if (/doubleLogin/i.test(data)) {
          console.warn('⚠️  [API] 下注返回 doubleLogin');
          return { success: false, error: 'doubleLogin', doubleLogin: true };
        }
        if (/(<code>560<\/code>|ticket_id|下注成功|Success|OK)/i.test(data)) {
          const idMatch =
            data.match(/ticket_id["'=:\\s>]*([0-9]+)/i) ||
            data.match(/(?:注单号|ticket|TicketID)[^0-9]*([0-9]{6,})/i);
          const betId = idMatch && idMatch[1] ? idMatch[1] : undefined;
          return buildSuccess(betId);
        }

        // 解析错误代码和错误信息
        const codeMatch = data.match(/<code>(\d+)<\/code>/i);
        const errorMsgMatch = data.match(/<errormsg>([^<]+)<\/errormsg>/i);
        const errorCode = codeMatch ? codeMatch[1] : null;
        const errorMsg = errorMsgMatch ? errorMsgMatch[1] : null;

        // 错误代码映射
        const errorMessages: { [key: string]: string } = {
          '555': '盘口已关闭或不可用',
          '1X015': '盘口已关闭',
          '1X001': '赔率已变化',
          '1X002': '下注金额超出限额',
          '1X003': '账号余额不足',
          '1X004': '比赛已结束',
          '1X005': '比赛已开始',
          '1X006': '系统维护中',
        };

        let friendlyError = '下注失败';
        if (errorCode && errorMessages[errorCode]) {
          friendlyError = errorMessages[errorCode];
        } else if (errorMsg && errorMessages[errorMsg]) {
          friendlyError = errorMessages[errorMsg];
        } else if (errorCode || errorMsg) {
          friendlyError = `下注失败 (${errorCode || errorMsg})`;
        }

        console.error(`❌ [API] 下注失败: code=${errorCode}, msg=${errorMsg}, error=${friendlyError}`);
        return { success: false, error: friendlyError };
      }

      if (data && typeof data === 'object') {
        const code = data.code !== undefined ? String(data.code) : undefined;
        const status = data.status !== undefined ? String(data.status) : undefined;
        if (code === '560' || /success/i.test(status || '')) {
          const overrideOdds =
            typeof data.odds === 'number'
              ? data.odds
              : data.ioratio !== undefined
                ? Number(data.ioratio)
                : undefined;
          return buildSuccess(extractTicket(data), data.message || data.msg || status, overrideOdds);
        }
        const ticketFromObj = extractTicket(data);
        if (ticketFromObj) {
          return buildSuccess(ticketFromObj, data.message || data.msg);
        }
        console.error('❌ [API] 下注返回非成功对象:', JSON.stringify(data).slice(0, 300));
        return { success: false, error: data.message || data.msg || '下注失败' };
      }

      return { success: false, error: '下注响应格式错误' };
    };

    try {
      let rs = await tryBet();
      if (rs.success) return rs;

      // doubleLogin 处理：尝试重登后重试一次
      if (rs.doubleLogin && this.username && this.password) {
        try {
          console.log('🔄 [API] 下注触发 doubleLogin，准备重新登录后重试...');
          this.cookies = [];
          const relog = await this.login(this.username, this.password);
          if (relog.success) {
            rs = await tryBet();
            if (rs.success) return rs;
          }
        } catch (e) {
          console.error('❌ [API] 下注重登异常:', (e as any)?.message || e);
        }
      }

      return { success: false, error: rs.error || '下注失败' };
    } catch (error: any) {
      console.error('❌ [API] 下注异常:', error.message);
      return { success: false, error: error.message || '下注请求失败' };
    }
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn(): boolean {
    return !!this.uid;
  }

  /**
   * 获取登录信息
   */
  getLoginInfo() {
    return {
      uid: this.uid,
      mid: this.mid,
      username: this.username,
    };
  }

  /**
   * 修改账号（首次登录第一步）
   * @param newUsername 新用户名
   * @returns 修改结果
   */
  async changeUsername(newUsername: string): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!this.uid) {
      return {
        success: false,
        message: '未登录，无法修改账号',
      };
    }

    try {
      const params = new URLSearchParams({
        p: 'chg_username',
        ver: this.version,
        username: newUsername,
        uid: this.uid,
        langx: 'zh-cn',
      });

      console.log(`🔐 [API] 修改账号: ${this.username} -> ${newUsername}`);

      const response = await this.axiosInstance.post(
        `/transform.php?ver=${this.version}`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const responseText = response.data;
      console.log(`📥 [API] 修改账号响应:`, responseText.substring(0, 500));

      // 解析XML响应
      const statusMatch = responseText.match(/<status>(.*?)<\/status>/);
      const errMatch = responseText.match(/<err>(.*?)<\/err>/);

      if (statusMatch && statusMatch[1] === 'error') {
        const errorCode = errMatch ? errMatch[1] : 'unknown';
        const message = `修改账号失败 (错误代码: ${errorCode})`;
        console.error(`❌ [API] ${message}`);

        return {
          success: false,
          message,
        };
      }

      // 修改成功，更新本地用户名
      this.username = newUsername;
      console.log(`✅ [API] 账号修改成功，新用户名: ${newUsername}`);

      return {
        success: true,
        message: '账号修改成功',
      };
    } catch (error: any) {
      console.error('❌ [API] 修改账号异常:', error.message);
      return {
        success: false,
        message: `修改账号异常: ${error.message}`,
      };
    }
  }

  /**
   * 修改密码（首次登录第二步）
   * @param newPassword 新密码
   * @returns 修改结果
   */
  async changePassword(newPassword: string): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!this.uid || !this.username) {
      return {
        success: false,
        message: '未登录，无法修改密码',
      };
    }

    try {
      const params = new URLSearchParams({
        p: 'chg_newpwd',
        ver: this.version,
        new_password: newPassword,
        chg_password: newPassword, // 确认密码与新密码相同
        uid: this.uid,
        langx: 'zh-cn',
      });

      console.log(`🔐 [API] 修改密码`);

      const response = await this.axiosInstance.post(
        `/transform.php?ver=${this.version}`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const responseText = response.data;
      console.log(`📥 [API] 修改密码响应:`, responseText.substring(0, 500));

      // 解析XML响应
      const statusMatch = responseText.match(/<status>(.*?)<\/status>/);
      const errMatch = responseText.match(/<err>(.*?)<\/err>/);

      if (statusMatch && statusMatch[1] === 'error') {
        const errorCode = errMatch ? errMatch[1] : 'unknown';
        const errorMessages: { [key: string]: string } = {
          '411': '新密码不能为空',
          '412': '确认密码不能为空',
          '413': '两次输入的密码不一致',
          '414': '新密码不能与旧密码相同',
          '415': '密码格式不正确（需要6-12位，包含字母和数字）',
          '416': '密码过于简单',
          '417': '密码过于简单',
          '418': '旧密码错误',
          '419': '新密码不能与用户名相同',
        };

        const message = errorMessages[errorCode] || `修改密码失败 (错误代码: ${errorCode})`;
        console.error(`❌ [API] 修改密码失败: ${message}`);

        return {
          success: false,
          message,
        };
      }

      // 修改成功，更新本地密码
      this.password = newPassword;
      console.log(`✅ [API] 密码修改成功`);

      return {
        success: true,
        message: '密码修改成功',
      };
    } catch (error: any) {
      console.error('❌ [API] 修改密码异常:', error.message);
      return {
        success: false,
        message: `修改密码异常: ${error.message}`,
      };
    }
  }

  /**
   * 登出
   */
  logout() {
    this.uid = undefined;
    this.mid = undefined;
    this.username = undefined;
    this.password = undefined;
  }
}
