import { promises as fs } from 'fs';
import { chromium, Browser, BrowserContext, Page, BrowserContextOptions, Frame, Locator } from 'playwright';
import { CrownAccount } from '../types';
import { query } from '../models/database';

const PLAYWRIGHT_HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true').toLowerCase();
const isHeadless = ['1', 'true', 'yes', 'y'].includes(PLAYWRIGHT_HEADLESS);

const LOGIN_PAGE_URL = process.env.CROWN_BASE_URL || 'https://hga038.com';

interface BetRequest {
  betType: string;
  betOption: string;
  amount: number;
  odds: number;
  platformAmount?: number;
  discount?: number;
  match_id?: number;
  matchId?: number;
  bet_type?: string;
  bet_option?: string;
  crown_match_id?: string;
  crownMatchId?: string;
  home_team?: string;
  homeTeam?: string;
  away_team?: string;
  awayTeam?: string;
  league_name?: string;
  leagueName?: string;
  match_time?: string;
  matchTime?: string;
  match_status?: string;
  matchStatus?: string;
  current_score?: string;
  currentScore?: string;
  match_period?: string;
  matchPeriod?: string;
}

interface CrownLoginResult {
  success: boolean;
  message: string;
  sessionInfo?: any;
  needsCredentialChange?: boolean;
}

interface CrownBetResult {
  success: boolean;
  message: string;
  betId?: string;
  actualOdds?: number;
  platformAmount?: number;
  crownAmount?: number;
}

interface CrownWagerItem {
  ticketId: string;
  gold: string;
  winGold: string;
  resultText?: string;
  score?: string;
  league?: string;
  teamH?: string;
  teamC?: string;
  ballActRet?: string;
  ballActClass?: string;
  wagerDate?: string;
  betWtype?: string;
  rawXml?: string;
}

interface CrownWagerEvalResult {
  ok: boolean;
  reason?: string;
  xml?: string;
  items?: CrownWagerItem[];
}

interface FinancialSnapshot {
  balance: number | null;
  credit: number | null;
  balanceSource: string;
  creditSource: string;
}

interface RawFieldInfo {
  key: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  labelText: string;
  surroundingText: string;
  visible: boolean;
  sectionKey?: string;
}

interface RawActionInfo {
  key: string;
  text: string;
  type: string;
  tagName: string;
  visible: boolean;
  sectionKey?: string;
}

type CredentialChangeFormType = 'loginId' | 'password';

type FrameLike = Page | Frame;

type LoginDetectionResult = { status: 'success' | 'error' | 'timeout'; message?: string; debug?: Record<string, any> };

interface PasscodeState {
  userData: {
    username?: string;
    mid?: string;
    four_pwd?: string;
    msg?: string;
    abox4pwd_notshow?: string;
    passwd_safe?: string;
  };
  memSet: {
    passcode?: string;
    fourPwd?: string;
  };
  cookies: string;
}

interface PasscodeInputMeta {
  id: string;
  name: string;
  type: string;
  placeholder: string;
  className: string;
  maxLength?: number;
  inputMode?: string;
  ariaLabel?: string;
  labelText?: string;
  containerId?: string;
  containerClasses?: string;
}

interface PasscodeGroup {
  context: FrameLike;
  inputs: Array<{ locator: Locator; meta: PasscodeInputMeta }>;
  containerId?: string;
  containerClasses?: string;
  key: string;
  score: number;
  marker?: string;
}

interface PasscodeHandlingResult {
  success: boolean;
  passcode?: string;
  mode?: 'setup' | 'input' | 'keypad';
  reason?: string;
}

interface CredentialChangeSelectors {
  formType: CredentialChangeFormType;
  newUsername?: string;
  newPassword?: string;
  confirmPassword?: string;
  oldUsername?: string;
  oldPassword?: string;
  submitButton?: string;
  checkButton?: string;
  sectionKey?: string;
}

interface CredentialChangeDetectionResult {
  target: Page | Frame;
  selectors: CredentialChangeSelectors;
  contextDescription: string;
  rawFields: RawFieldInfo[];
  rawActions: RawActionInfo[];
}

interface CredentialChangeOutcome {
  success: boolean;
  message: string;
  usernameChanged: boolean;
  passwordChanged: boolean;
  formType: CredentialChangeFormType;
  skipLoginId?: boolean;
}

interface CredentialChangeOutcome {
  success: boolean;
  message: string;
  usernameChanged: boolean;
  passwordChanged: boolean;
  formType: CredentialChangeFormType;
  skipLoginId?: boolean;
}

export class CrownAutomationService {
  private browser: Browser | null = null;
  private accountBrowsers: Map<number, Browser> = new Map();
  private contexts: Map<number, BrowserContext> = new Map();
  private pages: Map<number, Page> = new Map();
  private sessionInfos: Map<number, any> = new Map();
  private passcodeCache: Map<number, string> = new Map();
  private lastHeartbeats: Map<number, number> = new Map();
  // 系统默认账号（仅用于抓取赛事，不落库）
  private systemLastBeat: number = 0;
  private systemLastLogin: number = 0;
  private systemUsername: string = '';
  private systemLoginFailCount: number = 0;  // 系统登录失败计数
  private systemLoginCooldownUntil: number = 0;  // 系统登录冷却时间戳
  private lastPasscodeRejected: boolean = false;
  private fetchWarmupPromise: Promise<void> | null = null;
  private warmupScheduled = false;
  private balanceDebugCaptured: Set<number> = new Set();
  private onlineStatusTimer: NodeJS.Timeout | null = null;
  private onlineStatusRunning = false;
  private onlineStatusIntervalMs = 60000;
  private onlineHeartbeatTtlMs = 120000;

  constructor() {
    // 延迟初始化浏览器，避免启动时崩溃
    this.scheduleFetchWarmup();
    this.onlineStatusIntervalMs = this.resolveInterval(
      process.env.CROWN_ONLINE_CHECK_INTERVAL_MS,
      60000,
      15000,
    );
    this.onlineHeartbeatTtlMs = this.resolveInterval(
      process.env.CROWN_ONLINE_HEARTBEAT_TTL_MS,
      120000,
      30000,
    );
    this.startOnlineMonitor();
  }

  private scheduleFetchWarmup() {
    if (this.warmupScheduled) {
      return;
    }
    this.warmupScheduled = true;
    setTimeout(() => {
      this.ensureFetchWarmup().catch((error) => {
        console.error('❌ 赛事抓取账号预热失败:', error);
      });
    }, 1500);
  }

  private ensureFetchWarmup(): Promise<void> {
    if (this.fetchWarmupPromise) {
      return this.fetchWarmupPromise;
    }
    this.fetchWarmupPromise = this.warmupFetchAccounts()
      .catch((error) => {
        console.error('❌ 预热抓取账号时出错:', error);
      })
      .finally(() => {
        this.fetchWarmupPromise = null;
      });
    return this.fetchWarmupPromise;
  }

  private async warmupFetchAccounts() {
    try {
      console.log('🚀 正在预热赛事抓取账号...');
      await query('UPDATE crown_accounts SET is_online = false WHERE use_for_fetch = true');

      const accountsResult = await query(
        `SELECT * FROM crown_accounts
           WHERE use_for_fetch = true
             AND is_enabled = true
         ORDER BY last_login_at DESC NULLS LAST`
      );

      const rows = accountsResult.rows || [];
      if (rows.length === 0) {
        console.log('ℹ️ 未配置赛事抓取账号，跳过预热');
        return;
      }

      for (const row of rows) {
        const accountId = Number(row.id);
        if (!Number.isFinite(accountId)) {
          continue;
        }
        if (this.isAccountOnline(accountId)) {
          continue;
        }

        await this.randomDelay(400, 800);
        const result = await this.loginAccount(row as CrownAccount);
        if (result.success) {
          console.log(`✅ 抓取账号 ${row.username} 预热成功`);
        } else {
          console.warn(`⚠️ 抓取账号 ${row.username} 预热失败: ${result.message || '未知错误'}`);
        }
      }
    } catch (error) {
      throw error;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (closeErr) {
        console.warn('⚠️ 关闭失效浏览器实例时出错:', closeErr);
      } finally {
        this.browser = null;
      }
    }

    await this.initBrowser();

    if (!this.browser) {
      throw new Error('浏览器初始化失败');
    }

    return this.browser;
  }

  private isMobileDevice(deviceType?: string): boolean {
    if (!deviceType) {
      return false;
    }
    const normalized = deviceType.toLowerCase();
    return /(iphone|ios|android|mobile)/.test(normalized);
  }

  private randomizeViewport(baseWidth: number, baseHeight: number, jitter = 4) {
    const offset = (range: number) => Math.floor(Math.random() * (range * 2 + 1)) - range;
    return {
      width: Math.max(320, baseWidth + offset(jitter)),
      height: Math.max(480, baseHeight + offset(jitter)),
    };
  }

  private getViewportConfig(deviceType?: string) {
    const normalized = (deviceType || '').toLowerCase();

    const mobileProfiles = [
      { matcher: /iphone\s?14/, width: 390, height: 844, scale: 3 },
      { matcher: /iphone\s?13/, width: 390, height: 844, scale: 3 },
      { matcher: /iphone|ios/, width: 375, height: 812, scale: 3 },
      { matcher: /android/, width: 412, height: 915, scale: 2.75 },
      { matcher: /mobile/, width: 414, height: 896, scale: 2.5 },
    ];

    for (const profile of mobileProfiles) {
      if (profile.matcher.test(normalized)) {
        return {
          viewport: this.randomizeViewport(profile.width, profile.height, 6),
          deviceScaleFactor: profile.scale,
          isMobile: true,
          hasTouch: true,
        };
      }
    }

    if (this.isMobileDevice(deviceType)) {
      return {
        viewport: this.randomizeViewport(414, 896, 6),
        deviceScaleFactor: 2.5,
        isMobile: true,
        hasTouch: true,
      };
    }

    const desktopViewports = [
      { width: 1920, height: 1080 },
      { width: 1680, height: 1050 },
      { width: 1600, height: 900 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
    ];

    const choice = desktopViewports[Math.floor(Math.random() * desktopViewports.length)];
    return {
      viewport: this.randomizeViewport(choice.width, choice.height, 10),
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    };
  }

  private async findFirstVisibleSelector(page: Page, selectors: string[], timeout = 10000): Promise<string> {
    const start = Date.now();
    const stepTimeout = Math.max(Math.floor(timeout / selectors.length), 1000);

    for (const selector of selectors) {
      const remaining = timeout - (Date.now() - start);
      if (remaining <= 0) {
        break;
      }

      try {
        await page.waitForSelector(selector, {
          timeout: Math.min(stepTimeout, Math.max(remaining, 500)),
          state: 'visible',
        });
        return selector;
      } catch {
        // 尝试下一个选择器
      }
    }

    throw new Error(`未能找到可见的元素: ${selectors.join(', ')}`);
  }

  private async getVisibleText(page: Page, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout: 1000, state: 'visible' });
        const text = await element.textContent();
        if (text) {
          return text.trim();
        }
      } catch {
        // 继续
      }
    }
    return null;
  }

  private async waitForLoginResult(page: Page, timeout = 30000): Promise<{ status: 'success' | 'error' | 'timeout'; message?: string; debug?: Record<string, any> }> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      let state: { status: 'success' | 'error' | 'pending'; message?: string; debug?: Record<string, any> } | null = null;
      try {
        state = await page.evaluate<{
          status: 'success' | 'error' | 'pending';
          message?: string;
          debug?: Record<string, any>;
        }>(() => {
          const globalObj = globalThis as any;
          const doc = globalObj?.document as any;
          const win = globalObj?.window as any;

        const getDisplay = (selector: string): 'visible' | 'hidden' => {
          const el = doc?.querySelector?.(selector) as any;
          if (!el) {
            return 'hidden';
          }
          const style = win?.getComputedStyle?.(el);
          const visible = !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          if (!visible && typeof el?.offsetParent !== 'undefined') {
            return el.offsetParent !== null ? 'visible' : 'hidden';
          }
          return visible ? 'visible' : 'hidden';
        };

        const homeVisible = getDisplay('#home_show') === 'visible';
        const loginHidden = getDisplay('#acc_show') === 'hidden';
        const alertVisible = getDisplay('#C_alert_confirm') === 'visible' || getDisplay('#alert_confirm') === 'visible';
        const kickVisible = getDisplay('#alert_kick') === 'visible';

        const textErrorVisible = getDisplay('#text_error') === 'visible';
        const errorText = textErrorVisible ? (doc?.querySelector?.('#text_error')?.innerText || '').trim() : null;

        const topWindow = win?.top as any;
        const userData = topWindow?.userData || {};
        const memSet = topWindow?.memSet || {};

        const fourPwdRaw = typeof userData?.four_pwd === 'string' ? userData.four_pwd : '';
        const fourPwdNormalized = (fourPwdRaw || '').toString().trim().toLowerCase();
        const fourPwdSignals = !!fourPwdNormalized
          && !['', 'n', 'no', 'none', 'false', '0', 'complete', 'success', 'done'].includes(fourPwdNormalized)
          && (
            ['new', 'second', 'third', 'again', 'reset', 'set', 'pending', 'need', 'require', 'required', 'retry', 'y', 'yes'].includes(fourPwdNormalized)
            || /passcode|4pwd|four\s*pwd|四位|四碼|简易|簡易/.test(fourPwdNormalized)
          );

        const memPasscodeRaw = typeof memSet?.passcode === 'string' ? memSet.passcode : '';
        const memPasscodeDigits = memPasscodeRaw.replace(/\D+/g, '');
        const memPasscodeSignals = memPasscodeDigits.length === 4;

        let messageFromTop = (() => {
          if (!topWindow || !topWindow.userData) {
            return null;
          }
          const { msg, code_message } = topWindow.userData;
          if (typeof msg === 'string' && /passcode|4pwd|goToPasscode/i.test(msg)) {
            return 'passcode_prompt';
          }
          if (msg && typeof msg === 'string') {
            return code_message || msg;
          }
          return null;
        })();

        if (!messageFromTop && fourPwdSignals) {
          messageFromTop = 'passcode_prompt';
        }

        const passcodeRequired = (() => {
          const accShow = doc?.querySelector?.('#acc_show') as any;
          const className = accShow?.className || '';
          const hasPassOutside = !!(accShow && accShow.classList?.contains?.('pass_outside'));
          // 额外检测是否已进入预设/输入四位码的容器
          const passcodeBox = doc?.querySelector?.('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area');
          let passcodeBoxVisible = false;
          try {
            if (passcodeBox) {
              const style = win?.getComputedStyle?.(passcodeBox as any);
              passcodeBoxVisible = !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }
          } catch {}
          return {
            required: hasPassOutside || passcodeBoxVisible,
            className,
          };
        })();

        const doubleLogin = (() => {
          const topWindow = win?.top as any;
          return !!(topWindow && topWindow.doubleLogin);
        })();

        if (homeVisible && loginHidden) {
          return { status: 'success' as const, debug: { homeVisible, loginHidden, alertVisible } };
        }

        const shouldPromptPasscode = passcodeRequired.required
          || (messageFromTop === 'passcode_prompt')
          || (!homeVisible && (fourPwdSignals || memPasscodeSignals));

        if (shouldPromptPasscode) {
          return {
            status: 'success' as const,
            message: 'passcode_prompt',
            debug: {
              homeVisible,
              loginHidden,
              alertVisible,
              accShowClass: passcodeRequired.className,
              fourPwd: userData?.four_pwd,
              memPasscode: memSet?.passcode,
            },
          };
        }

        if (kickVisible) {
          return {
            status: 'error' as const,
            message: 'force_logout',
            debug: { kickVisible: true },
          };
        }

        if (doubleLogin) {
          return {
            status: 'error' as const,
            message: '检测到重复登录，目标账号可能已在其他终端在线。',
            debug: { doubleLogin: true },
          };
        }

        if (errorText) {
          return { status: 'error' as const, message: errorText, debug: { errorText } };
        }

        if (messageFromTop) {
          if (messageFromTop === 'passcode_prompt') {
            return {
              status: 'success' as const,
              message: 'passcode_prompt',
              debug: {
                homeVisible,
                loginHidden,
                alertVisible,
                fourPwd: userData?.four_pwd,
                memPasscode: memSet?.passcode,
              },
            };
          }
          return { status: 'error' as const, message: messageFromTop, debug: { messageFromTop } };
        }

          return {
            status: 'pending' as const,
            debug: {
              homeVisible,
              loginHidden,
              alertVisible,
              accShowClass: passcodeRequired.className,
            },
          };
        });
      } catch (evalError) {
        console.warn('⚠️ 检测登录状态时发生异常，重试中:', evalError);
        await this.randomDelay(500, 800);
        continue;
      }

      if (!state) {
        await this.randomDelay(400, 700);
        continue;
      }
      if (state.status === 'success') {
        return { status: 'success', message: state.message, debug: state.debug };
      }

      if (state.status === 'error') {
        return { status: 'error', message: state.message, debug: state.debug };
      }

      await this.randomDelay(400, 700);
    }

    return { status: 'timeout', debug: { message: 'waitForLoginResult timeout' } };
  }

  private async handlePostLoginPrompts(page: Page) {
    // 优先处理“记住我的帐号/浏览器推荐”等登录页提示：统一点击“是/确认”继续
    try {
      const hasConfirm = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return false;
        const c1 = doc.querySelector('#alert_confirm');
        const c2 = doc.querySelector('#C_alert_confirm');
        return !!(c1 || c2);
      });
      if (hasConfirm) {
        console.log('ℹ️ 检测到登录页提示容器（可能是记住帐号/浏览器推荐/确认），尝试点击“是/确认”');
        const accepted = await this.clickPasscodeConfirm(page, null).catch(() => false);
        if (!accepted) {
          // 兜底尝试点击OK/继续/Yes
          const fallback = page.locator('#C_ok_btn:visible, #ok_btn:visible, button:has-text("OK"), button:has-text("Yes"), button:has-text("Continue"), .btn_submit:has-text("OK"), .btn_submit:has-text("继续"), .btn_submit:has-text("確認"), .btn_submit:has-text("确认")').first();
          if ((await fallback.count().catch(() => 0)) > 0) {
            await fallback.click({ force: true }).catch(() => undefined);
          }
        }
        await this.randomDelay(150, 260);
      }
    } catch (e) {
      // 忽略异常，继续常规流程
    }

    const tryDismiss = async (target: Page | Frame): Promise<boolean> => {
      const confirmSelectors: Array<{ label: string; locator: ReturnType<Page['locator']> }> = [
        { label: '#C_ok_btn', locator: target.locator('#C_ok_btn') },
        { label: '#confirm_btn', locator: target.locator('#confirm_btn') },
        { label: '#alert_confirm -> #yes_btn', locator: target.locator('#alert_confirm').locator('#yes_btn') },
        { label: '#C_alert_confirm -> #C_yes_btn', locator: target.locator('#C_alert_confirm').locator('#C_yes_btn') },
        { label: '.btn_submit:has-text("确认")', locator: target.locator('.btn_submit:has-text("确认")') },
        { label: '.btn_submit:has-text("確定")', locator: target.locator('.btn_submit:has-text("確定")') },
        { label: '.btn_submit:has-text("OK")', locator: target.locator('.btn_submit:has-text("OK")') },
        { label: '.btn_submit:has-text("Yes")', locator: target.locator('.btn_submit:has-text("Yes")') },
        { label: '.btn_submit:has-text("Continue")', locator: target.locator('.btn_submit:has-text("Continue")') },
        { label: 'button:has-text("确认")', locator: target.locator('button:has-text("确认")') },
        { label: 'button:has-text("確定")', locator: target.locator('button:has-text("確定")') },
        { label: 'button:has-text("OK")', locator: target.locator('button:has-text("OK")') },
        { label: 'button:has-text("Yes")', locator: target.locator('button:has-text("Yes")') },
        { label: 'button:has-text("Continue")', locator: target.locator('button:has-text("Continue")') },
        { label: 'div.btn_submit:has-text("确认")', locator: target.locator('div.btn_submit:has-text("确认")') },
        { label: 'div.btn_submit:has-text("確定")', locator: target.locator('div.btn_submit:has-text("確定")') },
        { label: 'div.btn_submit:has-text("OK")', locator: target.locator('div.btn_submit:has-text("OK")') },
        { label: 'div.btn_submit:has-text("Yes")', locator: target.locator('div.btn_submit:has-text("Yes")') },
        { label: 'div.btn_submit:has-text("Continue")', locator: target.locator('div.btn_submit:has-text("Continue")') },
      ].filter(item => !!item.locator);

      for (const { label, locator } of confirmSelectors) {
        try {
          const candidate = locator.first();
          if (!(await candidate.isVisible({ timeout: 200 }).catch(() => false))) {
            continue;
          }

          console.log(`🟢 检测到确认提示 (${label})，尝试点击“确认”`);
          try {
            await candidate.scrollIntoViewIfNeeded?.().catch(() => undefined);
            const popupText = await candidate.evaluate((node: any) => {
              const element = node as any;
              const parent = element?.closest?.('.pop_box, .popup_content, .content_chgpwd, .popup_bottom, .box_help_btn');
              const rawText = parent?.textContent || element?.innerText || '';
              return (rawText || '').trim();
            }).catch(() => '');
            if (popupText) {
              console.log('🧾 弹窗内容:', popupText.replace(/\s+/g, ' '));
            }
          } catch (readErr) {
            console.warn('⚠️ 读取确认弹窗文本失败:', readErr);
          }

          await candidate.click({ timeout: 2000, force: true }).catch(async (clickErr) => {
            console.warn('⚠️ 点击“确认”失败，尝试tap:', clickErr);
            const box = await candidate.boundingBox().catch(() => null);
            if (box) {
              await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
            } else {
              throw clickErr;
            }
          });

          await this.randomDelay(200, 400);
          return true;
        } catch (confirmErr) {
          console.warn(`⚠️ 处理确认弹窗 (${label}) 失败:`, confirmErr);
        }
      }

      const cancelSelectors: Array<{ label: string; locator: ReturnType<Page['locator']> }> = [
        { label: '#C_alert_confirm -> #C_no_btn', locator: target.locator('#C_alert_confirm').locator('#C_no_btn') },
        { label: '#alert_confirm -> #no_btn', locator: target.locator('#alert_confirm').locator('#no_btn') },
        { label: '.btn_passcode_cancel', locator: target.locator('.btn_passcode_cancel') },
        { label: '#btn_pwd4_no', locator: target.locator('#btn_pwd4_no') },
        { label: 'getByRole(button, 否, exact)', locator: target.getByRole?.('button', { name: '否', exact: true }) as any },
        { label: 'getByRole(button, 否)', locator: target.getByRole?.('button', { name: '否' }) as any },
        { label: 'text="否"', locator: target.locator('text="否"') },
        { label: 'text=否', locator: target.locator('text=否') },
        { label: 'button:has-text("No")', locator: target.locator('button:has-text("No")') },
        { label: 'button:has-text("Cancel")', locator: target.locator('button:has-text("Cancel")') },
        { label: 'button:has-text("Not Now")', locator: target.locator('button:has-text("Not Now")') },
        { label: 'button:has-text("Later")', locator: target.locator('button:has-text("Later")') },
        { label: 'text="No"', locator: target.locator('text="No"') },
        { label: 'text="Cancel"', locator: target.locator('text="Cancel"') },
        { label: 'text="Not Now"', locator: target.locator('text="Not Now"') },
        { label: 'text="Later"', locator: target.locator('text="Later"') },
        { label: '.btn_cancel', locator: target.locator('.btn_cancel') },
        { label: 'xpath: exact', locator: target.locator("xpath=//*[text()='否']") },
        { label: 'xpath: contains', locator: target.locator("xpath=//*[contains(normalize-space(), '否')]") },
      ].filter(item => !!item.locator);

      for (const { label, locator } of cancelSelectors) {
        try {
          const candidate = locator.first();
          if (!(await candidate.isVisible({ timeout: 200 }).catch(() => false))) {
            continue;
          }

          let popupText = '';
          try {
            await candidate.scrollIntoViewIfNeeded?.().catch(() => undefined);
            const meta = await candidate.evaluate((node: any) => {
              const element = node as any;
              const parent = element?.closest?.('#alert_confirm, #C_alert_confirm, .popup_content, .content_chgpwd, .popup_bottom, .box_help_btn, .pop_box');
              const insideModal = !!parent;
              const rawText = parent?.textContent || element?.innerText || '';
              const parentHtml = parent?.innerHTML || '';
              return { insideModal, text: (rawText || '').trim(), parentHtml };
            }).catch(() => ({ insideModal: false, text: '', parentHtml: '' }));
            if (!meta.insideModal) {
              console.log(`ℹ️ 跳过“否” (${label})：未检测到弹窗容器`);
              continue;
            }
            popupText = meta.text || '';
            if (popupText) {
              console.log('🧾 弹窗内容:', popupText.replace(/\s+/g, ' '));
            }
            if (meta.parentHtml) {
              console.log('🧾 弹窗结构片段:', meta.parentHtml.replace(/\s+/g, ' ').slice(0, 400));
            }
          } catch (readErr) {
            console.warn('⚠️ 读取弹窗文本失败:', readErr);
          }

          const selectorHint = (label || '').toLowerCase();
          const isPasswordPage = /修改密码|change password|請修改|请修改/.test(popupText);
          const isPasscodeControl = /passcode|pwd4/.test(selectorHint);
          const isPasscodePrompt = isPasscodeControl || /简易密码|簡易密碼|四位|四碼|4位|4碼|passcode|4-?digit|four\s*digit|simple\s*password|set\s*passcode|setup\s*passcode/i.test(popupText);
          const isRememberAccountPrompt = /记住我的帐号|記住我的帳號|记住帳號|记得帐号|remember\s+my\s+account|remember\s*(me|account|username)|save\s*(account|username)/i.test(popupText);

          if (isPasswordPage) {
            console.log('ℹ️ 检测到密码修改页面提示，跳过“否”按钮，等待表单处理');
            continue;
          }

          if (isPasscodePrompt) {
            console.log('ℹ️ 检测到四位安全码提示，交由专用流程处理');
            continue;
          }

          if (isRememberAccountPrompt) {
            console.log('ℹ️ 检测到记住账号提示，改为点击“是”继续');
            const accepted = await this.clickPasscodeConfirm(target, null).catch(() => false);
            if (accepted) {
              await this.randomDelay(200, 400);
              return true;
            }
            console.warn('⚠️ 记住账号提示点击“是”失败，继续尝试“否”');
            try {
              await candidate.click({ timeout: 1500, force: true });
              await this.randomDelay(200, 400);
              return true;
            } catch (noErr) {
              console.warn('⚠️ 点击“否”关闭记住账号提示失败:', noErr);
            }
          }

          console.log(`ℹ️ 跳过点击“否” (${label})`);
          continue;

         return true;
       } catch (err) {
         // 如果 locator 不支持 first/isVisible 等，忽略该候选
       }
     }

      return false;
    };

    const start = Date.now();
    let handledAny = false;
    while (Date.now() - start < 15000) {
      let handledThisRound = false;
      const frames = [page, ...page.frames()];
      for (const frame of frames) {
        if (await tryDismiss(frame)) {
          handledAny = true;
          handledThisRound = true;
        }
      }

      if (!handledThisRound) {
        const stillVisible = await page.locator('#C_alert_confirm:visible, #alert_confirm:visible, .box_help_btn:visible').count();
        if (stillVisible === 0) {
          break;
        }
      }

      await this.randomDelay(200, 350);
    }

    if (handledAny) {
      console.log('✅ 已处理简易密码提示');
    }
  }

  private normalizeFieldText(info: RawFieldInfo): string {
    const chunks = [
      info.name,
      info.id,
      info.placeholder,
      info.ariaLabel,
      info.labelText,
      info.surroundingText,
    ]
      .filter(Boolean)
      .map(value => value.toLowerCase().trim().replace(/\s+/g, ' '));
    return chunks.join(' ');
  }

  private matchKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private async submitPasswordChange(
    page: Page,
    account: CrownAccount,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message?: string }> {
    const trimmedNewPassword = newPassword.trim();
    const trimmedCurrentPassword = currentPassword.trim();

    // 0) 前置检查：新旧密码不能相同
    if (trimmedNewPassword === trimmedCurrentPassword) {
      console.warn('⚠️ 新密码与当前密码相同，无需修改');
      return {
        success: false,
        message: '新密码不能与当前密码相同，请使用不同的密码',
      };
    }

    // 1) 尝试强制展示改密容器
    await page.evaluate(() => {
      const d = (globalThis as any).document;
      const acc = d?.querySelector?.('#chgAcc_show');
      if (acc && (acc as any).style && (acc as any).style.display === 'none') {
        (acc as any).style.display = '';
      }
      const pwd = d?.querySelector?.('#chgPwd_show');
      if (pwd && (pwd as any).style && (pwd as any).style.display === 'none') {
        (pwd as any).style.display = '';
      }
    }).catch(() => undefined);

    // 2) 优先等待可见；若不可见则继续兜底操作
    let hasVisiblePassword = false;
    try {
      await page.locator('#password').first().waitFor({ state: 'visible', timeout: 5000 });
      hasVisiblePassword = true;
    } catch {}

    const setValue = async (selector: string, value: string) => {
      const field = page.locator(selector).first();
      const count = await field.count().catch(() => 0);
      if (count === 0) return false;
      const visible = await field.isVisible().catch(() => false);
      if (visible) {
        try {
          await field.fill('');
          await this.randomDelay(60, 120);
          if (value) await field.type(value, { delay: Math.floor(Math.random() * 60) + 40 });
          return true;
        } catch {}
      }
      // 不可见，直接用 evaluate 赋值
      try {
        await field.evaluate((el, val) => {
          (el as any).value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        return true;
      } catch {}
      return false;
    };

    // 3) 填写旧/新/确认密码（无论可见性）
    await setValue('#oldpassword', trimmedCurrentPassword);
    await setValue('input[name="oldpassword"]', trimmedCurrentPassword);

    await this.hideLoadingOverlay(page).catch(() => undefined);

    let filledNew = (await setValue('#password', trimmedNewPassword))
      || (await setValue('input[name="password"]', trimmedNewPassword))
      || (await setValue('#pwd', trimmedNewPassword))
      || (await setValue('input[name="pwd"]', trimmedNewPassword));
    let filledRe = (await setValue('#REpassword', trimmedNewPassword))
      || (await setValue('input[name="REpassword"]', trimmedNewPassword))
      || (await setValue('#pwd_confirm', trimmedNewPassword))
      || (await setValue('input[name="pwd_confirm"]', trimmedNewPassword));

    if (!filledNew || !filledRe) {
      // 兜底：在改密容器内批量定位密码输入框并填充
      try {
        const outcome = await page.evaluate((payload: any) => {
          const newPwd = String(payload?.newPwd || '');
          const oldPwd = String(payload?.oldPwd || '');
          const d = (globalThis as any).document as any;
          const container = d.querySelector('.content_chgpwd') || d.querySelector('#chgPwd_show') || d.querySelector('#chgAcc_show');
          if (!container) return { ok: false, reason: 'no_container' };
          const all = Array.from(container.querySelectorAll('input[type="password"], input[name*="password" i]')) as any[];
          const visible = (el: any) => {
            const s = (globalThis as any).getComputedStyle?.(el);
            const r = el.getBoundingClientRect?.();
            return !!s && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && !!r && r.width > 0 && r.height > 0;
          };
          let fields = all.filter(el => visible(el));
          if (fields.length === 0 && all.length > 0) {
            fields = all;
          }
          if (fields.length === 0) return { ok: false, reason: 'no_password_inputs' };
          if (fields.length === 1) {
            fields[0].value = newPwd;
            fields[0].dispatchEvent(new Event('input', { bubbles: true }));
            fields[0].dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, mode: 'single' };
          }
          if (fields.length === 2) {
            fields[0].value = newPwd;
            fields[1].value = newPwd;
            for (const el of fields) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return { ok: true, mode: 'pair' };
          }
          // 假定 [旧, 新, 确认]
          fields[0].value = oldPwd;
          fields[1].value = newPwd;
          fields[2].value = newPwd;
          for (const el of fields.slice(0, 3)) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return { ok: true, mode: 'triple' };
        }, { newPwd: trimmedNewPassword, oldPwd: trimmedCurrentPassword });
        if (outcome?.ok) {
          filledNew = true;
          filledRe = true;
          console.log(`✅(pwd) 通过容器定位填入密码 (mode=${outcome.mode || 'unknown'})`);
        } else {
          console.warn(`⚠️ 通过容器定位密码字段失败: ${outcome?.reason || 'unknown'}`);
        }
      } catch (e) {
        console.warn('⚠️ 通过容器定位密码字段异常:', e);
      }
    }
    if (!filledNew || !filledRe) {
      console.warn('⚠️ 无法填写新密码或确认密码（字段不存在或赋值失败）');
    }

    const submitSelectors = [
      '#greenBtn:visible',
      'div.btn_submit:has-text("提交")',
      '.btn_submit:has-text("确认")',
      '.btn_submit:has-text("確認")',
      'button:has-text("提交")',
      'button:has-text("确认")',
      'button:has-text("確定")',
      'input[type="submit"]',
    ];

    let submitClicked = false;
    for (const selector of submitSelectors) {
      console.log(`🔎(pwd) 检测提交按钮候选: ${selector}`);
      const button = page.locator(selector).first();
      try {
        if ((await button.count().catch(() => 0)) === 0) {
          continue;
        }
        const visible = await button.isVisible({ timeout: 500 }).catch(() => false);
        if (!visible) {
          // 尝试直接用 evaluate 触发 click
          try {
            await button.evaluate((el: any) => el.click());
            console.log(`🖲️(pwd) 直接触发点击: ${selector}`);
            submitClicked = true;
            break;
          } catch {}
          continue;
        }
        console.log(`🖲️(pwd) 点击提交按钮: ${selector}`);
        await button.click({ force: true, timeout: 4000 }).catch(() => undefined);
        submitClicked = true;
        break;
      } catch (clickErr) {
        console.warn('⚠️ 点击改密提交按钮失败:', clickErr);
      }
    }

    if (!submitClicked) {
      // 最后一次兜底：直接查找 #greenBtn 并强制点击
      try {
        const clicked = await page.evaluate(() => {
          const d = (globalThis as any).document;
          const btn = d?.querySelector?.('#greenBtn') as any;
          if (btn) { btn.click(); return true; }
          const anyBtn = d?.querySelector?.('.btn_submit');
          if (anyBtn && typeof (anyBtn as any).click === 'function') { (anyBtn as any).click(); return true; }
          return false;
        });
        if (clicked) {
          console.log('🖲️(pwd) 兜底点击改密提交按钮(#greenBtn/.btn_submit)');
          submitClicked = true;
        }
      } catch {}
      if (!submitClicked) {
        return { success: false, message: '未找到可点击的改密提交按钮' };
      }
    }

    await this.randomDelay(400, 700);

    const errorText = await page
      .locator('#chgpwd_text_error:visible, .text_error:visible')
      .first()
      .textContent()
      .catch(() => null);
    if (errorText && errorText.trim()) {
      const msg = errorText.trim();
      const samePwdHint = /新密码.*不一样|不可与.*相同|must\s*be\s*different|not\s*the\s*same/i;
      if (samePwdHint.test(msg) && trimmedCurrentPassword === trimmedNewPassword) {
        console.log('ℹ️ 检测到“新旧密码相同”提示，目标新密码与现用密码一致，视为已满足目标，跳过改密提交');
        account.password = trimmedNewPassword;
        return { success: true };
      }
      return { success: false, message: msg };
    }

    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null),
      page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined),
    ]);

    await this.randomDelay(400, 700);

    const loginVisible = await page.locator('#usr').isVisible({ timeout: 8000 }).catch(() => false);
    if (!loginVisible) {
      return { success: false, message: '改密提交后未返回登录界面' };
    }

    console.log('✅ 改密页面提交成功，准备重新登录验证');
    account.password = trimmedNewPassword;
    return { success: true };
  }

  private async hideLoadingOverlay(target: Page | Frame): Promise<void> {
    await target.evaluate(() => {
      const selectors = ['#body_loading', '#loading', '.body_loading', '.loading'];
      for (const selector of selectors) {
        const el = (globalThis as any).document?.querySelector?.(selector) as any;
        if (el) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        }
      }
    }).catch(() => undefined);
  }

  private async ensurePasswordForm(page: Page): Promise<boolean> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { console.log(`[[init_pwd.ensure]] attempt=${attempt} url=${page.url()}`); } catch {}
      // 判定1：任何一个改密容器可见即认为已展示
      try {
        const containerVisible = await page
          .locator('.content_chgpwd:visible, #chgPwd_show:visible, #chgAcc_show:visible')
          .count()
          .catch(() => 0);
        console.log(`[[init_pwd.ensure]] containersVisible=${containerVisible}`);
        if (containerVisible > 0) {
          return true;
        }
      } catch {}

      // 判定2：常见密码字段可见
      const passwordField = page.locator('#password:visible, input[name="password"]:visible, #REpassword:visible, input[name="REpassword"]:visible').first();
      try {
        await this.hideLoadingOverlay(page).catch(() => undefined);
        await passwordField.waitFor({ state: 'visible', timeout: 2000 });
        console.log('[[init_pwd.ensure]] password field visible');
        return true;
      } catch {
        // 未出现则尝试唤起改密页面
      }

      // 额外尝试：点击页面上的入口/菜单文案以打开“设置新凭证/修改密码”
      try {
        const triggerTexts = [
          '设置新凭证', '設置新憑證', '设置凭证', '新凭证',
          '修改密码', '變更密碼', '更新密码', '更新憑證',
          '帐号与密码', '账号与密码', '安全设置', '安全',
        ];
        const triggerLocator = page.locator(triggerTexts
          .map(t => `a:has-text("${t}"), button:has-text("${t}"), div:has-text("${t}")`).join(', '));
        const count = await triggerLocator.count().catch(() => 0);
        if (count > 0) {
          console.log(`[[init_pwd.ensure]] triggers found=${count}, try click first`);
          await triggerLocator.first().click({ timeout: 2000, force: true }).catch(() => undefined);
        }
      } catch {}

      await this.acknowledgeCredentialPrompts(page, 4000).catch(() => undefined);
      // 多路径尝试强制打开改密页面（登录页/首页均尝试）
      await page.evaluate(() => {
        const g = (globalThis as any);
        const topWin = g?.top || g;
        // 多种路径尝试：从登录页、首页直接进入改密/改账号
        try { topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {}); } catch {}
        try { topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {}); } catch {}
        try { topWin?.goToPage?.('home_show', 'chgPwd_show', () => undefined, {}); } catch {}
        try { topWin?.goToPage?.('home_show', 'chgAcc_show', () => undefined, {}); } catch {}
        try { topWin?.goToPage?.('chgPwd_show'); } catch {}
        try { topWin?.goToPage?.('chgAcc_show'); } catch {}
        try { topWin?.show_prepasscode?.(); } catch {}
        try {
          // 某些页面会通过事件切换
          if (typeof topWin?.dispatchEvent === 'function') {
            topWin.dispatchEvent('show_prepasscode', {});
            topWin.dispatchEvent('show_back_4pwd', {});
          }
        } catch {}
      }).catch(() => undefined);

      await this.randomDelay(600, 900);
    }

    return false;
  }

  private pickCredentialFields(rawFields: RawFieldInfo[]): CredentialChangeSelectors | null {
    if (!rawFields || rawFields.length === 0) {
      return null;
    }

    const KEY_ACCOUNT = ['账号', '帳號', '帳户', '帳戶', '帐号', 'account', 'acc', 'user id', 'userid', 'username', 'user', 'login id', 'loginid', 'login', 'member', '使用者', '会员'];
    const KEY_PASSWORD = ['密码', '密碼', 'password', 'passcode', 'pwd'];
    const KEY_NEW = ['新', 'new', '重新', '變更', '变更', '更新', '重设', '重設'];
    const KEY_OLD = ['旧', '舊', '原', '目前', '当前', '現有', 'existing', 'current', 'old'];
    const KEY_CONFIRM = [
      '确认',
      '確認',
      '再次',
      '重复',
      '重覆',
      '再',
      'confirm',
      'again',
      'retype',
      're-enter',
      'repassword',
      're_password',
      're-pass',
      're pass',
      'repwd',
    ];

    let newUsername: RawFieldInfo | null = null;
    let oldUsername: RawFieldInfo | null = null;
    let newPassword: RawFieldInfo | null = null;
    let oldPassword: RawFieldInfo | null = null;
    let confirmPassword: RawFieldInfo | null = null;

    const accountCandidates: RawFieldInfo[] = [];
    const passwordCandidates: RawFieldInfo[] = [];

    for (const field of rawFields) {
      if (!field.visible) {
        continue;
      }

      const lowerType = (field.type || '').toLowerCase();
      if (['button', 'submit', 'checkbox', 'radio'].includes(lowerType)) {
        continue;
      }

      const combined = this.normalizeFieldText(field);
      const isAccountField = this.matchKeywords(combined, KEY_ACCOUNT);
      const isPasswordField = field.type === 'password' || this.matchKeywords(combined, KEY_PASSWORD);
      const isNew = this.matchKeywords(combined, KEY_NEW);
      const isOld = this.matchKeywords(combined, KEY_OLD);
      const isConfirm = this.matchKeywords(combined, KEY_CONFIRM);

      if (isAccountField) {
        if (!newUsername && isNew) {
          newUsername = field;
        } else if (!oldUsername && isOld) {
          oldUsername = field;
        } else {
          accountCandidates.push(field);
        }
        continue;
      }

      if (isPasswordField) {
        if (!newPassword && isNew && !isConfirm) {
          newPassword = field;
        } else if (!confirmPassword && isConfirm) {
          confirmPassword = field;
        } else if (!oldPassword && isOld) {
          oldPassword = field;
        } else {
          passwordCandidates.push(field);
        }
      }
    }

    if (!newUsername && accountCandidates.length > 0) {
      newUsername = accountCandidates.shift() || null;
    }

    if (!newPassword && passwordCandidates.length > 0) {
      newPassword = passwordCandidates.shift() || null;
    }

    if (!confirmPassword && passwordCandidates.length > 0) {
      confirmPassword = passwordCandidates.shift() || null;
    }

    // 兜底：直接通过 ID/name 识别皇冠改密表单的固定字段
    if (!newPassword || !confirmPassword) {
      for (const field of rawFields) {
        if (!field.visible) continue;
        if (field.type !== 'password') continue;

        // #password 或 name="password" 通常是新密码
        if (!newPassword && (field.id === 'password' || field.name === 'password')) {
          newPassword = field;
          continue;
        }

        // #REpassword 或 name="REpassword" 通常是确认密码
        if (!confirmPassword && (field.id === 'repassword' || field.name === 'repassword' || field.id === 'confirmpassword' || field.name === 'confirmpassword')) {
          confirmPassword = field;
          continue;
        }
      }
    }

    const hasNewUsername = !!newUsername;
    const hasPasswordPair = !!(newPassword && confirmPassword);

    let formType: CredentialChangeFormType | null = null;

    if (hasNewUsername && !hasPasswordPair) {
      formType = 'loginId';
    } else if (hasPasswordPair) {
      formType = 'password';
    }

    if (!formType) {
      return null;
    }

    const sectionKey =
      newUsername?.sectionKey ||
      newPassword?.sectionKey ||
      confirmPassword?.sectionKey ||
      oldUsername?.sectionKey ||
      oldPassword?.sectionKey ||
      undefined;

    return {
      formType,
      newUsername: newUsername ? `[data-codex-field="${newUsername.key}"]` : undefined,
      newPassword: newPassword ? `[data-codex-field="${newPassword.key}"]` : undefined,
      confirmPassword: confirmPassword ? `[data-codex-field="${confirmPassword.key}"]` : undefined,
      oldUsername: oldUsername ? `[data-codex-field="${oldUsername.key}"]` : undefined,
      oldPassword: oldPassword ? `[data-codex-field="${oldPassword.key}"]` : undefined,
      sectionKey,
    };
  }

  private pickSubmitAction(rawActions: RawActionInfo[], preferredSectionKey?: string): string | undefined {
    if (!rawActions || rawActions.length === 0) {
      return undefined;
    }

    const KEY_SUBMIT = ['确认', '確認', '确定', '確定', '提交', '送出', '变更', '修改', '更新', 'ok', 'submit', 'save'];

    const visibleActions = rawActions.filter(action => action.visible);

    const orderedActions = preferredSectionKey
      ? [
        ...visibleActions.filter(action => action.sectionKey && action.sectionKey === preferredSectionKey),
        ...visibleActions.filter(action => !action.sectionKey || action.sectionKey !== preferredSectionKey),
      ]
      : visibleActions;

    for (const action of orderedActions) {
      const text = (action.text || '').toLowerCase();
      if (this.matchKeywords(text, KEY_SUBMIT)) {
        return `[data-codex-action="${action.key}"]`;
      }
    }

    const fallback = orderedActions.find(action => action.tagName === 'button' || action.type === 'submit');
    if (fallback) {
      return `[data-codex-action="${fallback.key}"]`;
    }

    return undefined;
  }

  private async extractCredentialChangeSelectors(target: Page | Frame, contextDescription: string): Promise<CredentialChangeDetectionResult | null> {
    try {
      const extraction = await target.evaluate(({
        fieldAttr,
        actionAttr,
        sectionAttr,
      }: { fieldAttr: string; actionAttr: string; sectionAttr: string }) => {
        const doc = (globalThis as any).document as any;
        if (!doc?.querySelectorAll) {
          return { fields: [], actions: [] };
        }

        const ensureSectionKey = (element: any) => {
          if (!element || typeof element.closest !== 'function') {
            return '';
          }
          const sectionSelectors = [
            '.chg_acc',
            '.chg_pwd',
            '.chgpwd',
            '.chgid_input',
            '.input_chgpwd',
            '.content_chgpwd',
            '#chgAcc_show',
            '#chgPwd_show',
            'form',
          ];
          for (const selector of sectionSelectors) {
            const container = element.closest(selector);
            if (container) {
              const existing = container.getAttribute?.(sectionAttr);
              if (existing) {
                return existing;
              }
              const key = `${sectionAttr}-${Math.random().toString(36).slice(2, 10)}`;
              container.setAttribute?.(sectionAttr, key);
              return key;
            }
          }
          const fallback = element.closest?.('[id]') || element.parentElement;
          if (fallback) {
            const existing = fallback.getAttribute?.(sectionAttr);
            if (existing) {
              return existing;
            }
            const key = `${sectionAttr}-${Math.random().toString(36).slice(2, 10)}`;
            fallback.setAttribute?.(sectionAttr, key);
            return key;
          }
          return '';
        };

        const inputs = Array.from(doc.querySelectorAll('input') || []);
        const fields = inputs.map((rawInput: any, index: number) => {
          const input = rawInput as any;
          const key = `${fieldAttr}-${index}-${Math.random().toString(36).slice(2, 8)}`;
          input.setAttribute?.(fieldAttr, key);

          const labelElement = typeof input.closest === 'function' ? input.closest('label') : null;
          const parentText = input.parentElement ? (input.parentElement.textContent || '') : '';
          const siblingText = input.parentElement?.previousElementSibling ? (input.parentElement.previousElementSibling.textContent || '') : '';
          const ancestor = typeof input.closest === 'function' ? input.closest('tr, .form-group, .box_help_btn, .box_help, .box, .content, .wrapper, .row, .item') : null;
          const ancestorText = ancestor ? (ancestor.textContent || '') : '';

          const rect = typeof input.getBoundingClientRect === 'function' ? input.getBoundingClientRect() : { width: 0, height: 0 };
          const win = (globalThis as any).window as any;
          const style = win?.getComputedStyle ? win.getComputedStyle(input) : { display: 'block', visibility: 'visible', opacity: '1' };
          const opacityValue = parseFloat((style.opacity as string) || '1');
          const visible = !(style.display === 'none' || style.visibility === 'hidden' || opacityValue === 0 || rect.width === 0 || rect.height === 0);
          const sectionKey = ensureSectionKey(input);

          return {
            key,
            type: (input.getAttribute?.('type') || '').toLowerCase(),
            name: (input.getAttribute?.('name') || '').toLowerCase(),
            id: (input.getAttribute?.('id') || '').toLowerCase(),
            placeholder: (input.getAttribute?.('placeholder') || '').toLowerCase(),
            ariaLabel: (input.getAttribute?.('aria-label') || '').toLowerCase(),
            labelText: ((labelElement?.textContent || '').trim() || '').toLowerCase(),
            surroundingText: [parentText, siblingText, ancestorText]
              .filter(Boolean)
              .map(text => String(text).trim().toLowerCase())
              .join(' '),
            visible,
            sectionKey,
          } as RawFieldInfo;
        });

        const actionElements = Array.from(
          doc.querySelectorAll('button, input[type="submit"], a, [role="button"], .btn_submit, .btn_cancel, .btn_confirm, .btn_choose') || []
        );
        const actions = actionElements.map((rawElement: any, index: number) => {
          const element = rawElement as any;
          const key = `${actionAttr}-${index}-${Math.random().toString(36).slice(2, 8)}`;
          element.setAttribute?.(actionAttr, key);
          const text = ((element.textContent || element.getAttribute?.('value') || '') ?? '').trim().toLowerCase();
          const type = (element.getAttribute?.('type') || '').toLowerCase();
          const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { width: 0, height: 0 };
          const win = (globalThis as any).window as any;
          const style = win?.getComputedStyle ? win.getComputedStyle(element) : { display: 'block', visibility: 'visible', opacity: '1' };
          const opacityValue = parseFloat((style.opacity as string) || '1');
          const visible = !(style.display === 'none' || style.visibility === 'hidden' || opacityValue === 0 || rect.width === 0 || rect.height === 0);
          const sectionKey = ensureSectionKey(element);
          return {
            key,
            text,
            type,
            tagName: (element.tagName || '').toLowerCase(),
            visible,
            sectionKey,
          } as RawActionInfo;
        });

        return { fields, actions };
      }, { fieldAttr: 'data-codex-field', actionAttr: 'data-codex-action', sectionAttr: 'data-codex-section' });

      if (!extraction || !extraction.fields?.length) {
        return null;
      }

      const selectors = this.pickCredentialFields(extraction.fields);
      if (!selectors) {
        return null;
      }

      const submitSelector = this.pickSubmitAction(extraction.actions, selectors.sectionKey);
      if (submitSelector) {
        selectors.submitButton = submitSelector;
      }

      if (selectors.formType === 'loginId') {
        const checkAction = extraction.actions.find(action => this.matchKeywords(action.text, ['check', '检查', '檢查', '檢測', '检测']));
        if (checkAction) {
          selectors.checkButton = `[data-codex-action="${checkAction.key}"]`;
        }
      }

      return {
        target,
        selectors,
        contextDescription,
        rawFields: extraction.fields,
        rawActions: extraction.actions,
      };
    } catch (error) {
      console.warn('⚠️ 提取改密表单元素失败:', error);
      return null;
    }
  }

  private async detectCredentialChangeForm(page: Page, timeout = 20000): Promise<CredentialChangeDetectionResult | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const contexts: Array<Page | Frame> = [page, ...page.frames()];
      for (const ctx of contexts) {
        const contextDescription = ctx === page
          ? 'page:main'
          : `frame:${(ctx as any).name?.() || (ctx as any).url?.() || 'unknown'}`;
        const detection = await this.extractCredentialChangeSelectors(ctx, contextDescription);
        if (detection) {
          console.log('🔍 检测到皇冠改密页面元素。上下文:', detection.contextDescription);
          return detection;
        }
      }
      await this.randomDelay(250, 400);
    }
    return null;
  }


  private async typeIntoField(target: Page | Frame, selector: string, value: string) {
    if (!selector) {
      return;
    }
    const locator = target.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 8000 });
    await locator.click({ force: true }).catch(() => undefined);
    await locator.fill('');
    await this.randomDelay(120, 300);
    await locator.type(value, { delay: 80 }).catch(async () => {
      await locator.evaluate((el, text) => {
        const element = el as any;
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('keyup', { bubbles: true }));
      }, value);
    });
    await locator.evaluate((el) => {
      const element = el as any;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('keyup', { bubbles: true }));
    }).catch(() => undefined);

    await target.evaluate(() => {
      const doc = (globalThis as any).document;
      if (!doc) return;
      const input = doc.querySelector('#username') as any;
      if (input) {
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const checkBtn = doc.querySelector('#check_name') as any;
      if (checkBtn && checkBtn.classList && checkBtn.classList.contains('unable')) {
        checkBtn.classList.remove('unable');
      }
    }).catch(() => undefined);
  }

  private async acknowledgeCredentialPrompts(page: Page, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      let handled = false;

      // 过去这里会点击“否”拒绝四位密码；为避免误判，取消该操作

      // 处理改密相关的确认按钮（皇冠hga038特有）
      const buttonCandidates = page.locator(
        '#C_yes_btn:visible, #C_ok_btn:visible, #ok_btn:visible, #yes_btn:visible, ' +
        '.popup_bottom .btn_submit:visible, .box_help_btn .btn_submit:visible, ' +
        '#kick_ok_btn:visible, #info_close:visible, #R_info_close:visible, #message_ok:visible'
      );

      const count = await buttonCandidates.count().catch(() => 0);
      if (count > 0) {
        console.log(`🔎 检测到确认弹窗按钮候选数量: ${count}`);
        try {
          const firstHandle = buttonCandidates.first();
          const text = await firstHandle.innerText().catch(() => '');
          console.log(`🖲️ 尝试点击确认按钮: ${text || '[无文本]'} (first)`);
          await firstHandle.click({ force: true, timeout: 4000 });
          console.log('✅ 已点击确认按钮');
          handled = true;
        } catch (err) {
          console.warn('⚠️ 点击改密提示确认按钮失败:', err);
        }
        await this.randomDelay(500, 800);
      }

      // 检查改密容器是否已显示
      const chgAccVisible = await page.locator('#chgAcc_show:visible, #chgPwd_show:visible').count().catch(() => 0);
      if (chgAccVisible > 0) {
        console.log('✅ 改密容器已显示');
        await this.randomDelay(500, 1000);
        break;
      }

      if (!handled) {
        const popupCount = await page
          .locator('#C_alert_ok:visible, #alert_ok:visible, #C_msg_ok:visible, #msg_ok:visible, #alert_kick:visible, #C_alert_confirm:visible')
          .count()
          .catch(() => 0);
        if (popupCount === 0) {
          break;
        }
      }

      await this.randomDelay(250, 400);
    }
  }

  private async resolvePostLoginState(page: Page): Promise<'success' | 'force_logout' | 'pending' | 'password_change'> {
    await this.acknowledgeCredentialPrompts(page, 5000).catch(() => undefined);

    const kickVisible = await page.locator('#alert_kick:visible').count().catch(() => 0);
    if (kickVisible > 0) {
      await page.locator('#kick_ok_btn:visible').click({ timeout: 5000 }).catch(() => undefined);
      await this.randomDelay(400, 700);
      const pwdVisibleAfterKick = await page.locator('#chgAcc_show:visible').count().catch(() => 0);
      if (pwdVisibleAfterKick > 0) {
        return 'success';
      }
      try {
        await page.goto(LOGIN_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('#usr', { timeout: 20000 }).catch(() => undefined);
      } catch (gotoErr) {
        console.warn('⚠️ 处理强制登出后刷新登录页失败:', gotoErr);
      }
      return 'force_logout';
    }

    const homeVisible = await page.locator('#home_show').isVisible().catch(() => false);
    const loginVisible = await page.locator('#acc_show').isVisible().catch(() => false);
    if (homeVisible && !loginVisible) {
      return 'success';
    }

    const pwdFormVisible = await page.locator('#chgAcc_show:visible').count().catch(() => 0);
    if (pwdFormVisible > 0) {
      return 'success';
    }

    const forcePwdChangeVisible = await page.locator('.content_chgpwd:visible, #chgPwd_show:visible').count().catch(() => 0);
    if (forcePwdChangeVisible > 0) {
      return 'password_change';
    }

    return 'pending';
  }

  private async applyCredentialChange(
    detection: CredentialChangeDetectionResult,
    currentAccount: CrownAccount,
    nextCredentials: { username: string; password: string },
    page: Page,
  ): Promise<CredentialChangeOutcome> {
    const { target, selectors } = detection;

    console.log('🛠️ 开始填写改密表单');

    let usernameChanged = false;
    let passwordChanged = false;

    if (selectors.formType === 'loginId') {
      let usernameSelector = selectors.newUsername;
      if (!usernameSelector) {
        const fallbackSelectors = ['#username', '#chgAcc_show .userid', 'input.userid'];
        for (const fallback of fallbackSelectors) {
          const count = await target.locator(fallback).count().catch(() => 0);
          if (count > 0) {
            usernameSelector = fallback;
            break;
          }
        }
      }

      if (!usernameSelector) {
        return {
          success: false,
          message: '未找到新的登录账号输入框，无法继续初始化',
          usernameChanged,
          passwordChanged,
          formType: selectors.formType,
        };
      }

      const loginIdLocator = target.locator(usernameSelector).first();
      const loginIdVisible = await loginIdLocator.isVisible().catch(() => false);
      if (!loginIdVisible) {
        console.log('ℹ️ 登录账号输入框不可见，默认账号已更新，跳过登录账号变更阶段');
        return {
          success: true,
          message: '登录账号无需更新',
          usernameChanged,
          passwordChanged,
          formType: selectors.formType,
          skipLoginId: true,
        };
      }

      await this.typeIntoField(target, usernameSelector, nextCredentials.username.trim());

      // 移除检查按钮的 unable 类（皇冠hga038特有）
      await target.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return;
        const checkBtn = doc.querySelector('#check_name');
        if (checkBtn && checkBtn.classList && checkBtn.classList.contains('unable')) {
          checkBtn.classList.remove('unable');
        }
      }).catch(() => undefined);

      await this.randomDelay(300, 500);

      const checkSelectors: string[] = [];
      if (selectors.checkButton) {
        checkSelectors.push(selectors.checkButton);
      }
      // 皇冠hga038特定的检查按钮选择器
      checkSelectors.push('#check_name:visible', '.btn_choose:visible');

      if (!selectors.checkButton) {
        checkSelectors.push('#login_btn');
      }

      let checkClicked = false;
      for (const checkSelector of checkSelectors) {
        console.log(`🔎 检测检查按钮候选: ${checkSelector}`);
        try {
          const checkButton = target.locator(checkSelector).first();
          if ((await checkButton.count()) === 0) {
            continue;
          }
          if (await checkButton.isVisible({ timeout: 500 }).catch(() => false)) {
            console.log(`🔍 点击检查按钮: ${checkSelector}`);
            await checkButton.click({ timeout: 5000, force: true }).catch(() => undefined);
            checkClicked = true;
            await this.randomDelay(800, 1200);
            break;
          }
        } catch {
          // ignore individual selector failures
        }
      }

      if (!checkClicked) {
        console.log('⚠️ 未找到可点击的检查按钮，继续执行');
      }

      const errorLocator = target.locator('#chgid_text_error');
      const hasError = await errorLocator.isVisible({ timeout: 4000 }).catch(() => false);
      if (hasError) {
        const errorText = (await errorLocator.textContent().catch(() => ''))?.trim();
        if (errorText) {
          const normalized = errorText.toLowerCase();
          const isPositive = /(无人使用|可使用|可用|available|尚未使用)/.test(normalized);
          const isNegative = /(已有人|已被|重复|不可|错误|錯誤|失败|失敗|不符|請重新|格式不符)/.test(normalized);
          if (isPositive && !isNegative) {
            console.log(`✅ 登录账号校验通过: ${errorText}`);
          } else {
            return {
              success: false,
              message: errorText,
              usernameChanged,
              passwordChanged,
              formType: selectors.formType,
            };
          }
        }
      }

      usernameChanged = true;
      currentAccount.username = nextCredentials.username.trim();
    } else {
      if (selectors.oldUsername) {
        await this.typeIntoField(target, selectors.oldUsername, (currentAccount.username || '').trim());
      }
      if (selectors.oldPassword) {
        await this.typeIntoField(target, selectors.oldPassword, (currentAccount.password || '').trim());
      }

      if (!selectors.newPassword || !selectors.confirmPassword) {
        return {
          success: false,
          message: '未找到新的皇冠密码输入框',
          usernameChanged,
          passwordChanged,
          formType: selectors.formType,
        };
      }

      if (selectors.newUsername) {
        await this.typeIntoField(target, selectors.newUsername, nextCredentials.username.trim());
        usernameChanged = true;
        currentAccount.username = nextCredentials.username.trim();
      }

      await this.typeIntoField(target, selectors.newPassword, nextCredentials.password.trim());
      await this.typeIntoField(target, selectors.confirmPassword, nextCredentials.password.trim());
      passwordChanged = true;
    }

    const submitCandidates: string[] = [];
    if (selectors.submitButton) {
      submitCandidates.push(selectors.submitButton);
    }

    // 皇冠hga038特定的提交按钮（优先级从高到低）
    if (selectors.formType === 'loginId') {
      submitCandidates.push(
        '#login_btn:visible',                    // 皇冠创建账号提交按钮（DIV元素）
        '.btn_submit:visible',                   // 通用提交按钮类
      );
    } else {
      submitCandidates.push(
        '#greenBtn:visible',                     // 皇冠改密提交按钮
        '.btn_submit:visible',                   // 通用提交按钮类
      );
    }

    submitCandidates.push(
      '#login_btn',
      '#greenBtn',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("确认")',
      'button:has-text("確認")',
      'button:has-text("确定")',
      'button:has-text("確定")',
      'a:has-text("确认")',
      'a:has-text("確認")',
      '.btn_submit:has-text("提交")',
      '.btn_submit:has-text("确认")',
      '.btn_submit:has-text("確認")',
      'div.btn_submit:has-text("提交")',
      'div.btn_submit:has-text("确认")',
      'div.btn_submit:has-text("確認")',
      'div:has-text("提交")',
    );

    let submitFound = false;
    for (const selector of submitCandidates) {
      console.log(`🔎 检测提交按钮候选: ${selector}`);
      try {
        const button = target.locator(selector).first();
        if ((await button.count()) === 0) {
          continue;
        }

        await button.scrollIntoViewIfNeeded().catch(() => undefined);

        const dialogPromise = page.waitForEvent('dialog', { timeout: 15000 }).catch(() => null);

        try {
          console.log(`🖲️ 点击提交按钮: ${selector}`);
          await button.click({ timeout: 8000, force: true });
        } catch (clickErr) {
          console.warn(`⚠️ 点击提交按钮失败 (${selector})，错误:`, clickErr);
          continue;
        }

        submitFound = true;
        const dialog = await dialogPromise;
        if (dialog) {
          const dialogMessage = dialog.message();
          console.log('📢 改密弹窗提示:', dialogMessage);
          await dialog.accept().catch(() => undefined);
          if (/失败|錯誤|error|无效|不符|重复|重复/.test(dialogMessage)) {
            return {
              success: false,
              message: dialogMessage,
              usernameChanged,
              passwordChanged,
              formType: selectors.formType,
            };
          }
        }

        break;
      } catch (error) {
        console.warn(`⚠️ 尝试使用提交选择器 ${selector} 时失败:`, error);
      }
    }

    if (!submitFound) {
      return {
        success: false,
        message: '未找到改密提交按钮，请人工确认页面结构',
        usernameChanged,
        passwordChanged,
        formType: selectors.formType,
      };
    }

    await Promise.allSettled([
      page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => null),
      page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined),
    ]);

    await this.acknowledgeCredentialPrompts(page).catch(() => undefined);

    if (selectors.formType === 'loginId') {
      await page.locator('#password[type="password"], input[name="password"][type="password"]').first().waitFor({
        timeout: 12000,
        state: 'visible',
      }).catch(() => undefined);
    }

    await this.randomDelay(600, 1000);

    const loginVisible = await page.locator('#usr').isVisible({ timeout: 8000 }).catch(() => false);

    if (!loginVisible) {
      if (selectors.formType === 'loginId') {
        console.log('ℹ️ 登录账号更新已提交，等待继续执行后续初始化步骤');
        return {
          success: true,
          message: '登录账号更新完成',
          usernameChanged,
          passwordChanged,
          formType: selectors.formType,
        };
      }

      const errorCandidate = await target
        .locator('.text_danger, .text-error, .error, .error-text, .msg-error, .alert-danger, .note_msg')
        .first()
        .textContent()
        .catch(() => null);

      if (errorCandidate) {
        const trimmed = errorCandidate.trim();
        if (trimmed) {
          return { success: false, message: trimmed, usernameChanged, passwordChanged, formType: selectors.formType };
        }
      }

      const dialogInfo = await page.evaluate(() => {
        const doc = (globalThis as any).document as any;
        const container = doc?.querySelector?.('.pop_box, .alert_box, #alert_msg');
        return container ? (container.textContent || '').trim() : null;
      }).catch(() => null);

      if (dialogInfo && /失败|錯誤|error|无效|不符/.test(dialogInfo)) {
        return { success: false, message: dialogInfo, usernameChanged, passwordChanged, formType: selectors.formType };
      }

      return {
        success: false,
        message: '未检测到改密成功提示，请人工核对是否已完成',
        usernameChanged,
        passwordChanged,
        formType: selectors.formType,
      };
    }

    console.log('✅ 改密已提交，页面返回登录界面');
    return {
      success: true,
      message: '改密已完成，将使用新凭证重新登录验证',
      usernameChanged,
      passwordChanged,
      formType: selectors.formType,
    };
  }


  private async performLoginWithCredentials(page: Page, username: string, password: string, account?: CrownAccount): Promise<{ success: boolean; message?: string }> {
    const ensureLoginForm = async () => {
      try {
        await page.waitForSelector('#usr', { timeout: 8000 });
      } catch {
        await page.goto(LOGIN_PAGE_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForSelector('#usr', { timeout: 20000 });
      }
    };

    let lastFailureMessage: string | null = null;
    this.lastPasscodeRejected = false;
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await ensureLoginForm();

      await this.humanLikeType(page, '#usr', username.trim());
      await this.randomDelay(300, 600);
      await this.humanLikeType(page, '#pwd', password.trim());
      await this.randomDelay(500, 900);

      const loginButton = page.locator('#btn_login').first();
      if ((await loginButton.count()) === 0) {
        return { success: false, message: '未找到登录按钮' };
      }

      try {
        await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        await loginButton.waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
      }

      await loginButton.scrollIntoViewIfNeeded().catch(() => undefined);

      await page.waitForFunction((selector) => {
        const g = globalThis as any;
        const doc = g?.document as any;
        if (!doc?.querySelector) {
          return false;
        }
        const el = doc.querySelector(selector);
        if (!el) {
          return false;
        }
        const style = g?.getComputedStyle ? g.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          return false;
        }
        const rect = el.getBoundingClientRect?.();
        return !!rect && rect.width > 0 && rect.height > 0;
      }, '#btn_login', { timeout: 10000 }).catch(() => undefined);

      try {
        await loginButton.click({ delay: 120 });
      } catch (clickError) {
        console.warn('⚠️ 登录按钮点击失败，尝试使用 force 选项:', clickError);
        await loginButton.click({ delay: 120, force: true }).catch((forceError) => {
          throw forceError;
        });
      }

      // 先尝试处理登录页的通用提示（记住账号/浏览器推荐等），优先点击“是/确认”
      await this.handlePostLoginPrompts(page).catch(() => undefined);

      let loginResult = await this.waitForLoginResult(page, 18000);
      if (account) {
        loginResult = await this.resolvePasscodePrompt(page, account, loginResult);
      } else if (loginResult.status === 'success' && loginResult.message === 'passcode_prompt') {
        return { success: false, message: 'passcode_prompt' };
      }

      if (loginResult.status === 'success') {
        await this.handlePostLoginPrompts(page).catch(() => undefined);
        return { success: true };
      }

      if (loginResult.status === 'error') {
        const failureMessage = this.composeLoginFailureMessage(loginResult.message, loginResult.debug);
        if (loginResult.message === 'force_logout') {
        const state = await this.resolvePostLoginState(page);
        if (state === 'success') {
          await this.handlePostLoginPrompts(page).catch(() => undefined);
          return { success: true };
        }
        if (state === 'password_change') {
          return { success: false, message: 'password_change_required' };
        }
        await this.randomDelay(6000, 9000);
        continue;
      }
        return { success: false, message: failureMessage };
      }

      if (loginResult.status === 'timeout') {
        const timeoutMessage = this.composeLoginFailureMessage(loginResult.message, loginResult.debug, '登录超时，请稍后重试');
        const fallbackState = await this.resolvePostLoginState(page);
        if (fallbackState === 'success') {
          await this.handlePostLoginPrompts(page).catch(() => undefined);
          return { success: true };
        }
        if (fallbackState === 'force_logout') {
          continue;
        }
        if (fallbackState === 'password_change') {
          return { success: false, message: 'password_change_required' };
        }
        lastFailureMessage = timeoutMessage;
      } else {
        lastFailureMessage = this.composeLoginFailureMessage(loginResult.message, loginResult.debug);
      }

      await this.randomDelay(400, 700);
    }

    if (await this.isPasscodePromptVisible(page).catch(() => false)) {
      console.log('[performLoginWithCredentials] passcode prompt remains visible, aborting with prompt');
      return { success: false, message: 'passcode_prompt' };
    }
    console.log('[performLoginWithCredentials] returning default failure:', lastFailureMessage);
    return { success: false, message: lastFailureMessage || '登录失败，请检查账号或稍后再试' };
  }

  private async initBrowser() {
    try {
      this.browser = await chromium.launch({
        headless: isHeadless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      });
      console.log('🚀 Playwright浏览器启动成功');
    } catch (error) {
      console.error('❌ 浏览器启动失败:', error);
      throw error;
    }
  }

  // 创建反检测浏览器上下文
  private async createStealthContext(account: CrownAccount, storageState?: BrowserContextOptions['storageState']): Promise<BrowserContext> {
    let browser: Browser;

    const usePerAccountProxy = !!(account.proxy_enabled && account.proxy_host && account.proxy_port && account.proxy_type);

    const launchProxyBrowser = async () => {
      const protocol = (account.proxy_type || '').toLowerCase();
      const server = `${protocol}://${account.proxy_host}:${account.proxy_port}`;
      const newBrowser = await chromium.launch({
        headless: isHeadless,
        proxy: {
          server,
          username: account.proxy_username || undefined,
          password: account.proxy_password || undefined,
        },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      });
      this.accountBrowsers.set(account.id, newBrowser);
      console.log(`🌐 已为账号 ${account.username} 启用专用代理浏览器: ${server}`);
      return newBrowser;
    };

    let usingProxyBrowser = false;

    if (usePerAccountProxy) {
      const existing = this.accountBrowsers.get(account.id);
      if (existing && existing.isConnected()) {
        browser = existing;
        usingProxyBrowser = true;
      } else {
        try {
          browser = await launchProxyBrowser();
          usingProxyBrowser = true;
        } catch (e) {
          console.error('❌ 启动代理浏览器失败:', e);
          browser = await this.ensureBrowser();
          usingProxyBrowser = false;
        }
      }
    } else {
      browser = await this.ensureBrowser();
    }

    const contextOptions: BrowserContextOptions = {
      userAgent: account.user_agent || this.generateUserAgent(account.device_type || 'desktop'),
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      permissions: [],
      javaScriptEnabled: true,
      bypassCSP: true,
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    };
    if (storageState) {
      contextOptions.storageState = storageState;
    }

    // 代理已在浏览器层处理（per-account 浏览器）。context 无需再次配置。

    const viewportConfig = this.getViewportConfig(account.device_type);
    contextOptions.viewport = viewportConfig.viewport;
    contextOptions.deviceScaleFactor = viewportConfig.deviceScaleFactor;
    contextOptions.isMobile = viewportConfig.isMobile;
    contextOptions.hasTouch = viewportConfig.hasTouch;

    let context: BrowserContext | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        context = await browser.newContext(contextOptions);
        break;
      } catch (error) {
        console.error('❌ 创建浏览器上下文失败:', error);
        if (attempt === 1) {
          throw error;
        }

        if (usingProxyBrowser) {
          const existing = this.accountBrowsers.get(account.id);
          if (existing) {
            try { await existing.close(); } catch {}
            this.accountBrowsers.delete(account.id);
          }
          try {
            browser = await launchProxyBrowser();
            usingProxyBrowser = true;
          } catch (launchError) {
            console.error('❌ 重新启动代理浏览器失败，回退到共享浏览器:', launchError);
            browser = await this.ensureBrowser();
            usingProxyBrowser = false;
          }
        } else {
          if (!usePerAccountProxy && this.browser) {
            try { await this.browser.close(); } catch {}
            this.browser = null;
          }
          browser = await this.ensureBrowser();
        }
      }
    }

    if (!context) {
      throw new Error('无法创建浏览器上下文');
    }

    // 注入反检测脚本
    await context.addInitScript(`
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            {
              name: 'Chrome PDF Plugin',
              filename: 'internal-pdf-viewer',
              description: 'Portable Document Format',
            },
          ],
        });

        const permissions = window.navigator.permissions;
        if (permissions && permissions.query) {
          const originalQuery = permissions.query.bind(permissions);
          permissions.query = (parameters) => {
            const name = parameters?.name;
            if (name === 'notifications') {
              const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
              return Promise.resolve({ state: permission });
            }
            return originalQuery(parameters);
          };
        }

        if (window.screen) {
          Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
          Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });
        }
      } catch (stealthError) {
        console.warn('⚠️ 反检测脚本执行异常:', stealthError);
      }
    `);

    return context;
  }

  // 生成用户代理字符串
  private generateUserAgent(deviceType: string): string {
    const chromeVersion = '120.0.0.0';
    const webkitVersion = '537.36';

    switch (deviceType) {
      case 'iPhone 14':
        return `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1`;
      case 'iPhone 13':
        return `Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.7 Mobile/15E148 Safari/604.1`;
      case 'Android':
        return `Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/${webkitVersion}`;
      default:
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkitVersion}`;
    }
  }

  // 随机延迟
  private async randomDelay(min: number = 1000, max: number = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private extractSnapshotTimestamp(fileName: string): number {
    const match = fileName.match(/-(\d+)\.(?:html|png)$/);
    if (!match) {
      return 0;
    }
    return Number(match[1]) || 0;
  }

  private async pruneSnapshotArtifacts(prefixes: string[], keep = 6): Promise<void> {
    try {
      const entries = await fs.readdir('.', { withFileTypes: true });
      const targets = entries
        .filter(entry => entry.isFile() && prefixes.some(prefix => entry.name.startsWith(prefix)))
        .map(entry => ({ name: entry.name, timestamp: this.extractSnapshotTimestamp(entry.name) }))
        .sort((a, b) => b.timestamp - a.timestamp);

      if (targets.length <= keep) {
        return;
      }

      const toDelete = targets.slice(keep);
      await Promise.allSettled(toDelete.map(item => fs.unlink(item.name)));
    } catch (err) {
      console.warn('⚠️ 清理旧的调试快照失败:', err);
    }
  }

  private async collectLoginDebugState(page: Page) {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await page.evaluate(() => {
          const topWin = (globalThis as any).top || (globalThis as any);
          const doc = (globalThis as any).document;
          const acc = doc?.querySelector?.('#acc_show');
          const style = acc ? ((globalThis as any).getComputedStyle?.(acc) || acc.style || {}) : {};
          const passcodeContainers = doc?.querySelectorAll?.('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area');
          const hasPasscodeContainer = !!(passcodeContainers && passcodeContainers.length > 0);
          const alertVisible = !!doc?.querySelector?.('#C_alert_confirm.on, #alert_confirm.on, .popup_content.on, .pop_box.on');
          const accHtml = acc?.outerHTML || null;
          const loginFormVisible = acc ? style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' : null;
          return {
            accDisplay: style.display || null,
            accClass: acc?.className || null,
            loginFormVisible,
            accHtml,
            alertVisible,
            hasPasscodeContainer,
            userData: {
              msg: topWin?.userData?.msg,
              four_pwd: topWin?.userData?.four_pwd,
              mid: topWin?.userData?.mid,
              abox4pwd_notshow: topWin?.userData?.abox4pwd_notshow,
              passwd_safe: topWin?.userData?.passwd_safe,
              errorCode: topWin?.errorCode,
            },
            memSet: {
              passcode: topWin?.memSet?.passcode,
              fourPwd: topWin?.memSet?.fourPwd,
            },
            requestRetry: topWin?.RequestRetry,
            topMessage: topWin?.userData?.msg || topWin?.memSet?.msg,
            currentUrl: (globalThis as any).location?.href || null,
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retriable = /execution context was destroyed|cannot find context/i.test(message);
        if (retriable && attempt < maxAttempts - 1) {
          await this.randomDelay(200, 400);
          continue;
        }
        throw err;
      }
    }
    return null;
  }

  private normalizeLoginMessage(raw?: string | null): string | undefined {
    if (!raw) {
      return undefined;
    }
    const trimmed = String(raw).trim();
    if (!trimmed) {
      return undefined;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'force_logout') {
      return '检测到系统强制登出提示，请稍后重试';
    }
    if (lower === 'passcode_prompt') {
      return '当前账号需要输入四位安全码，请在人工模式下完成后再试';
    }
    if (lower === 'passcode_dismiss_failed') {
      return '无法自动拒绝四位安全码，请人工处理安全码后再试';
    }
    if (lower === 'passcode_post_state_pending') {
      return '已拒绝四位安全码，但系统仍未进入主页，请人工登录确认';
    }
    if (lower === 'password_change_required') {
      return '皇冠提示需要修改密码，请在系统中执行“初始化账号”完成改密后再尝试登录';
    }
    if (lower === 'waitforloginresult timeout') {
      return '登录检测超时';
    }

    return trimmed;
  }

  private formatLoginDebug(debug?: Record<string, any>): string | undefined {
    if (!debug) {
      return undefined;
    }

    const entries: string[] = [];
    const push = (key: string) => {
      const value = (debug as any)[key];
      if (value === undefined || value === null) {
        return;
      }
      if (typeof value === 'boolean') {
        entries.push(`${key}=${value ? 'true' : 'false'}`);
        return;
      }
      if (typeof value === 'object') {
        try {
          entries.push(`${key}=${JSON.stringify(value)}`);
        } catch {
          entries.push(`${key}=[object]`);
        }
        return;
      }
      entries.push(`${key}=${String(value)}`);
    };

    push('homeVisible');
    push('loginHidden');
    push('alertVisible');
    push('kickVisible');
    push('accShowClass');
    push('message');

    if (entries.length === 0) {
      return undefined;
    }

    return `登录检测信息(${entries.join(', ')})`;
  }

  private composeLoginFailureMessage(message?: string | null, debug?: Record<string, any>, fallback = '登录失败，请检查账号或稍后再试'): string {
    const normalized = this.normalizeLoginMessage(message);
    if (normalized) {
      return normalized;
    }
    const debugText = this.formatLoginDebug(debug);
    if (debugText) {
      return debugText;
    }
    return fallback;
  }

  private async isPasscodePromptVisible(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const doc = (globalThis as any).document as any;
      const acc = doc?.querySelector?.('#acc_show');
      const classList = acc?.classList;
      if (!classList || typeof classList.contains !== 'function') {
        return false;
      }
      return classList.contains('pass_outside');
    }).catch(() => false);
  }

  private async dismissPasscodePrompt(page: Page): Promise<boolean> {
    const visible = await this.isPasscodePromptVisible(page);
    if (!visible) {
      return false;
    }

    console.log('🛡️ 检测到四位安全码提示（不再点击“否”），交由专用流程处理');

    try {
      const snippet = await page.evaluate(() => {
        const doc = (globalThis as any).document as any;
        const container = doc?.querySelector?.('#acc_show');
        return container ? container.innerHTML : '';
      });
      const fileName = `passcode-debug-${Date.now()}.html`;
      await fs.writeFile(fileName, snippet || '');
      console.log(`📝 已导出安全码调试片段: ${fileName}`);
    } catch (dumpErr) {
      console.warn('⚠️ 导出安全码调试片段失败:', dumpErr);
    }

    // 不再自动点击“否”，统一交由 handlePasscodeRequirement 处理
    return false;
  }

  private normalizeTextToken(value?: string | null): string {
    if (!value) {
      return '';
    }
    return value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[\s\n\r]+/g, '')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/主队|主隊/g, '主')
      .replace(/客队|客隊/g, '客');
  }

  private resolveBetSuffix(betRequest: BetRequest): string | null {
    const typeRaw = betRequest.betType ?? (betRequest as any).bet_type ?? '';
    const optionRaw = betRequest.betOption ?? (betRequest as any).bet_option ?? '';
    const typeText = this.normalizeTextToken(typeRaw);
    const optionText = this.normalizeTextToken(optionRaw);

    const typeMatches = (...keywords: string[]): boolean =>
      keywords.some((kw) => kw && typeText.includes(this.normalizeTextToken(kw)));

    const optionMatches = (...keywords: string[]): boolean =>
      keywords.some((kw) => kw && optionText.includes(this.normalizeTextToken(kw)));

    const mappingCandidates: Array<{ match: () => boolean; resolve: () => string | null }> = [
      {
        match: () => typeMatches('让球', '讓球', 'handicap', 're'),
        resolve: () => {
          if (optionMatches('主', 'home', 'h')) return 'REH';
          if (optionMatches('客', 'away', 'c')) return 'REC';
          return null;
        },
      },
      {
        match: () => typeMatches('大/小', '大小', 'over', 'under', 'rou'),
        resolve: () => {
          if (optionMatches('大', 'over', 'o')) return 'ROUC';
          if (optionMatches('小', 'under', 'u')) return 'ROUH';
          return null;
        },
      },
      {
        match: () => typeMatches('独赢', '獨贏', 'moneyline', '独勝', 'win'),
        resolve: () => {
          if (optionMatches('主', 'home', 'h')) return 'RMH';
          if (optionMatches('客', 'away', 'c')) return 'RMC';
          if (optionMatches('和', '平', 'draw', 'tie')) return 'RMN';
          return null;
        },
      },
      {
        match: () => typeMatches('下个进球', '下一球', '下個進球', 'nextgoal'),
        resolve: () => {
          if (optionMatches('主', 'home', 'h')) return 'RGH';
          if (optionMatches('客', 'away', 'c')) return 'RGC';
          if (optionMatches('无', '無', 'none', 'no', 'n')) return 'RGN';
          return null;
        },
      },
      {
        match: () => typeMatches('双方球队进球', '双方进球', '雙方進球', 'bothscores', 'btts'),
        resolve: () => {
          if (optionMatches('是', 'yes', 'y')) return 'RTSY';
          if (optionMatches('否', 'no', 'n')) return 'RTSN';
          return null;
        },
      },
      {
        match: () => typeMatches('单/双', '单双', '單雙', 'odd', 'even'),
        resolve: () => {
          if (optionMatches('单', 'odd', 'o')) return 'REOO';
          if (optionMatches('双', 'even', 'e')) return 'REOE';
          return null;
        },
      },
      {
        match: () => typeMatches('队伍1进球', '隊伍1進球', 'team1goal', '主队进球', '主隊進球'),
        resolve: () => {
          if (optionMatches('大', 'over', 'o')) return 'ROUHO';
          if (optionMatches('小', 'under', 'u')) return 'ROUHU';
          return null;
        },
      },
      {
        match: () => typeMatches('队伍2进球', '隊伍2進球', 'team2goal', '客队进球', '客隊進球'),
        resolve: () => {
          if (optionMatches('大', 'over', 'o')) return 'ROUCO';
          if (optionMatches('小', 'under', 'u')) return 'ROUCU';
          return null;
        },
      },
    ];

    for (const candidate of mappingCandidates) {
      try {
        if (candidate.match()) {
          const suffix = candidate.resolve();
          if (suffix) {
            return suffix;
          }
        }
      } catch (err) {
        console.warn('resolveBetSuffix candidate error:', err);
      }
    }

    return null;
  }

  // 模拟人类输入
  private maskPasscode(passcode: string): string {
    if (!passcode) {
      return '';
    }
    if (passcode.length <= 1) {
      return '*';
    }
    const headLength = Math.min(2, passcode.length - 1);
    return `${passcode.slice(0, headLength)}${'*'.repeat(passcode.length - headLength)}`;
  }

  private normalizePasscode(value?: string | null): string | null {
    if (!value) {
      return null;
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length === 4) {
      return digits;
    }
    if (digits.length > 4) {
      return digits.slice(0, 4);
    }
    return null;
  }

  private isFourPwdPending(value?: string | null): boolean {
    if (!value) {
      return false;
    }
    const normalized = value.toString().trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (['n', 'no', 'none', 'false', '0', 'complete', 'success', 'done'].includes(normalized)) {
      return false;
    }
    const keywords = ['new', 'second', 'third', 'again', 'reset', 'set', 'pending', 'need', 'require', 'required', 'retry', 'y', 'yes'];
    if (keywords.includes(normalized)) {
      return true;
    }
    return /passcode|4pwd|four\s*pwd|四位|四碼|简易|簡易/.test(normalized);
  }

  private generatePasscode(account: CrownAccount): string {
    const baseId = Math.abs(account.id ?? 0) || 1;
    const timeSeed = Date.now() % 10000;
    let candidate = ((baseId * 7919 + timeSeed) % 10000).toString().padStart(4, '0');
    const banned = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1122', '1212', '6969']);
    let offset = 0;
    while (banned.has(candidate)) {
      offset += 97;
      candidate = ((baseId * 7919 + timeSeed + offset) % 10000).toString().padStart(4, '0');
    }
    return candidate;
  }

  private async persistPasscode(
    account: CrownAccount,
    passcode: string,
    normalizedStored: string,
    mode: 'setup' | 'input' | 'keypad',
  ): Promise<void> {
    if (mode === 'setup' || normalizedStored !== passcode) {
      try {
        await query(
          `UPDATE crown_accounts
             SET passcode = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [passcode, account.id],
        );
        console.log('💾 已将简易密码写入数据库');
      } catch (err) {
        console.warn('⚠️ 保存简易密码到数据库失败:', err);
      }
    }
  }

  private computePasscodeContainerScore(meta: PasscodeInputMeta): number {
    let score = 0;
    const containerId = (meta.containerId || '').toLowerCase();
    const containerClasses = (meta.containerClasses || '').toLowerCase();
    const combined = `${containerId} ${containerClasses}`;
    if (/passcode|pwd4|4pwd|prepass/.test(containerId)) {
      score += 5;
    }
    if (/passcode|pwd4|4pwd|prepass/.test(containerClasses)) {
      score += 4;
    }
    if (/content_chgpwd|popup_bottom|popup_content|pop_box|passcode/.test(containerClasses)) {
      score += 2;
    }
    if (/alert_confirm|confirm/.test(combined)) {
      score += 1;
    }
    if (/box_help_btn|msg_popup/.test(containerClasses)) {
      score += 1;
    }
    if (meta.maxLength && meta.maxLength <= 6) {
      score += 1;
    }
    return score;
  }

  private isLikelyPasscodeInput(meta: PasscodeInputMeta): boolean {
    const id = (meta.id || '').toLowerCase();
    const name = (meta.name || '').toLowerCase();
    const classes = (meta.className || '').toLowerCase();
    const placeholder = (meta.placeholder || '').toLowerCase();
    const label = (meta.labelText || '').toLowerCase();
    const aria = (meta.ariaLabel || '').toLowerCase();
    const type = (meta.type || '').toLowerCase();
    const inputMode = (meta.inputMode || '').toLowerCase();
    const maxLength = meta.maxLength ?? 0;

    if (/input_pwd4|btn_pwd4|passcode/.test(classes) || /passcode|pwd4|4pwd/.test(id)) {
      return true;
    }

    const combined = `${id} ${name} ${classes} ${placeholder} ${label} ${aria}`;
    const isPasswordLike = type === 'password' || type === 'tel' || type === 'number';
    const hasPasscodeKeyword = /passcode|pwd4|4pwd|簡易|簡碼|简易|简码|四位|4位/.test(combined);
    const hasPasswordWord = /密码|密碼|passcode|簡易|四位|4位|四碼|4碼/.test(combined);

    if (hasPasscodeKeyword && isPasswordLike) {
      return true;
    }

    if (isPasswordLike && hasPasswordWord && maxLength > 0 && maxLength <= 6) {
      return true;
    }

    if (isPasswordLike && (inputMode === 'numeric' || inputMode === 'tel') && maxLength > 0 && maxLength <= 6) {
      return true;
    }

    if (hasPasswordWord && maxLength === 4) {
      return true;
    }

    return false;
  }

  private async collectPasscodeGroups(page: Page): Promise<PasscodeGroup[]> {
    const contexts: FrameLike[] = [page, ...page.frames()];
    const groups: PasscodeGroup[] = [];

    for (const context of contexts) {
      const inputs = context.locator('input:not([type="hidden"]):not([disabled])');
      const total = await inputs.count().catch(() => 0);
      for (let i = 0; i < total; i += 1) {
        const locator = inputs.nth(i);
        let visible = false;
        try {
          visible = await locator.isVisible({ timeout: 200 }).catch(() => false);
        } catch {
          visible = false;
        }
        if (!visible) {
          continue;
        }

        const meta = await locator.evaluate((el) => {
          const element = el as any;
          const doc = element?.ownerDocument || (globalThis as any).document;
          const labelNode = element?.closest ? element.closest('label') : null;
          const labelText = labelNode?.textContent?.trim() || '';
          const ariaLabelId = element?.getAttribute ? element.getAttribute('aria-labelledby') || '' : '';
          let ariaLabel = element?.getAttribute ? (element.getAttribute('aria-label') || '') : '';
          if (!ariaLabel && ariaLabelId) {
            const parts = ariaLabelId
              .split(/\s+/)
              .map((idPart: string) => doc?.getElementById?.(idPart)?.textContent?.trim() || '')
              .filter(Boolean);
            ariaLabel = parts.join(' ').trim();
          }
          const parent = element?.closest
            ? element.closest('#prepasscode, .content_chgpwd, #alert_confirm, #C_alert_confirm, .popup_bottom, .popup_content, .pop_box, .passcode_box, .passcode_area, #passcode_main, .passcode_main, .oth_prepass_box')
            : null;
          const maxLengthAttr = element?.getAttribute ? element.getAttribute('maxlength') : null;
          return {
            id: element?.id || '',
            name: element?.getAttribute ? element.getAttribute('name') || '' : '',
            type: ((element?.getAttribute ? element.getAttribute('type') : '') || '').toLowerCase(),
            placeholder: element?.getAttribute ? element.getAttribute('placeholder') || '' : '',
            className: element?.className || '',
            maxLength: maxLengthAttr ? parseInt(maxLengthAttr, 10) || undefined : undefined,
            inputMode: element?.getAttribute ? element.getAttribute('inputmode') || '' : '',
            ariaLabel,
            labelText,
            containerId: parent?.id || '',
            containerClasses: parent?.className || '',
          } as PasscodeInputMeta;
        }).catch(() => null as PasscodeInputMeta | null);

        if (!meta || !this.isLikelyPasscodeInput(meta)) {
          continue;
        }

        const key = `${meta.containerId || ''}::${meta.containerClasses || ''}`;
        let group = groups.find((g) => g.context === context && g.key === key);
        if (!group) {
          group = {
            context,
            inputs: [],
            containerId: meta.containerId,
            containerClasses: meta.containerClasses,
            key,
            score: this.computePasscodeContainerScore(meta),
          };
          groups.push(group);
        }
        group.inputs.push({ locator, meta });
        group.score = Math.max(group.score, this.computePasscodeContainerScore(meta) + group.inputs.length);
      }
    }

    return groups
      .filter((group) => group.inputs.length > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.inputs.length !== a.inputs.length) {
          return b.inputs.length - a.inputs.length;
        }
        return 0;
      });
  }

  private async clickNumericPasscodeKey(context: FrameLike, digit: string): Promise<boolean> {
    const selectors = [
      `#panel #num_${digit}`,
      `#panel span#num_${digit}`,
      `.oth_pass_keyboard #num_${digit}`,
      `.oth_pass_keyboard span#num_${digit}`,
      `#num_${digit}`,
      `[data-num="${digit}"]`,
      `[data-value="${digit}"]`,
      `[data-val="${digit}"]`,
      `.passcode_key[data-num="${digit}"]`,
      `.passcode_key[data-value="${digit}"]`,
      `.passcode_key:has-text("${digit}")`,
      `button:has-text("${digit}")`,
    ];

    for (const selector of selectors) {
      const success = await context.evaluate(
        ([selectorIn, valueIn]: [string, string]) => {
          const doc = (globalThis as any).document;
        if (!doc) {
          return false;
        }
        const candidate = doc.querySelector(selectorIn);
        if (!candidate) {
          return false;
        }
        const ensureVisible = (node: any) => {
          if (!node || !node.style) {
            return;
          }
          node.style.opacity = '1';
          node.style.visibility = 'visible';
          if (!node.style.display || node.style.display === 'none') {
            node.style.display = 'inline-block';
          }
        };
        ensureVisible(candidate as any);
        const parent = (candidate as any)?.closest?.('.oth_pass_keyboard, #panel, .all_outside') as any;
        ensureVisible(parent);

        const trigger = (node: any) => {
          if (!node) return false;
          try {
            node.click?.();
            node.dispatchEvent?.(new Event('click', { bubbles: true, cancelable: true }));
            const MouseEvt = (globalThis as any).MouseEvent;
            if (typeof MouseEvt === 'function') {
              const evt = new MouseEvt('mousedown', { bubbles: true, cancelable: true });
              node.dispatchEvent?.(evt);
              const up = new MouseEvt('mouseup', { bubbles: true, cancelable: true });
              node.dispatchEvent?.(up);
            }
            const TouchEvt = (globalThis as any).TouchEvent;
            if (typeof TouchEvt === 'function') {
              const touchStart = new TouchEvt('touchstart', { bubbles: true, cancelable: true });
              node.dispatchEvent?.(touchStart);
              const touchEnd = new TouchEvt('touchend', { bubbles: true, cancelable: true });
              node.dispatchEvent?.(touchEnd);
            }
            return true;
          } catch {
            return false;
          }
        };

        if (trigger(candidate)) {
          return true;
        }

        const alt = doc.getElementById(`num_${valueIn}`);
        if (alt && alt !== candidate && trigger(alt)) {
          return true;
        }

          return false;
        },
        [selector, digit] as [string, string],
      ).catch(() => false);

      if (success) {
        return true;
      }
    }

    const fallback = await context.evaluate((value: string) => {
      const doc = (globalThis as any).document;
      if (!doc) {
        return false;
      }
      const collected: any[] = [];
      const pushIfNeeded = (node: any) => {
        if (node && !collected.includes(node)) {
          collected.push(node);
        }
      };
      pushIfNeeded(doc.querySelector(`#panel #num_${value}`));
      pushIfNeeded(doc.querySelector(`.oth_pass_keyboard #num_${value}`));
      pushIfNeeded(doc.getElementById(`num_${value}`));
      pushIfNeeded(doc.querySelector(`[data-num="${value}"]`));
      pushIfNeeded(doc.querySelector(`[data-value="${value}"]`));
      pushIfNeeded(doc.querySelector(`[data-val="${value}"]`));
      pushIfNeeded(doc.querySelector(`.passcode_key[data-num="${value}"]`));
      const triggerClick = (target: any) => {
        if (!target) {
          return false;
        }
        try {
          target.click?.();
          return true;
        } catch {}
        try {
          const MouseEvt = (globalThis as any).MouseEvent || (globalThis as any).Event;
          const TouchEvt = (globalThis as any).TouchEvent;
          if (typeof MouseEvt === 'function') {
            const evt = new MouseEvt('click', { bubbles: true, cancelable: true });
            target.dispatchEvent?.(evt);
          }
          if (typeof TouchEvt === 'function') {
            const touchStart = new TouchEvt('touchstart', { bubbles: true, cancelable: true });
            target.dispatchEvent?.(touchStart);
            const touchEnd = new TouchEvt('touchend', { bubbles: true, cancelable: true });
            target.dispatchEvent?.(touchEnd);
          }
          const PointerCtor = (globalThis as any).PointerEvent;
          if (typeof PointerCtor === 'function') {
            const pointerDown = new PointerCtor('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' });
            target.dispatchEvent?.(pointerDown);
            const pointerUp = new PointerCtor('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' });
            target.dispatchEvent?.(pointerUp);
          }
          return true;
        } catch {}
        return false;
      };
      for (const node of collected) {
        if (triggerClick(node)) {
          return true;
        }
      }
      return false;
    }, digit).catch(() => false);

    return !!fallback;
  }

  private async waitForNumericPasscodeResult(page: Page, timeout = 16000): Promise<{ dismissed: boolean; errorText?: string }> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const status = await page.evaluate(() => {
        const aggregate = {
          containerVisible: false,
          errorText: '',
          loginVisible: false,
          activeCount: 0,
        };

        const inspectDocument = (doc: any) => {
          if (!doc) {
            return;
          }

          const getVisible = (node: any) => {
            if (!node) {
              return false;
            }
            const style = (doc.defaultView || (globalThis as any).window)?.getComputedStyle?.(node);
            if (!style) {
              return false;
            }
            if (style.display === 'none' || style.visibility === 'hidden') {
              return false;
            }
            const opacity = Number.parseFloat(style.opacity || '1');
            return Number.isNaN(opacity) ? true : opacity > 0.05;
          };

          const container = doc.querySelector('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area, #passcode_main, .passcode_main, .oth_prepass_box');
          if (container && getVisible(container)) {
            aggregate.containerVisible = true;
          }

          const errorNode = doc.getElementById('oth_pass_err');
          if (!aggregate.errorText && errorNode && getVisible(errorNode)) {
            aggregate.errorText = (errorNode.textContent || '').trim();
          }

          const loginNode = doc.getElementById('acc_show');
          if (loginNode && getVisible(loginNode)) {
            aggregate.loginVisible = true;
          }

          const emptyBar = doc.querySelector('#empty_bar');
          if (emptyBar) {
            const count = Array.from(emptyBar.querySelectorAll('.active')).length;
            if (count > aggregate.activeCount) {
              aggregate.activeCount = count;
            }
          }
        };

        try {
          inspectDocument((globalThis as any).document);
        } catch {}

        try {
          const frames = Array.from((globalThis as any).frames || []) as any[];
          for (const rawFrame of frames) {
            try {
              const frame = rawFrame as any;
              inspectDocument(frame && frame.document ? frame.document : null);
            } catch {}
          }
        } catch {}

        return aggregate;
      }).catch(() => ({ containerVisible: false, errorText: '', loginVisible: false, activeCount: 0 }));

      if (status.errorText) {
        return { dismissed: false, errorText: status.errorText };
      }

      const filledCount = Number(status.activeCount || 0);
      if (filledCount >= 4) {
        return { dismissed: true };
      }

      if (!status.containerVisible || !status.loginVisible) {
        return { dismissed: true };
      }

      await this.randomDelay(240, 380);
    }

    return { dismissed: false };
  }

  private async tryHandlePasscodeKeypad(
    page: Page,
    passcode: string,
  ): Promise<{ found: boolean; success?: boolean; reason?: string; errorText?: string }> {
    const sanitized = (passcode || '').replace(/\D/g, '');
    if (sanitized.length !== 4) {
      return { found: false };
    }

    const contexts: FrameLike[] = [page, ...page.frames()];
    let keypadContext: FrameLike | null = null;
    let keypadMeta: { digits: number; indicators: number } | null = null;

    for (let scanAttempt = 0; scanAttempt < 12 && !keypadContext; scanAttempt += 1) {
      for (const context of contexts) {
        const contextName = (context as any).name?.() || (context === page ? 'page' : 'frame');
        try {
          const detected = await context.evaluate(() => {
            const doc = (globalThis as any).document;
            if (!doc) {
              return null;
            }

          const countVisible = (nodes: any): number => {
            const list = Array.isArray(nodes) ? nodes : Array.from(nodes || []);
            let visibleCount = 0;
            for (const node of list) {
              if (!node) {
                continue;
              }
              const style = (globalThis as any).window?.getComputedStyle?.(node as any);
              if (!style) {
                continue;
              }
              if (style.display === 'none' || style.visibility === 'hidden') {
                continue;
              }
              const opacity = Number.parseFloat(style.opacity || '1');
              if (!Number.isNaN(opacity) && opacity <= 0.05) {
                continue;
              }
              visibleCount += 1;
            }
            return visibleCount;
          };

          const digitCandidates = doc.querySelectorAll(
            '#panel [id^="num_"], .oth_pass_keyboard [id^="num_"], .passcode_key, .passcode-btn, .passcode_num, .passcode-num',
          );
          const digitsVisible = countVisible(digitCandidates);

          const indicatorCandidates = doc.querySelectorAll('#empty_bar .empty, #empty_bar li, .oth_pass_circle li');
          const indicatorsVisible = countVisible(indicatorCandidates);

          if (digitsVisible === 0 && indicatorsVisible === 0) {
            return null;
          }

          return {
            digits: digitsVisible,
            indicators: indicatorsVisible,
          };
            return {
              digits: digitsVisible,
              indicators: indicatorsVisible,
            };
          });

          console.log('[passcode_keypad_detect]', {
            attempt: scanAttempt,
            context: contextName,
            digits: detected?.digits ?? 0,
            indicators: detected?.indicators ?? 0,
          });

          if (detected && detected.digits > 0) {
            keypadContext = context;
            keypadMeta = detected;
            break;
          }
        } catch (err) {
          console.warn(`⚠️ 检测数字简易密码面板失败 (${contextName}):`, err);
        }
      }

      if (!keypadContext) {
        await this.randomDelay(140, 260);
      }
    }

    if (!keypadContext || !keypadMeta) {
      console.log('ℹ️ 数字简易密码面板未检测到，跳过 keypad 输入处理');
      return { found: false };
    }

    console.log(
      `🕹️ 检测到数字简易密码面板，按键数 ${keypadMeta.digits}，指示器 ${keypadMeta.indicators}，使用按键输入 ${this.maskPasscode(sanitized)}`,
    );

    for (const digit of sanitized.split('')) {
      const clicked = await this.clickNumericPasscodeKey(keypadContext, digit);
      if (!clicked) {
        console.warn(`⚠️ 找不到用于输入数字 ${digit} 的按键`);
        return { found: true, success: false, reason: `keypad_digit_${digit}_missing` };
      }
      console.log(`🕹️ 已点击数字 ${digit}`);
      await this.randomDelay(90, 170);
    }

    this.lastPasscodeRejected = false;

    const result = await this.waitForNumericPasscodeResult(page, 18000);
    if (result.errorText) {
      return { found: true, success: false, reason: 'keypad_rejected', errorText: result.errorText };
    }
    if (!result.dismissed) {
      return { found: true, success: false, reason: 'keypad_dismiss_timeout' };
    }

    return { found: true, success: true };
  }

  private async setPasscodeMarker(group: PasscodeGroup): Promise<string | null> {
    if (!group.inputs.length) {
      return null;
    }
    const marker = `passcode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const applied = await group.inputs[0].locator.evaluate((node, mark) => {
        const scope = node.closest('#prepasscode, .content_chgpwd, #alert_confirm, #C_alert_confirm, .popup_bottom, .popup_content, .pop_box, .passcode_box, .passcode_area, #passcode_main, .passcode_main, .oth_prepass_box');
        if (scope) {
          scope.setAttribute('data-passcode-marker', mark);
          return true;
        }
        return false;
      }, marker);
      if (applied) {
        return marker;
      }
    } catch (err) {
      console.warn('⚠️ 标记简易密码弹窗失败:', err);
    }
    return null;
  }

  private async clearPasscodeMarker(context: FrameLike, marker?: string | null): Promise<void> {
    if (!marker) {
      return;
    }
    try {
      await context.evaluate((mark) => {
        const doc = (globalThis as any).document;
        if (!doc) {
          return;
        }
        const nodes = Array.from(doc.querySelectorAll(`[data-passcode-marker="${mark}"]`)) as any[];
        nodes.forEach((node: any) => node.removeAttribute('data-passcode-marker'));
      }, marker);
    } catch {
      // 忽略清理错误
    }
  }

  private async ensurePasscodeInterface(page: Page, tag: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ensured = await page.evaluate((attemptIndex) => {
        const globalScope = (globalThis as any);
        const doc = globalScope?.document as any;
        const topWin = (globalScope?.top || globalScope) as any;
        if (!doc) {
          return false;
        }

        const hasContainer = () => doc.querySelector('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area, .oth_prepass_box');
        if (hasContainer()) {
          return true;
        }

        const accShow = doc.querySelector('#acc_show');
        if (accShow && accShow.classList && !accShow.classList.contains('pass_outside')) {
          accShow.classList.add('pass_outside');
        }

        try {
          const cookieManager = topWin?.CookieManager2 || topWin?.CookieManager;
          if (cookieManager && typeof cookieManager.set === 'function') {
            const pidValue = `auto_${Date.now()}`;
            cookieManager.set('PID', pidValue);
            const uidValue = topWin?.userData?.passwd_safe || `uid_${Date.now()}`;
            cookieManager.set('UID', uidValue);
          } else {
            const hasPid = (doc.cookie || '').split(';').some((entry: string) => entry.trim().toLowerCase().startsWith('pid='));
            if (!hasPid) {
              const cookieValue = `PID=${btoa(`auto_${Date.now()}`)}; path=/; SameSite=None`;
              doc.cookie = cookieValue;
            }
          }
        } catch {}

        const revealButtonIds = ['btn_pwd4', 'btn_pwd4_yes', 'btn_passcode_ok'];
        for (const id of revealButtonIds) {
          const btn = doc.getElementById(id) as any;
          if (!btn) {
            continue;
          }
          try {
            btn.style.display = '';
          } catch {}
          try {
            btn.removeAttribute?.('disabled');
          } catch {}
          try {
            btn.click?.();
          } catch {}
        }

        const confirmButtons = doc.querySelectorAll('#btn_pwd4_yes, #btn_passcode_ok, #C_yes_btn, #yes_btn, .btn_passcode_confirm');
        confirmButtons.forEach((element: any) => {
          try {
            element.click?.();
          } catch {}
        });

        const tryInvoke = (obj: any) => {
          if (!obj) {
            return;
          }
          const candidates = ['show_prepasscode', 'prepasscode', 'goToPrePasscode'];
          for (const key of candidates) {
            const fn = obj[key];
            if (typeof fn === 'function') {
              try {
                fn.call(obj, {});
              } catch {}
            }
          }
        };

        tryInvoke(topWin);
        tryInvoke(topWin?.login_index);
        tryInvoke(topWin?.loginIndex);
        tryInvoke(topWin?.loginindex);
        tryInvoke(topWin?.login);
        tryInvoke(topWin?.loginObj);
        tryInvoke(topWin?.loginIndexObj);
        tryInvoke(topWin?.loginIndexInstance);
        tryInvoke(topWin?.parentClass);

        const possibleStores = ['login_index_obj', 'loginIndexObj', 'loginObj', 'login_index'];
        for (const store of possibleStores) {
          tryInvoke(topWin?.[store]);
        }

        if (attemptIndex >= 1 && typeof (globalThis as any).login_index === 'function') {
          try {
            const inst = new (globalThis as any).login_index(globalThis, doc);
            inst.init?.();
            inst.show_prepasscode?.();
          } catch {}
        }

        const triggerShowPrepasscode = (candidate: any) => {
          if (!candidate) {
            return;
          }
          try {
            if (typeof candidate.show_prepasscode === 'function') {
              candidate.show_prepasscode();
            }
          } catch {}
          try {
            if (typeof candidate.goToPage === 'function') {
              candidate.goToPage('acc_show', 'prepasscode', () => undefined, {});
            }
          } catch {}
          try {
            if (typeof candidate.dispatchEvent === 'function') {
              candidate.dispatchEvent('show_prepasscode', {});
            }
          } catch {}
        };

        try {
          const pc = topWin?.parentClass;
          const candidateTargets: any[] = [];
          if (pc) {
            candidateTargets.push(pc);
            if (typeof pc.getThis === 'function') {
              try { candidateTargets.push(pc.getThis('loginFrame')); } catch {}
              try { candidateTargets.push(pc.getThis('prepasscode')); } catch {}
              try { candidateTargets.push(pc.getThis('alertFrame')); } catch {}
            }
            if (pc?.myhash && typeof pc.myhash === 'object') {
              for (const key of ['loginFrame', 'prepasscode', 'alertFrame']) {
                if (pc.myhash[key]) {
                  candidateTargets.push(pc.myhash[key]);
                }
              }
            }
          }
          for (const target of candidateTargets) {
            triggerShowPrepasscode(target);
          }
          if (pc && typeof pc.dispatchEvent === 'function') {
            pc.dispatchEvent('show_prepasscode', {});
            pc.dispatchEvent('show_back_4pwd', {});
          }
        } catch {}

        if (typeof (globalScope as any).login_index === 'function') {
          try {
            const registry = globalScope as any;
            if (!registry.__codexLoginIndex) {
              const created = new registry.login_index(registry, doc);
              created.init?.();
              registry.__codexLoginIndex = created;
            }
            const instance = registry.__codexLoginIndex;
            if (instance) {
              try {
                instance.show_prepasscode?.();
              } catch {}
              try {
                instance.dispatchEvent?.('show_prepasscode', {});
              } catch {}
              try {
                instance.dispatchEvent?.('show_back_4pwd', {});
              } catch {}
            }
          } catch {}
        }

        if (!doc.getElementById('prepasscode')) {
          try {
            if (typeof topWin?.chk_acc === 'function') {
              topWin.chk_acc();
            }
          } catch {}
          try {
            if (typeof topWin?.loginSuccess === 'function') {
              topWin.loginSuccess();
            }
          } catch {}
          try {
            if (typeof topWin?.show_prepasscode === 'function') {
              topWin.show_prepasscode();
            }
          } catch {}
        }

        const acc = doc.querySelector('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area, .oth_prepass_box');
        if (acc) {
          return true;
        }

        if (attemptIndex >= 1) {
          const url = topWin?.m2_url || topWin?.m_url;
          if (url && typeof topWin?.goToPage === 'function') {
            try {
              topWin.goToPage('acc_show', 'prepasscode', () => undefined, {});
            } catch {}
          }
        }

        return !!hasContainer();
      }, attempt).catch(() => false);

      if (ensured) {
        return true;
      }

      await this.randomDelay(200, 400);
    }

    await this.dumpPasscodeContext(page, `ensure-failed-${tag}`);
    return false;
  }

  private async syncPasscodeViaApi(page: Page, fallbackPasscode?: string): Promise<boolean> {
    try {
      const result = await page.evaluate(async (fallback) => {
        const globalScope = (globalThis as any);
        const topWin = (globalScope?.top || globalScope) as any;
        const doc = globalScope?.document as any;
        if (!topWin || !topWin.userData) {
          return { ok: false, reason: 'missing_state' };
        }

        const normalizeDigits = (value: any) => String(value ?? '').replace(/\D/g, '').slice(0, 4);

        if (!topWin.memSet) {
          topWin.memSet = {};
        }

        const passcodeCandidate = (() => {
          const fallbackCandidate = normalizeDigits(fallback);
          if (fallbackCandidate.length === 4) {
            return fallbackCandidate;
          }
          const memCandidate = normalizeDigits(topWin.memSet?.passcode || topWin.memSet?.fourPwd || '');
          if (memCandidate.length === 4) {
            return memCandidate;
          }
          return '';
        })();

        if (!passcodeCandidate) {
          return { ok: false, reason: 'missing_passcode' };
        }

        topWin.memSet.passcode = passcodeCandidate;

        const paramString = typeof topWin.param === 'string' ? topWin.param : '';
        const params = new URLSearchParams();
        params.set('p', 'checkPassCode');

        if (paramString) {
          paramString.split('&').forEach((segment: string) => {
            if (!segment) {
              return;
            }
            const [rawKey, ...rest] = segment.split('=');
            if (!rawKey) {
              return;
            }
            const key = rawKey.trim();
            const value = rest.join('=').trim();
            if (key) {
              params.append(key, value);
            }
          });
        }

        const today = new Date().toISOString().slice(0, 10);
        const inputCode = [
          topWin.userData.passwd_safe || '',
          passcodeCandidate,
          topWin.userData.mid || '',
          'N',
          today,
        ].join('|');

        params.set('inputCode', inputCode);
        params.set('action', 'SET');

        const targetUrl = topWin.m2_url || (doc?.location ? `${doc.location.origin}/transform.php` : '');
        if (!targetUrl) {
          return { ok: false, reason: 'missing_target_url' };
        }

        let responseText = '';
        try {
          const response = await globalScope.fetch(targetUrl, {
            method: 'POST',
            body: params.toString(),
            credentials: 'include',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          responseText = await response.text();
        } catch (fetchErr) {
          return { ok: false, reason: `fetch_error:${String(fetchErr)}` };
        }

        const codeMatch = responseText.match(/<code>(\d+)<\/code>/i);
        const dataMatch = responseText.match(/<data>([^<]*)<\/data>/i);
        if (!codeMatch) {
          return { ok: false, reason: 'code_missing', text: responseText.slice(0, 200) };
        }

        const code = codeMatch[1];
        if (code !== '484') {
          return { ok: false, reason: `code_${code}`, text: responseText.slice(0, 200) };
        }

        const pidRaw = dataMatch ? dataMatch[1] : '';
        if (!pidRaw) {
          return { ok: false, reason: 'pid_missing', text: responseText.slice(0, 200) };
        }

        try {
          const cookieManager = topWin?.CookieManager2 || topWin?.CookieManager;
          const encodedPid = encodeURIComponent(pidRaw);
          if (cookieManager && typeof cookieManager.set === 'function') {
            cookieManager.set('PID', encodedPid, 3650);
            if (topWin?.userData?.passwd_safe) {
              cookieManager.set('UID', topWin.userData.passwd_safe, 3650);
            }
          } else if (doc) {
            doc.cookie = `PID=${encodedPid}; path=/; SameSite=None`;
          }
          if (topWin?.userData) {
            topWin.userData.secondSet4pwd = 'Y';
          }
          if (topWin?.memSet) {
            topWin.memSet.passcode = passcodeCandidate;
          }
          try {
            if (typeof topWin.goToHomePage === 'function') {
              topWin.goToHomePage();
            } else if (topWin?.util && typeof topWin.util.topGoToUrl === 'function') {
              const targetUrl = topWin.util.getWebUrl?.() || (doc?.location ? doc.location.href : '');
              if (targetUrl) {
                topWin.util.topGoToUrl(targetUrl, topWin.userData || {});
              }
            }
            if (typeof topWin.loginSuccess === 'boolean') {
              topWin.loginSuccess = true;
            }
          } catch {}
        } catch (cookieErr) {
          return { ok: false, reason: `cookie_error:${String(cookieErr)}` };
        }

        let homeUrl: string | undefined;
        try {
          if (topWin?.util && typeof topWin.util.getWebUrl === 'function') {
            homeUrl = topWin.util.getWebUrl();
          }
        } catch {}

        if (!homeUrl) {
          try {
            const origin = doc?.location?.origin || '';
            homeUrl = origin ? `${origin}/` : undefined;
          } catch {}
        }

        return { ok: true, homeUrl };
      });

      if (result?.ok) {
        console.log('[passcode_sync] homeUrl candidate:', result.homeUrl);
        if (result.homeUrl) {
          try {
            await page.goto(result.homeUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
          } catch (gotoErr) {
            console.warn('[passcode_sync] 无法直接跳转首页:', gotoErr);
          }
        }
        console.log('[passcode_sync] server sync succeeded');
        return true;
      }

      console.log('[passcode_sync] server sync failed', result);
    } catch (err) {
      console.warn('[passcode_sync] exception', err);
    }
    return false;
  }

  private async clickPasscodeConfirm(context: FrameLike, marker?: string | null): Promise<boolean> {
    const keypadOnly = await context.evaluate(() => {
      try {
        const doc = (globalThis as any).document;
        if (!doc) {
          return false;
        }
        const container = doc.querySelector('#oth_pass_set.oth_pass_box');
        if (!container || container.getAttribute('style')?.includes('display: none')) {
          return false;
        }
        const hasKeyboard = !!container.querySelector('.oth_pass_keyboard');
        if (!hasKeyboard) {
          return false;
        }
        const confirmCandidate = container.querySelector('#btn_pwd4, #btn_pwd4_yes, #btn_passcode_ok, .btn_passcode_confirm, button.btn_passcode_confirm');
        return !confirmCandidate;
      } catch {
        return false;
      }
    }).catch(() => false);

    if (keypadOnly) {
      console.log('ℹ️ 检测到仅数字键盘的四位码界面，无需点击确认按钮');
      return true;
    }

    const candidateSelectors = [
      '#btn_passcode_ok',
      '#btn_pwd4_yes',
      '#btn_pwd4',
      '#C_yes_btn',
      '#C_ok_btn',
      '#yes_btn',
      '.btn_passcode_confirm',
      '.btn_submit:has-text("确认")',
      '.btn_submit:has-text("確定")',
      '.btn_submit:has-text("OK")',
      '.btn_submit:has-text("Yes")',
      '.btn_submit:has-text("Continue")',
      'button:has-text("OK")',
      'button:has-text("Yes")',
      'button:has-text("Continue")',
      '.btn_submit:has-text("是")',
      'button:has-text("确认")',
      'button:has-text("確定")',
      'button:has-text("OK")',
      'button:has-text("Yes")',
      'button:has-text("Continue")',
      'button:has-text("是")',
      '[role="button"]:has-text("确认")',
      '[role="button"]:has-text("確定")',
      '[role="button"]:has-text("OK")',
      '[role="button"]:has-text("Yes")',
      '[role="button"]:has-text("Continue")',
      '[role="button"]:has-text("是")',
      'text="确认"',
      'text="確定"',
      'text="OK"',
      'text="Yes"',
      'text="Continue"',
      'text="是"',
      'text="设定"',
      'text="設定"',
      'text="Set"',
      'text="Proceed"',
      'text="Next"',
    ];

    const scopeLocators: Locator[] = [];
    if (marker) {
      const scope = context.locator(`[data-passcode-marker="${marker}"]`);
      if ((await scope.count().catch(() => 0)) > 0) {
        scopeLocators.push(scope);
      }
    }
    scopeLocators.push(
      context.locator('#C_alert_confirm'),
      context.locator('#alert_confirm'),
      context.locator('.content_chgpwd'),
      context.locator('.popup_bottom'),
      context.locator('body'),
    );

    for (const scope of scopeLocators) {
      for (const selector of candidateSelectors) {
        const candidate = scope.locator(selector).first();
        if ((await candidate.count().catch(() => 0)) === 0) {
          continue;
        }
        try {
          const styleInfo = await candidate.evaluate((node: any) => {
            const win = (globalThis as any).window || globalThis;
            const style = win?.getComputedStyle?.(node);
            return {
              display: style?.display,
              visibility: style?.visibility,
              opacity: style ? parseFloat(style.opacity || '0') : 0,
            };
          }).catch(() => null);

          if (styleInfo && (styleInfo.display === 'none' || styleInfo.visibility === 'hidden' || styleInfo.opacity === 0)) {
            continue;
          }

          const visible = await candidate.isVisible().catch(() => false);
          if (!visible) {
            await candidate.evaluate((node: any) => {
              try {
                if (node && node.style) {
                  node.style.display = '';
                  node.style.visibility = 'visible';
                  node.style.opacity = '1';
                }
                const container = node?.closest?.('.popup_bottom, .popup_content, #alert_confirm, #C_alert_confirm, body');
                if (container && container.style) {
                  container.style.display = '';
                  container.style.visibility = 'visible';
                  container.style.opacity = '1';
                }
              } catch {}
            }).catch(() => undefined);
          }

          try {
            await candidate.scrollIntoViewIfNeeded().catch(() => undefined);
          } catch {}
          try {
            await candidate.evaluate((node: any) => {
              try {
                if (typeof node?.scrollIntoView === 'function') {
                  node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' } as any);
                }
                const parent = node?.closest?.('.popup_bottom, .popup_content, #alert_confirm, #C_alert_confirm');
                if (parent && typeof parent.scrollIntoView === 'function') {
                  parent.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' } as any);
                }
              } catch {}
            }).catch(() => undefined);
          } catch {}

          await candidate.click({ timeout: 2000, force: true });
          await this.randomDelay(150, 260);
          return true;
        } catch (err) {
          console.warn(`⚠️ 点击简易密码确认按钮失败 (${selector}):`, err);
          try {
            await candidate.evaluate((node: any) => {
              try {
                if (node && node.style) {
                  node.style.display = '';
                  node.style.visibility = 'visible';
                  node.style.opacity = '1';
                }
              } catch {}
              if (typeof node?.click === 'function') {
                node.click();
                return true;
              }
              try {
                node?.dispatchEvent?.(new Event('click', { bubbles: true, cancelable: true }));
                return true;
              } catch {}
              return false;
            });
            await this.randomDelay(150, 260);
            return true;
          } catch {
            // 继续尝试其他元素
          }
        }
      }
    }
    return false;
  }

  private async waitForPasscodeDismiss(page: Page, timeout = 12000): Promise<boolean> {
    try {
      await page.waitForFunction(() => {
        const doc = (globalThis as any).document;
        if (!doc) {
          return true;
        }
        const acc = doc.querySelector('#acc_show');
        const hasPassOutside = acc?.classList?.contains('pass_outside');
        if (hasPassOutside) {
          return false;
        }
        const passcodeSelectors = '#prepasscode, .passcode_box, .passcode_area, #passcode_main, .passcode_main, .oth_prepass_box';
        const visiblePasscodeContainer = doc.querySelector(passcodeSelectors);
        if (visiblePasscodeContainer) {
          const win = (globalThis as any).window || globalThis;
          const style = win.getComputedStyle?.(visiblePasscodeContainer as any);
          if (style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            return false;
          }
        }
        const markerExists = doc.querySelector('[data-passcode-marker]');
        return !markerExists;
      }, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  private async dumpPasscodeDebug(page: Page, fileName: string) {
    try {
      const snippet = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) {
          return '';
        }
        const acc = doc.querySelector('#acc_show');
        if (acc) {
          return acc.innerHTML;
        }
        return doc.documentElement?.outerHTML || '';
      });
      await fs.writeFile(fileName, snippet || '');
      console.log(`📝 已导出安全码调试片段: ${fileName}`);
    } catch (err) {
      console.warn('⚠️ 导出安全码调试片段失败:', err);
    }
  }

  private async dumpPasscodeContext(page: Page, tag: string): Promise<void> {
    const timestamp = Date.now();
    const baseName = `passcodeCtx-${tag}-${timestamp}`;

    try {
      const contextData: Record<string, any> = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const topWin = (globalThis as any).top || (globalThis as any);
        const selectors = [
          '#alert_confirm',
          '#C_alert_confirm',
          '#prepasscode',
          '.content_chgpwd',
          '.passcode_box',
          '.passcode_area',
          '#acc_show',
          '#chgAcc_show',
          '#home_show',
          '#sysreq_show',
        ];

        const serializeNode = (node: any) => {
          if (!node) {
            return null;
          }
          const win = (globalThis as any).window || globalThis;
          const style = win?.getComputedStyle?.(node);
          const visible = !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          return {
            tagName: node.tagName,
            id: node.id,
            className: node.className,
            display: style?.display,
            visibility: style?.visibility,
            opacity: style?.opacity,
            outerHTML: node.outerHTML?.slice(0, 4000) || '',
            visible,
          };
        };

        const selectorInfo: Record<string, any> = {};
        selectors.forEach((selector) => {
          try {
            const node = doc?.querySelector?.(selector);
            selectorInfo[selector] = serializeNode(node);
          } catch (err) {
            selectorInfo[selector] = { error: String(err) };
          }
        });

        const active = doc?.activeElement;

       let topKeys: string[] = [];
        let topKeyMatches: string[] = [];
        try {
          const keys = Object.keys(topWin || {});
          if (Array.isArray(keys)) {
            topKeys = keys.filter((key: string) => typeof key === 'string').slice(0, 120);
            topKeyMatches = keys
              .filter((key: string) => /login|pass|pwd|four|code/i.test(key))
              .slice(0, 120);
          }
        } catch (err) {
          topKeys = [`error:${String(err)}`];
        }

        const topKeyDetails: Record<string, string> = {};
       topKeyMatches.forEach((key) => {
          try {
            const value = (topWin as any)[key];
            const valueType = value === null ? 'null' : typeof value;
            topKeyDetails[key] = valueType;
          } catch (detailErr) {
            topKeyDetails[key] = `error:${String(detailErr)}`;
          }
        });

       let myhashKeys: string[] = [];
       try {
         const mh = (topWin as any).myhash;
         if (mh && typeof mh === 'object') {
           myhashKeys = Object.keys(mh);
         }
       } catch {}

       let frameKeys: string[] = [];
       try {
         const keys = Object.keys(topWin || {});
         frameKeys = keys.filter((key: string) => /frame|parent|dispatch/i.test(key)).slice(0, 120);
       } catch {}

        let utilKeys: string[] = [];
        try {
          const utilObj = (topWin as any).util;
          if (utilObj && typeof utilObj === 'object') {
            utilKeys = Object.keys(utilObj).slice(0, 200);
          }
        } catch {}

        return {
          url: (globalThis as any).location?.href,
          timestamp: Date.now(),
          selectorInfo,
          activeElement: active ? serializeNode(active) : null,
          accShowClass: doc?.querySelector?.('#acc_show')?.className || null,
          bodyClass: doc?.body?.className || null,
          topKeys,
          topKeyMatches,
          topKeyDetails,
          myhashKeys,
          frameKeys,
          utilKeys,
        };
      });

      const frameInfos = await Promise.all(page.frames().map(async (frame) => {
        try {
          const frameData = await frame.evaluate(() => {
            const doc = (globalThis as any).document;
            const win = (globalThis as any).window || globalThis;
            const captureInputs = () => {
              const results: Array<Record<string, any>> = [];
              const inputs = doc?.querySelectorAll?.('input');
              if (!inputs) {
                return results;
              }
              inputs.forEach((input: any) => {
                try {
                  const id = input?.id || '';
                  const name = input?.name || '';
                  const type = (input?.type || '').toLowerCase();
                  const placeholder = input?.placeholder || '';
                  const maxLength = Number.parseInt(input?.getAttribute?.('maxlength') || '', 10) || null;
                  const className = input?.className || '';
                  const valueLength = typeof input?.value === 'string' ? input.value.length : null;
                  const keywords = `${id} ${name} ${className} ${placeholder}`.toLowerCase();
                  const hasKeyword = /pass|code|pwd|4位|四位|簡|简|pin/.test(keywords) || (maxLength !== null && maxLength <= 6);
                  if (!hasKeyword) {
                    return;
                  }
                  const style = win?.getComputedStyle?.(input);
                  const visible = !!style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                  results.push({
                    id,
                    name,
                    type,
                    placeholder,
                    className,
                    maxLength,
                    valueLength,
                    visible,
                    outerHTML: input?.outerHTML?.slice(0, 400) || '',
                  });
                } catch (innerErr) {
                  results.push({ error: String(innerErr) });
                }
              });
              return results;
            };

            return {
              url: (globalThis as any).location?.href,
              title: doc?.title,
              frameName: (globalThis as any).name || null,
              passcodeInputs: captureInputs(),
            };
          });
          return {
            name: frame.name(),
            url: frame.url(),
            data: frameData,
          };
        } catch (err) {
          return {
            name: frame.name(),
            url: frame.url(),
            error: String(err),
          };
        }
      }));

      contextData.frames = frameInfos;
      await fs.writeFile(`${baseName}.json`, JSON.stringify(contextData, null, 2));
      console.log(`🧾 已导出安全码上下文: ${baseName}.json`);
    } catch (err) {
      console.warn('⚠️ 导出安全码上下文失败:', err);
    }

    try {
      await page.screenshot({ path: `${baseName}.png`, fullPage: true });
      console.log(`🖼️ 已保存安全码上下文截图: ${baseName}.png`);
    } catch (err) {
      console.warn('⚠️ 保存安全码上下文截图失败:', err);
    }

    const frames = page.frames();
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      try {
        const frameElement = await frame.frameElement().catch(() => null);
        if (!frameElement) {
          continue;
        }
        const framePath = `${baseName}-frame-${index}.png`;
        await frameElement.screenshot({ path: framePath });
        console.log(`🖼️ 已保存安全码子框架截图: ${framePath}`);
      } catch (err) {
        console.warn(`⚠️ 保存子框架截图失败 (index=${index}):`, err);
      }
    }
  }

  private async evaluatePasscodeState(page: Page): Promise<PasscodeState | null> {
    try {
      return await page.evaluate(() => {
        const topWin = (globalThis as any).top || (globalThis as any);
        const userData = topWin?.userData || {};
        const memSet = topWin?.memSet || {};
        return {
          userData: {
            username: userData.username,
            mid: userData.mid,
            four_pwd: userData.four_pwd,
            msg: userData.msg,
            abox4pwd_notshow: userData.abox4pwd_notshow,
            passwd_safe: userData.passwd_safe,
          },
          memSet: {
            passcode: memSet.passcode,
            fourPwd: memSet.fourPwd,
          },
          cookies: (globalThis as any).document?.cookie || '',
        } as PasscodeState;
      });
    } catch (err) {
      console.warn('⚠️ 获取 passcode 状态失败:', err);
      return null;
    }
  }

  private async handlePasscodeRequirement(page: Page, account: CrownAccount): Promise<PasscodeHandlingResult> {
    console.log('🛡️ 检测到四位安全码提示，准备处理');
    this.lastPasscodeRejected = false;

    const state = await this.evaluatePasscodeState(page);
    if (state) {
      console.log('[passcode_state]', JSON.stringify(state));
    }

    const storedPasscode = this.normalizePasscode(account.passcode);
    const cachedPasscode = this.normalizePasscode(this.passcodeCache.get(account.id));
    const statePasscode = this.normalizePasscode(state?.memSet?.passcode);

    try {
      const promptDisabledEarly = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const node = doc?.querySelector?.('#text_error, .text_error');
        if (!node) {
          return false;
        }
        const text = (node.textContent || '').toLowerCase();
        if (!text) {
          return false;
        }
        const hasPasscodeKeyword = /passcode|four|四位|簡易|简易|4位/.test(text);
        const hasDisableKeyword = /disabled|禁用|禁止|不可|無法|不能|已被|based on security|security/.test(text);
        return hasPasscodeKeyword && hasDisableKeyword;
      });
      if (promptDisabledEarly) {
        console.log('ℹ️ 检测到简易密码被禁用提示（登录阶段），直接进入改密流程');
        await page.evaluate(() => {
          const globalScope = (globalThis as any);
          const topWin = globalScope?.top || globalScope;
          try { topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {}); } catch {}
          try { topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {}); } catch {}
        }).catch(() => undefined);
        const normalizedStoredEarly = storedPasscode || '';
        let finalPasscodeEarly = storedPasscode || cachedPasscode || statePasscode;
        if (!finalPasscodeEarly) {
          finalPasscodeEarly = this.generatePasscode(account);
        }
        account.passcode = finalPasscodeEarly;
        this.passcodeCache.set(account.id, finalPasscodeEarly);
        try {
          await this.persistPasscode(account, finalPasscodeEarly, normalizedStoredEarly, 'input');
        } catch (persistErr) {
          console.warn('⚠️ 保存简易密码失败:', persistErr);
        }
        return {
          success: true,
          passcode: finalPasscodeEarly,
          mode: 'input',
        };
      }
    } catch (disableErr) {
      console.warn('⚠️ 判断简易密码禁用提示失败:', disableErr);
    }

    let groups: PasscodeGroup[] = [];
    await this.ensurePasscodeInterface(page, 'initial');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      groups = await this.collectPasscodeGroups(page);
      if (groups.length > 0) {
        break;
      }

      const confirmClicked = await this.clickPasscodeConfirm(page, null);
      if (confirmClicked) {
        console.log('🟢 已确认设置四位简易密码，等待输入表单出现');
        await this.randomDelay(400, 700);
        await this.ensurePasscodeInterface(page, `after-confirm-${attempt}`);
        continue;
      }

      if (attempt === 0) {
        await this.dumpPasscodeContext(page, 'passcode-context-confirm');
      }

      await this.ensurePasscodeInterface(page, `retry-${attempt}`);
      await this.randomDelay(300, 500);
    }

    console.log('[passcode_debug] groups after retries:', groups.length);

    let passcode = storedPasscode || cachedPasscode || statePasscode;

    if (!passcode) {
      passcode = this.generatePasscode(account);
      console.log(`🔐 生成新的简易密码 ${this.maskPasscode(passcode)}`);
    } else {
      console.log(`🔐 使用已有的简易密码 ${this.maskPasscode(passcode)}`);
    }

    this.passcodeCache.set(account.id, passcode);
    account.passcode = passcode;

    const normalizedStored = storedPasscode || '';

    if (groups.length === 0) {
      const keypadAttempt = await this.tryHandlePasscodeKeypad(page, passcode);
      if (keypadAttempt.found) {
        if (keypadAttempt.success) {
          await this.persistPasscode(account, passcode, normalizedStored, 'keypad');
          return { success: true, passcode, mode: 'keypad' };
        }

        if (keypadAttempt.reason === 'keypad_rejected') {
          this.lastPasscodeRejected = true;
        }

        console.warn(`⚠️ 数字简易密码面板处理失败: ${keypadAttempt.reason || 'unknown'}`);
        if (keypadAttempt.errorText) {
          console.warn(`ℹ️ 面板提示: ${keypadAttempt.errorText}`);
        }

        if (keypadAttempt.reason && /keypad_digit/i.test(keypadAttempt.reason)) {
          console.log('ℹ️ 数字键盘按键不可用，视为简易密码被禁用，继续改密流程');
          await page.evaluate(() => {
            const globalScope = (globalThis as any);
            const topWin = globalScope?.top || globalScope;
            try { topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {}); } catch {}
            try { topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {}); } catch {}
          }).catch(() => undefined);
          await this.persistPasscode(account, passcode, normalizedStored, 'keypad');
          return { success: true, passcode, mode: 'keypad' };
        }
      }

      console.log('[passcode_sync] attempting API fallback');
      const apiSynced = await this.syncPasscodeViaApi(page, passcode);
      if (apiSynced) {
        await this.randomDelay(400, 700);
        const postState = await this.resolvePostLoginState(page);
        if (postState === 'success') {
          const resolvedPasscode = this.normalizePasscode(state?.memSet?.passcode)
            || this.normalizePasscode(account.passcode)
            || this.normalizePasscode(this.passcodeCache.get(account.id))
            || this.generatePasscode(account);
          console.log('[passcode_sync] 已通过服务端同步直接进入主页');
          account.passcode = resolvedPasscode;
          this.passcodeCache.set(account.id, resolvedPasscode);
          await this.persistPasscode(account, resolvedPasscode, normalizedStored, 'input');
          return { success: true, passcode: resolvedPasscode, mode: 'input' };
        }

        if (postState === 'password_change') {
          console.warn('⚠️ 同步后仍需要修改密码，无法自动处理四位码');
          return { success: false, reason: 'password_change_required' };
        }

        await this.ensurePasscodeInterface(page, 'after-sync');
        groups = await this.collectPasscodeGroups(page);
      }
    }

    if (groups.length === 0) {
      let passwordChangeVisible = await page
        .locator('.content_chgpwd:visible, #chgPwd_show:visible, #chgAcc_show:visible')
        .count()
        .catch(() => 0);

      if (passwordChangeVisible === 0) {
        passwordChangeVisible = await page
          .locator('.content_chgpwd, #chgPwd_show, #chgAcc_show')
          .count()
          .catch(() => 0);
      }

      if (passwordChangeVisible > 0) {
        console.log('ℹ️ 检测到皇冠强制改密页面，跳过四位码流程');
        return { success: true, mode: 'input' };
      }

      try {
        const promptDisabled = await page.evaluate(() => {
          const doc = (globalThis as any).document;
          const node = doc?.querySelector?.('#text_error, .text_error');
          if (!node) {
            return false;
          }
          const text = (node.textContent || '').toLowerCase();
          if (!text) {
            return false;
          }
          const hasPasscodeKeyword = /passcode|four|四位|簡易|简易|4位/.test(text);
          const hasDisableKeyword = /disabled|禁用|禁止|不可|無法|不能|已被|based on security|security/.test(text);
          return hasPasscodeKeyword && hasDisableKeyword;
        });
        if (promptDisabled) {
          console.log('ℹ️ 四位简易密码已被禁用，跳过 passcode 处理');
          await page.evaluate(() => {
            const globalScope = (globalThis as any);
            const topWin = globalScope?.top || globalScope;
            try {
              topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {});
            } catch {}
            try {
              topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {});
            } catch {}
            try {
              topWin?.show_prepasscode?.();
            } catch {}
            try {
              if (typeof topWin?.dispatchEvent === 'function') {
                topWin.dispatchEvent('show_prepasscode', {});
                topWin.dispatchEvent('show_back_4pwd', {});
              }
            } catch {}
          }).catch(() => undefined);
          const normalizedPass = this.normalizePasscode(account.passcode);
          if (normalizedPass) {
            return { success: true, passcode: normalizedPass, mode: 'input' };
          }
          return { success: true, mode: 'input' };
        }
      } catch (disableErr) {
        console.warn('⚠️ 判断四位密码禁用状态失败:', disableErr);
      }

      console.warn('⚠️ 未找到四位安全码输入框，无法自动处理');
      await this.dumpPasscodeContext(page, 'passcode-context-missing');
      await this.dumpPasscodeDebug(page, `passcode-missing-${Date.now()}.html`);
      return { success: false, reason: 'inputs_not_found' };
    }

    const group = groups[0];
    const mode: 'setup' | 'input' = group.inputs.length >= 2 ? 'setup' : 'input';

    const marker = await this.setPasscodeMarker(group);

    try {
      if (mode === 'input' && state?.userData?.four_pwd === 'second') {
        console.log('ℹ️ 检测到 four_pwd=second，准备使用已有简易密码重新输入');
        try {
          const confirmText = await group.context
            .locator('#C_alert_confirm:visible, #alert_confirm:visible, .popup_content:visible')
            .allInnerTexts()
            .catch(() => []);
          if (confirmText && confirmText.length > 0) {
            console.log('🧾 四位码提示文本:', confirmText.map(text => text.replace(/\s+/g, ' ')).join(' | '));
          }
        } catch (innerErr) {
          console.warn('⚠️ 获取四位码提示文本失败:', innerErr);
        }
      }

      const fieldsToFill = group.inputs.slice(0, mode === 'setup' ? 2 : 1);
      for (const candidate of fieldsToFill) {
        await candidate.locator.fill('');
        await this.randomDelay(60, 120);
        await candidate.locator.type(passcode, { delay: Math.floor(Math.random() * 50) + 65 });
        await this.randomDelay(100, 200);
      }
    } catch (err) {
      console.warn('⚠️ 简易密码输入时发生异常:', err);
      await this.clearPasscodeMarker(group.context, marker);
      await this.dumpPasscodeDebug(page, `passcode-input-fail-${Date.now()}.html`);
      return { success: false, reason: 'input_failed', mode };
    }

    const clicked = await this.clickPasscodeConfirm(group.context, marker);
    if (!clicked) {
      await this.clearPasscodeMarker(group.context, marker);
      await this.dumpPasscodeDebug(page, `passcode-confirm-missing-${Date.now()}.html`);
      return { success: false, reason: 'confirm_not_found', mode };
    }

    await this.clearPasscodeMarker(group.context, marker);

    const dismissed = await this.waitForPasscodeDismiss(page, 16000);
    if (!dismissed) {
      console.warn('⚠️ 四位安全码提示未按预期消失');
      await this.dumpPasscodeDebug(page, `passcode-dismiss-timeout-${Date.now()}.html`);
      return { success: false, reason: 'dismiss_timeout', mode };
    }

    await this.persistPasscode(account, passcode, normalizedStored, mode);

    return { success: true, passcode, mode };
  }

  private async resolvePasscodePrompt(page: Page, account: CrownAccount, initialResult: LoginDetectionResult): Promise<LoginDetectionResult> {
    let attempts = 0;
    let result = initialResult;

    while (attempts < 3) {
      const message = (result.message || '').toLowerCase();
      let requiresPasscode = (result.status === 'success' && message === 'passcode_prompt')
        || (result.status === 'error' && message === 'passcode_prompt');

      if (requiresPasscode) {
        try {
          const promptDisabled = await page.evaluate(() => {
            const doc = (globalThis as any).document;
            const node = doc?.querySelector?.('#text_error, .text_error');
            if (!node) {
              return false;
            }
            const text = (node.textContent || '').toLowerCase();
            if (!text) {
              return false;
            }
            const hasPasscodeKeyword = /passcode|four|四位|簡易|简易|4位/.test(text);
            const hasDisableKeyword = /disabled|禁用|禁止|不可|無法|不能|已被|based on security|security/.test(text);
            return hasPasscodeKeyword && hasDisableKeyword;
          });
          if (promptDisabled) {
            console.log('ℹ️ 检测到系统提示四位密码禁用，直接进入改密流程');
            await page.evaluate(() => {
              const globalScope = (globalThis as any);
              const topWin = globalScope?.top || globalScope;
              try {
                topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {});
              } catch {}
              try {
                topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {});
              } catch {}
              try {
                topWin?.show_prepasscode?.();
              } catch {}
            }).catch(() => undefined);
            requiresPasscode = false;
          }
        } catch (promptErr) {
          console.warn('⚠️ 检查四位密码禁用提示失败:', promptErr);
        }
      }

      if (!requiresPasscode && result.status === 'timeout') {
        try {
          requiresPasscode = await this.isPasscodePromptVisible(page);
        } catch {
          requiresPasscode = false;
        }

        if (!requiresPasscode) {
          requiresPasscode = await page.evaluate(() => {
            const doc = (globalThis as any).document;
            if (!doc) {
              return false;
            }
            const yesBtn = doc.querySelector('#btn_pwd4_yes, #btn_passcode_ok, #C_yes_btn, #yes_btn, .btn_passcode_confirm');
            const passcodeBox = doc.querySelector('#prepasscode, .content_chgpwd, .passcode_box, .passcode_area');
            if (passcodeBox) {
              const style = (globalThis as any).window?.getComputedStyle?.(passcodeBox as any);
              if (style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                return true;
              }
            }
            if (yesBtn) {
              const parent = (yesBtn as any).closest?.('#alert_confirm, #C_alert_confirm, .popup_bottom, .popup_content');
              const text = parent?.textContent || '';
              return /四位|4位|简易|簡易|passcode|簡碼|简码/.test(text);
            }
            return false;
          }).catch(() => false);
        }
      }

      if (!requiresPasscode) {
        try {
          const state = await this.evaluatePasscodeState(page);
          if (state) {
            const passcodeFromState = this.normalizePasscode(state.memSet?.passcode);
            const fourPwdPending = this.isFourPwdPending(state.userData?.four_pwd);
            const msgNormalized = (state.userData?.msg || '').toString().trim().toLowerCase();
            if (fourPwdPending || (passcodeFromState && msgNormalized !== 'success' && msgNormalized !== 'done')) {
              requiresPasscode = true;
              console.log('[passcode_state_hint]', JSON.stringify(state));
            }
          }
        } catch (stateErr) {
          console.warn('⚠️ 读取 passcode 状态失败:', stateErr);
        }
      }

      if (!requiresPasscode && this.lastPasscodeRejected) {
        requiresPasscode = true;
      }

      if (!requiresPasscode) {
        try {
          const promptDisabled = await page.evaluate(() => {
            const doc = (globalThis as any).document;
            const textNode = doc?.querySelector?.('#text_error, .text_error');
            if (!textNode) {
              return false;
            }
            const text = (textNode.textContent || '').toLowerCase();
            if (!text) {
              return false;
            }
            const hasPasscodeKeyword = /passcode|four|四位|簡易|简易|4位/.test(text);
            const hasDisableKeyword = /disabled|禁用|禁止|不可|無法|不能|已被|based on security|security/.test(text);
            return hasPasscodeKeyword && hasDisableKeyword;
          });
          if (promptDisabled) {
            console.log('ℹ️ 系统提示四位密码被禁用，跳过 passcode 流程');
            return result;
          }
        } catch (promptErr) {
          console.warn('⚠️ 检查四位密码禁用提示失败:', promptErr);
        }
        return result;
      }

      attempts += 1;
      const handling = await this.handlePasscodeRequirement(page, account);
      if (!handling.success) {
        let messageKey = 'passcode_setup_failed';
        if (handling.reason === 'inputs_not_found') {
          messageKey = 'passcode_prompt_not_found';
        } else if (handling.reason === 'password_change_required') {
          messageKey = 'password_change_required';
        }
        return {
          status: 'error',
          message: messageKey,
          debug: { reason: handling.reason, mode: handling.mode },
        };
      }

      await this.randomDelay(400, 700);
      const passwordChangeVisible = await page
        .locator('.content_chgpwd:visible, #chgPwd_show:visible, #chgAcc_show:visible')
        .count()
        .catch(() => 0);
      if (passwordChangeVisible > 0) {
        console.log('ℹ️ 四位码处理完成后检测到改密页面');
        return {
          status: 'error',
          message: 'password_change_required',
          debug: { reason: 'password_change_after_passcode' },
        };
      }
      result = await this.waitForLoginResult(page, 20000);
    }

    return result;
  }

  private async humanLikeType(page: Page, selector: string, text: string) {
    try {
      console.log(`  ⏳ 等待输入框 ${selector} 可见...`);
      const input = page.locator(selector);
      await input.waitFor({ state: 'visible', timeout: 10000 });
      console.log(`  ✅ 输入框 ${selector} 已可见`);

      console.log(`  🖱️  点击输入框 ${selector}...`);
      await input.click();
      await this.randomDelay(80, 150);

      console.log(`  🗑️  清空输入框内容...`);
      await input.fill('');
      await this.randomDelay(80, 150);

      console.log(`  ⌨️  开始输入内容 (${text.length} 个字符)...`);
      // 逐字符输入，模拟真实打字速度
      for (const char of text) {
        await input.type(char, { delay: Math.floor(Math.random() * 100) + 50 });
      }
      console.log(`  ✅ 输入完成`);

      await this.randomDelay(100, 300);
    } catch (error) {
      console.error(`  ❌ 输入失败 ${selector}:`, error);
      throw error;
    }
  }

  // 登录皇冠账号
  async loginAccount(account: CrownAccount): Promise<CrownLoginResult> {
    console.log('[[loginAccount_version_v2]]', account.username);
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      console.log(`🔐 开始登录账号: ${account.username}`);
      this.lastPasscodeRejected = false;

      // 确保浏览器已初始化
      if (!this.browser) {
        await this.initBrowser();
      }

      // 创建新的浏览器上下文
      context = await this.createStealthContext(account);
      page = await context.newPage();

      // 设置请求拦截器
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = request.url();

        const blockedKeywords = ['webdriver', 'automation', 'ghost', 'headless'];
        if (blockedKeywords.some(keyword => url.toLowerCase().includes(keyword))) {
          await route.abort();
          return;
        }

        await route.continue();
      });

      // 访问皇冠登录页面
      await page.goto(LOGIN_PAGE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      // 页面会自动重定向至 transform.php，等待登录面板加载
      await page.waitForLoadState('networkidle', { timeout: 18000 }).catch(() => undefined);

      await page.waitForFunction(() => {
        const doc = (globalThis as any).document as any;
        const username = doc?.querySelector?.('#usr');
        const password = doc?.querySelector?.('#pwd');
        return !!(username && password);
      }, { timeout: 25000 });

      // 强力移除所有可能遮挡输入框的元素
      console.log('🔧 开始移除登录页所有遮挡元素...');
      const removedCount = await page.evaluate(() => {
        const globalObj = globalThis as any;
        const doc = globalObj?.document;
        if (!doc) return 0;

        let count = 0;

        // 1. 移除所有弹窗类元素
        const popupSelectors = [
          '.popup', '.popup_bottom', '.popup_center', '.popup_game',
          '.popup_bet', '.popup_toast', '[id*="alert"]', '[id*="popup"]',
          '[class*="modal"]', '[class*="dialog"]', '[class*="overlay"]',
          '[id*="mask"]', '[class*="mask"]'
        ];

        popupSelectors.forEach((selector: string) => {
          try {
            const elements = doc.querySelectorAll(selector);
            elements.forEach((el: any) => {
              if (el && el.parentNode) {
                el.parentNode.removeChild(el);
                count++;
              }
            });
          } catch (e) {
            // 忽略选择器错误
          }
        });

        // 2. 移除所有 z-index > 100 的元素（通常是遮罩层）
        const allElements = doc.querySelectorAll('*');
        allElements.forEach((el: any) => {
          try {
            const style = globalObj.window?.getComputedStyle?.(el);
            const zIndex = style ? parseInt(style.zIndex || '0', 10) : 0;
            if (zIndex > 100 && el.id !== 'usr' && el.id !== 'pwd' && el.id !== 'btn_login') {
              if (el.parentNode) {
                el.parentNode.removeChild(el);
                count++;
              }
            }
          } catch (e) {
            // 忽略处理错误
          }
        });

        return count;
      });
      console.log(`✅ 已移除 ${removedCount} 个遮挡元素`);
      await this.randomDelay(500, 800);

      // 确保语言切换为简体中文，避免控件命名差异
      try {
        const langCn = page.locator('#lang_cn');
        if (await langCn.count().catch(() => 0)) {
          const isActive = await langCn.evaluate((el) => {
            const className = (el?.className || '').toString();
            return className.split(/\s+/).includes('on');
          }).catch(() => false);
          if (!isActive) {
            console.log('🌐 切换登录语言为简体中文');
            await langCn.click({ timeout: 3000, force: true }).catch((err) => {
              console.warn('⚠️ 切换语言失败:', err);
            });
            await this.randomDelay(300, 500);
          }
        }
      } catch (langErr) {
        console.warn('⚠️ 检查登录语言时出现异常:', langErr);
      }

      // 填写账号密码
      console.log(`🔑 准备填写账号: ${account.username}`);
      await this.humanLikeType(page, '#usr', account.username.trim());
      console.log('✅ 账号填写完成');

      await this.randomDelay(400, 700);

      console.log('🔐 准备填写密码...');
      await this.humanLikeType(page, '#pwd', account.password.trim());
      console.log('✅ 密码填写完成');

      await this.randomDelay(400, 700);

      // 点击登录按钮
      const loginButton = page.locator('#btn_login').first();
      if (await loginButton.count() === 0) {
        throw new Error('未找到登录按钮');
      }

      try {
        await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        await loginButton.waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
      }
      await loginButton.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForFunction((selector) => {
        const g = globalThis as any;
        const doc = g?.document as any;
        if (!doc?.querySelector) {
          return false;
        }
        const el = doc.querySelector(selector);
        if (!el) {
          return false;
        }
        const style = g?.getComputedStyle ? g.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          return false;
        }
        const rect = el.getBoundingClientRect?.();
        return !!rect && rect.width > 0 && rect.height > 0;
      }, '#btn_login', { timeout: 10000 }).catch(() => undefined);

      try {
        await loginButton.click({ delay: 100 });
      } catch (clickError) {
        console.warn('⚠️ 登录按钮点击失败，尝试使用 force 选项:', clickError);
        await loginButton.click({ delay: 100, force: true }).catch((forceError) => {
          throw forceError;
        });
      }

      // 登录后优先处理登录页的通用提示（记住账号/浏览器推荐等），尽快推进到下一步
      await this.handlePostLoginPrompts(page).catch(() => undefined);

      const loginResultPromise = this.waitForLoginResult(page, 18000);
      const passcodeWatcher = page
        .waitForFunction((selector) => {
          const g = globalThis as any;
          const doc = g?.document as any;
          const el = doc?.querySelector?.(selector);
          if (!el) {
            return false;
          }
          const classList = el.classList;
          return !!(classList && typeof classList.contains === 'function' && classList.contains('pass_outside'));
        }, '#acc_show', { timeout: 15000 })
        .then(() => ({
          status: 'success' as const,
          message: 'passcode_prompt',
          debug: { source: 'passcode_watch' },
        }))
        .catch(() => null);

      // 等待登录结果
      let loginResult = await Promise.race([loginResultPromise, passcodeWatcher]) as Awaited<ReturnType<typeof this.waitForLoginResult>> | null;

      if (!loginResult) {
        loginResult = await loginResultPromise;
      } else if (loginResult.message === 'passcode_prompt') {
        loginResultPromise.catch(() => null);
      }

      console.log('🔎 登录检测结果:', loginResult);

      loginResult = await this.resolvePasscodePrompt(page, account, loginResult);

      if (loginResult.status === 'error' && loginResult.message === 'force_logout') {
        console.log('🚨 检测到踢人弹窗，尝试处理...');

        // 尝试点击踢人确认按钮
        try {
          const kickButton = page.locator('#alert_kick .btn_send, #alert_kick button');
          const isVisible = await kickButton.isVisible().catch(() => false);
          if (isVisible) {
            await kickButton.click({ force: true });
            console.log('✅ 已点击踢人确认按钮');
            await this.randomDelay(800, 1200);
          }
        } catch (e) {
          console.log('⚠️ 点击踢人按钮失败:', e);
        }

        // 重新检查登录状态
        const recheckResult = await this.waitForLoginResult(page, 10000);
        console.log('🔍 处理踢人弹窗后重新检查:', recheckResult);

        if (recheckResult.status === 'success') {
          loginResult = { status: 'success' };
        } else {
          const fallbackState = await this.resolvePostLoginState(page);
          if (fallbackState === 'success') {
            loginResult = { status: 'success' };
          } else {
            loginResult = { status: 'error', message: 'force_logout' };
          }
        }
      }

      const credentialChange = await this.detectCredentialChangeForm(page, 8000).catch(() => null);

      if (loginResult.status === 'success' || credentialChange) {
        if (loginResult.status === 'success') {
          await this.handlePostLoginPrompts(page);
        }
        const sessionInfo = {
          cookies: await context.cookies(),
          storageState: await context.storageState(),
          url: page.url(),
          userAgent: await page.evaluate(() => navigator.userAgent),
        };

        this.contexts.set(account.id, context);
        this.pages.set(account.id, page);
        this.sessionInfos.set(account.id, sessionInfo);
        this.lastHeartbeats.set(account.id, Date.now());
        if (account.id === 0) {
          this.systemLastBeat = Date.now();
          this.systemLastLogin = Date.now();
        }

        const needsChange = !!credentialChange;

        if (needsChange) {
          console.log(`⚠️ 账号 ${account.username} 登录后检测到强制改密页面`);
        } else {
          console.log(`✅ 账号 ${account.username} 登录成功`);
        }

        if (!needsChange && account.id > 0) {
          try {
            await query(
              `INSERT INTO crown_account_sessions (account_id, session_data, updated_at)
               VALUES ($1, $2, CURRENT_TIMESTAMP)
               ON CONFLICT (account_id) DO UPDATE
                 SET session_data = EXCLUDED.session_data,
                     updated_at = CURRENT_TIMESTAMP`,
              [account.id, sessionInfo]
            );
          } catch (sessionError) {
            console.error('⚠️ 保存会话信息失败:', sessionError);
          }

          try {
            const financial = await this.getAccountFinancialSnapshot(account.id);
            if (financial.balance !== null) {
              await query(
                `UPDATE crown_accounts
                   SET balance = $1, is_online = true, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [financial.balance, account.id]
              );
            } else {
              await query(
                `UPDATE crown_accounts
                   SET is_online = true, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [account.id]
              );
            }
          } catch (balanceError) {
            console.warn('⚠️ 登录后刷新余额失败（忽略）:', balanceError);
          }
        }

        return {
          success: true,
          message: needsChange ? '登录成功，需修改密码' : '登录成功',
          sessionInfo,
          needsCredentialChange: needsChange,
        };
      }

      let finalMessage = loginResult.message;
      const passcodeStillVisible = await this.isPasscodePromptVisible(page);
      if (passcodeStillVisible) {
        finalMessage = 'passcode_prompt';
      }
      if (finalMessage === 'passcode_prompt') {
        try {
          const passcodeState = await page.evaluate(() => {
            const topWin = (globalThis as any).top || (globalThis as any);
            const userData = topWin?.userData || {};
            const memSet = topWin?.memSet || {};
            return {
              userData: {
                username: userData.username,
                mid: userData.mid,
                four_pwd: userData.four_pwd,
                msg: userData.msg,
                abox4pwd_notshow: userData.abox4pwd_notshow,
                passwd_safe: userData.passwd_safe,
              },
              memSet: {
                passcode: memSet.passcode,
                fourPwd: memSet.fourPwd,
              },
              cookies: (globalThis as any).document?.cookie || '',
            };
          });
          console.log('[passcode_state]', JSON.stringify(passcodeState));
        } catch (stateErr) {
          console.warn('⚠️ 采集 passcode 状态失败:', stateErr);
        }
      }
      console.log('[loginAccount] rawMessage:', loginResult.message, 'finalMessage:', finalMessage);
      const failureMessage = this.composeLoginFailureMessage(
        finalMessage,
        loginResult.debug,
      );
      console.log('[[debug_marker_after_failure]]');
      try {
        const debugState = await this.collectLoginDebugState(page);
        if (debugState) {
          console.log('[login_debug_state]', debugState);
        } else {
          console.warn('⚠️ 未能收集登录调试状态（返回空）');
        }
      } catch (debugErr) {
        console.warn('⚠️ 获取登录调试状态失败:', debugErr);
      }
      console.log(`❌ 账号 ${account.username} 登录失败: ${failureMessage}`);
      try {
        const noBtnCount = await page.locator('#C_no_btn').count();
        console.log(`🔁 #C_no_btn 元素数量: ${noBtnCount}`);
      } catch (locError) {
        console.warn('⚠️ 检查 #C_no_btn 时出错:', locError);
      }
      try {
        await page.screenshot({ path: `login-fail-${account.username}-${Date.now()}.png`, fullPage: true });
        const html = await page.content();
        await fs.writeFile(`login-fail-${account.username}-${Date.now()}.html`, html);
        await this.pruneSnapshotArtifacts([
          `login-fail-${account.username}-`,
          `login-error-${account.username}-`,
          'passcode-',
        ]);
      } catch (screenshotError) {
        console.warn('⚠️ 无法保存失败截图:', screenshotError);
      }

      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);

      return {
        success: false,
        message: failureMessage,
      };

    } catch (error) {
      console.error(`❌ 账号 ${account.username} 登录出错:`, error);
      try {
        if (page) {
          await page.screenshot({ path: `login-error-${account.username}-${Date.now()}.png`, fullPage: true });
          const html = await page.content();
          await fs.writeFile(`login-error-${account.username}-${Date.now()}.html`, html);
          await this.pruneSnapshotArtifacts([
            `login-fail-${account.username}-`,
            `login-error-${account.username}-`,
            'passcode-',
          ]);
        }
      } catch (screenshotError) {
        console.error('⚠️ 保存失败截图时出错:', screenshotError);
      }
      const existingContext = this.contexts.get(account.id);
      if (existingContext) {
        await existingContext.close().catch(() => undefined);
        this.contexts.delete(account.id);
      }
      this.pages.delete(account.id);
      this.sessionInfos.delete(account.id);

      return {
        success: false,
        message: error instanceof Error ? error.message : `登录出错: ${String(error)}`,
      };
    }
  }

  async initializeAccountCredentials(
    account: CrownAccount,
    nextCredentials: { username: string; password: string },
  ): Promise<{ success: boolean; message: string; updatedCredentials: { username: string; password: string } }> {
    console.log(`🧩 开始自动初始化账号 ${account.username}`);
    // 1) 先用当前库中密码尝试登录；如失败且疑似“密码错误”，再用目标新密码回退尝试，
    //    以覆盖“之前已被人工或其他流程改为目标密码”的情况。
    let loginResult = await this.loginAccount(account);
    if (!loginResult.success) {
      const msg = (loginResult.message || '').toString();
      const looksWrongPwd = /不正确|錯誤|incorrect|invalid/i.test(msg);
      if (looksWrongPwd) {
        console.log('ℹ️ 使用数据库密码登录失败，尝试用目标新密码直接登录以检查是否已改密');
        const fallbackAccount: CrownAccount = { ...account, password: nextCredentials.password } as CrownAccount;
        const retry = await this.loginAccount(fallbackAccount);
        if (retry.success) {
          // 已是目标密码：直接返回成功，并让调用方用新密码更新数据库
          await this.logoutAccount(account.id).catch(() => undefined);
          console.log('✅ 使用目标新密码直接登录成功，视为已完成改密');
          return {
            success: true,
            message: '已是目标密码，无需再次改密',
            updatedCredentials: { username: account.username, password: nextCredentials.password },
          };
        }
      }
      await this.logoutAccount(account.id).catch(() => undefined);
      return {
        success: false,
        message: loginResult.message || '登录失败，无法初始化账号',
        updatedCredentials: { username: account.username, password: account.password },
      };
    }

    let page = this.pages.get(account.id);
    let context = this.contexts.get(account.id);

    if (!page || !context) {
      await this.logoutAccount(account.id).catch(() => undefined);
      return {
        success: false,
        message: '未获得有效的浏览器会话，请稍后重试',
        updatedCredentials: { username: account.username, password: account.password },
      };
    }

    try {
      let handledAny = false;
      let latestUsername = (account.username || '').trim();
      let latestPassword = (account.password || '').trim();
      let passwordChanged = false;

      let attempt = 0;
      let repeatedLoginIdCount = 0;
      let loginIdCompleted = false;
      let forcedPasswordReveal = false;
      while (attempt < 6) {
        console.log(`[[init_pwd]] loop attempt=${attempt}`);
        const detection = await this.detectCredentialChangeForm(page, attempt === 0 ? 20000 : 8000);
        console.log(`[[init_pwd]] detection=${detection ? detection.selectors.formType : 'null'}`);
        if (!detection) {
          if (loginIdCompleted && !passwordChanged) {
            if (!forcedPasswordReveal) {
              forcedPasswordReveal = true;
              console.log('ℹ️ 尝试强制打开改密页面');
              await this.acknowledgeCredentialPrompts(page, 8000).catch(() => undefined);
              await page.evaluate(() => {
                const globalScope = (globalThis as any);
                const topWin = globalScope?.top || globalScope;
                try { topWin?.goToPage?.('acc_show', 'chgPwd_show', () => undefined, {}); } catch {}
                try { topWin?.goToPage?.('acc_show', 'chgAcc_show', () => undefined, {}); } catch {}
                try { topWin?.show_prepasscode?.(); } catch {}
              }).catch(() => undefined);
              await this.randomDelay(500, 800);
              const passwordFormForced = await page
                .locator('.content_chgpwd:visible, #chgPwd_show:visible, #chgAcc_show:visible')
                .count()
                .catch(() => 0);
              if (passwordFormForced > 0) {
                console.log('✅ 已强制展示改密页面，重新检测');
                forcedPasswordReveal = true;
                continue;
              }
            }

            await this.acknowledgeCredentialPrompts(page, 8000).catch(() => undefined);
            const loginFieldVisible = await page.locator('#usr:visible').count().catch(() => 0);
            if (loginFieldVisible > 0) {
              console.log('🔁 未检测到密码改密页面，重新登录后再试');
              const reLoginResult = await this.performLoginWithCredentials(page, latestUsername, latestPassword, account);
              if (!reLoginResult.success) {
                return {
                  success: false,
                  message: reLoginResult.message
                    ? `登录账号更新成功，但重新登录失败: ${reLoginResult.message}`
                    : '登录账号更新成功，但重新登录失败',
                  updatedCredentials: { username: latestUsername, password: latestPassword },
                };
              }
              await this.acknowledgeCredentialPrompts(page).catch(() => undefined);
              attempt += 1;
              await this.randomDelay(600, 900);
              continue;
            }
          }

          // 即使未处于“登录账号更新完成”阶段，只要页面能强制唤起改密表单，也直接尝试提交
          const ensured = await this.ensurePasswordForm(page);
          console.log(`[[init_pwd]] ensurePasswordForm=${ensured}`);
          if (!passwordChanged && ensured) {
            console.log('ℹ️ 未检测到改密表单选择器，但页面已显示或可唤起改密内容，尝试直接提交');
            const passwordResult = await this.submitPasswordChange(page, account, latestPassword, nextCredentials.password);
            if (!passwordResult.success) {
              return {
                success: false,
                message: passwordResult.message || '改密提交失败',
                updatedCredentials: { username: latestUsername, password: latestPassword },
              };
            }
            passwordChanged = true;
            latestPassword = nextCredentials.password.trim();
            handledAny = true;

            console.log('✅ 密码已更新，重新登录以验证');
            const verifyAfterPassword = await this.performLoginWithCredentials(page, latestUsername, latestPassword, account);
            if (!verifyAfterPassword.success) {
              return {
                success: false,
                message: verifyAfterPassword.message || '使用新密码重新登录失败',
                updatedCredentials: { username: latestUsername, password: latestPassword },
              };
            }

            await this.acknowledgeCredentialPrompts(page).catch(() => undefined);
            await this.randomDelay(600, 900);
            continue;
          }

          if (!handledAny) {
            // 作为最后一次兜底，即便未能确保表单展示，仍尝试直接提交一次，便于产生日志与页面错误提示
            console.log('ℹ️ 未检测到改密页面，尝试盲提交一次以采集错误与结构');
            try {
              const url = page.url();
              const visCnt = await page.locator('.content_chgpwd:visible, #chgPwd_show:visible, #chgAcc_show:visible').count().catch(() => -1);
              console.log(`[[init_pwd]] blind-submit precheck url=${url} containersVisible=${visCnt}`);
            } catch {}
            const blindSubmit = await this.submitPasswordChange(page, account, latestPassword, nextCredentials.password);
            if (blindSubmit.success) {
              passwordChanged = true;
              latestPassword = nextCredentials.password.trim();
              handledAny = true;
              console.log('✅ 盲提交改密成功，重新登录以验证');
              const verifyAfterPassword = await this.performLoginWithCredentials(page, latestUsername, latestPassword, account);
              if (!verifyAfterPassword.success) {
                return {
                  success: false,
                  message: verifyAfterPassword.message || '使用新密码重新登录失败',
                  updatedCredentials: { username: latestUsername, password: latestPassword },
                };
              }
            } else {
              // 盲提交失败则直接返回该错误信息（其中包含(pwd)点击尝试日志）
              return {
                success: false,
                message: blindSubmit.message || '未检测到皇冠改密页面，请确认账号是否需要初始化',
                updatedCredentials: { username: account.username, password: account.password },
              };
            }
          }
          break;
        }

        console.log(`🔄 当前改密阶段: ${detection.selectors.formType}`);

        if (loginIdCompleted && detection.selectors.formType === 'loginId') {
          repeatedLoginIdCount += 1;
          // 如果多次仍停留在创建账号表单，主动尝试唤起并提交密码改密表单
          if (repeatedLoginIdCount > 2) {
            console.log('ℹ️ 登录账号已更新，但仍停留在账号创建表单，尝试直接进入密码改密流程');
            const ensured = await this.ensurePasswordForm(page);
            if (ensured) {
              const passwordResult = await this.submitPasswordChange(page, account, latestPassword, nextCredentials.password);
              if (!passwordResult.success) {
                return {
                  success: false,
                  message: passwordResult.message || '改密提交失败',
                  updatedCredentials: { username: latestUsername, password: latestPassword },
                };
              }
              passwordChanged = true;
              latestPassword = nextCredentials.password.trim();
              handledAny = true;
              console.log('✅ 密码已更新，重新登录以验证');
              const verifyAfterPassword = await this.performLoginWithCredentials(page, latestUsername, latestPassword, account);
              if (!verifyAfterPassword.success) {
                return {
                  success: false,
                  message: verifyAfterPassword.message || '使用新密码重新登录失败',
                  updatedCredentials: { username: latestUsername, password: latestPassword },
                };
              }
              await this.acknowledgeCredentialPrompts(page).catch(() => undefined);
              await this.randomDelay(600, 900);
              continue;
            }
          }
          if (repeatedLoginIdCount > 5) {
            console.warn('⚠️ 登录账号已更新，但仍检测到账号创建表单，可能需要人工确认');
            break;
          }
          console.log('ℹ️ 登录账号已更新，等待密码改密页面出现');
          await this.randomDelay(800, 1200);
          continue;
        }

        repeatedLoginIdCount = 0;

        const changeResult = await this.applyCredentialChange(detection, account, nextCredentials, page);
        attempt += 1;
        if (!changeResult.success) {
          // 在失败时采集页面结构，便于诊断
          try {
            const html = await page.content();
            await fs.writeFile(`init-fail-${account.username}-${Date.now()}.html`, html);
          } catch {}
          return {
            success: false,
            message: changeResult.message,
            updatedCredentials: { username: latestUsername, password: latestPassword },
          };
        }

        handledAny = true;
        if (changeResult.skipLoginId) {
          console.log('ℹ️ 登录账号阶段无需处理，直接进入密码改密流程');
          await this.acknowledgeCredentialPrompts(page, 8000).catch(() => undefined);
          await this.randomDelay(600, 900);
          continue;
        }
        if (changeResult.formType === 'loginId') {
          await this.acknowledgeCredentialPrompts(page, 8000).catch(() => undefined);
          loginIdCompleted = true;
        }
        if (changeResult.usernameChanged) {
          latestUsername = nextCredentials.username.trim();
          try {
            const originalUsername = account.original_username || account.username;
            await query(
              `UPDATE crown_accounts
                 SET username = $1,
                     initialized_username = $1,
                     original_username = COALESCE(original_username, $2),
                     updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [latestUsername, originalUsername, account.id],
            );
            console.log(`✅ 数据库用户名已更新为 ${latestUsername}`);
          } catch (syncError) {
            console.error('⚠️ 同步数据库用户名失败:', syncError);
          }
          account.username = latestUsername;
        }
        if (changeResult.passwordChanged) {
          latestPassword = nextCredentials.password.trim();
          passwordChanged = true;
          account.password = latestPassword;
        }

        if (changeResult.formType === 'loginId') {
          await this.acknowledgeCredentialPrompts(page, 8000).catch(() => undefined);
          const loginFieldVisible = await page.locator('#usr:visible').count().catch(() => 0);
          if (loginFieldVisible > 0) {
            console.log('🔁 登录账号已更新，重新登录以继续密码修改');
            const reLoginResult = await this.performLoginWithCredentials(page, latestUsername, latestPassword, account);
            if (!reLoginResult.success) {
              return {
                success: false,
                message: reLoginResult.message
                  ? `登录账号更新成功，但重新登录失败: ${reLoginResult.message}`
                  : '登录账号更新成功，但重新登录失败',
                updatedCredentials: { username: latestUsername, password: latestPassword },
              };
            }
            await this.acknowledgeCredentialPrompts(page).catch(() => undefined);
            await this.randomDelay(600, 900);
            continue;
          }
        }

        await this.randomDelay(600, 900);
    }

      if (context) {
        await context.close().catch(() => undefined);
      }
      this.contexts.delete(account.id);
      this.pages.delete(account.id);

      if (loginIdCompleted && !passwordChanged) {
        return {
          success: false,
          message: '登录账号已更新，但未能修改密码，请确认页面是否出现改密表单',
          updatedCredentials: { username: latestUsername, password: latestPassword },
        };
      }

      context = await this.createStealthContext(account);
      page = await context.newPage();
      this.contexts.set(account.id, context);
      this.pages.set(account.id, page);

      const verifyUsername = handledAny ? latestUsername : account.username;
      const verifyPassword = passwordChanged ? nextCredentials.password : account.password;

      const verifyLogin = await this.performLoginWithCredentials(page, verifyUsername, verifyPassword, account);
      if (!verifyLogin.success) {
        return {
          success: false,
          message: verifyLogin.message || '改密完成，但使用新凭证登录失败',
          updatedCredentials: { username: verifyUsername, password: verifyPassword },
        };
      }

      console.log(`✅ 账号 ${account.username} 改密并验证登录成功`);
      return {
        success: true,
        message: '初始化成功',
        updatedCredentials: { username: verifyUsername, password: verifyPassword },
      };
    } finally {
      await this.logoutAccount(account.id).catch(() => undefined);
    }
  }

  // ===== 系统内置账号（用于抓取赛事） =====
  private getSystemAccount(): CrownAccount {
    const username = process.env.CROWN_SYSTEM_USERNAME || '';
    const password = process.env.CROWN_SYSTEM_PASSWORD || '';
    if (!username || !password) {
      throw new Error('未配置系统抓取账号(CROWN_SYSTEM_USERNAME/CROWN_SYSTEM_PASSWORD)');
    }
    const device = process.env.CROWN_SYSTEM_DEVICE || 'iPhone 14';
    const proxyEnabled = (process.env.CROWN_SYSTEM_PROXY_ENABLED || 'false').toLowerCase() === 'true';
    const proxyType = process.env.CROWN_SYSTEM_PROXY_TYPE;
    const proxyHost = process.env.CROWN_SYSTEM_PROXY_HOST;
    const proxyPort = process.env.CROWN_SYSTEM_PROXY_PORT ? Number(process.env.CROWN_SYSTEM_PROXY_PORT) : undefined;
    const proxyUser = process.env.CROWN_SYSTEM_PROXY_USERNAME;
    const proxyPass = process.env.CROWN_SYSTEM_PROXY_PASSWORD;

    this.systemUsername = username;

    // 构造最小必需字段，其他随意填充默认
    const nowIso = new Date().toISOString();
    return {
      id: 0,
      user_id: 0,
      group_id: 0,
      username,
      password,
      display_name: 'SYSTEM',
      platform: 'crown',
      game_type: '足球',
      source: 'system',
      share_count: 0,
      currency: 'CNY',
      discount: 1,
      note: '',
      balance: 0,
      stop_profit_limit: 0,
      device_type: device,
      user_agent: undefined,
      proxy_enabled: !!proxyEnabled,
      proxy_type: proxyType,
      proxy_host: proxyHost,
      proxy_port: proxyPort,
      proxy_username: proxyUser,
      proxy_password: proxyPass,
      football_prematch_limit: 0,
      football_live_limit: 0,
      basketball_prematch_limit: 0,
      basketball_live_limit: 0,
      is_enabled: true,
      is_online: true,
      last_login_at: nowIso,
      status: 'active',
      error_message: undefined,
      created_at: nowIso,
      updated_at: nowIso,
    };
  }

  private async ensureSystemSession(): Promise<Page | null> {
    const now = Date.now();

    // 1. 检查现有系统会话（优先使用已登录的系统账号）
    let page = this.pages.get(0) || null;
    if (page && !page.isClosed()) {
      if (now - this.systemLastBeat < 30000) {
        // 30秒内检查过，直接返回
        return page;
      }
      // 检查会话是否还活着
      if (await this.checkSessionAlive(page)) {
        this.systemLastBeat = now;
        this.systemLoginFailCount = 0; // 重置失败计数
        return page;
      }
      // 会话失效，清理
      await this.cleanupSession(0);
    }

    // 2. 系统账号会话失效，检查是否有用户账号在线（避免打开新浏览器）
    const userAccount = await this.findAvailableUserAccount();
    if (userAccount) {
      // 有用户账号在线，直接使用，不尝试登录系统账号
      return userAccount;
    }

    // 3. 没有任何在线账号，检查是否在冷却期
    if (now < this.systemLoginCooldownUntil) {
      const waitSeconds = Math.ceil((this.systemLoginCooldownUntil - now) / 1000);
      console.log(`⏳ 系统账号登录冷却中，还需等待 ${waitSeconds} 秒`);
      return null;
    }

    // 4. 检查失败次数
    if (this.systemLoginFailCount >= 3) {
      const cooldownMs = 5 * 60 * 1000; // 5分钟冷却
      this.systemLoginCooldownUntil = now + cooldownMs;
      console.log(`❌ 系统账号登录失败次数过多(${this.systemLoginFailCount}次)，进入冷却期 5 分钟`);
      this.systemLoginFailCount = 0;
      return null;
    }

    // 5. 尝试登录系统账号（只在没有任何在线账号时才执行）
    try {
      const account = this.getSystemAccount();
      console.log(`🔐 尝试登录系统账号: ${account.username}`);
      const result = await this.loginAccount(account);

      if (result.success) {
        const live = this.pages.get(0) || null;
        if (live) {
          this.systemLastBeat = Date.now();
          this.systemLoginFailCount = 0; // 重置失败计数
          console.log(`✅ 系统账号登录成功`);
        }
        return live;
      } else {
        this.systemLoginFailCount++;
        console.log(`⚠️ 系统账号登录失败 (${this.systemLoginFailCount}/3): ${result.message || '未知错误'}`);
        return null;
      }
    } catch (err) {
      this.systemLoginFailCount++;
      console.log(`❌ 系统账号登录异常 (${this.systemLoginFailCount}/3):`, err);
      return null;
    }
  }

  // 查找可用的用户账号作为后备（优先使用标记为"用于抓取"的账号）
  private async findAvailableUserAccount(): Promise<Page | null> {
    // 1. 优先查找标记为"用于抓取"的在线账号
    try {
      const fetchAccounts = await query(
        `SELECT id FROM crown_accounts
         WHERE use_for_fetch = true AND is_enabled = true
         ORDER BY last_login_at DESC NULLS LAST`
      );

      for (const row of fetchAccounts.rows) {
        const accountId = row.id;
        const page = this.pages.get(accountId);

        if (page && !page.isClosed()) {
          console.log(`📌 使用标记为"赛事抓取"的账号 ID=${accountId}`);
          return page;
        }
      }
    } catch (err) {
      console.log(`⚠️ 查询赛事抓取账号失败:`, err);
    }

    // 2. 如果没有标记的账号，使用任何在线的用户账号
    for (const [accountId, page] of this.pages.entries()) {
      if (accountId === 0) continue; // 跳过系统账号

      if (page && !page.isClosed()) {
        console.log(`📌 使用普通在线账号 ID=${accountId} 作为后备`);
        return page;
      }
    }

    console.log(`⚠️ 没有可用账号抓取比赛`);
    return null;
  }

  async fetchMatchesSystem(opts?: {
    gtype?: string; showtype?: string; rtype?: string; ltype?: string; sorttype?: string
  }): Promise<{ matches: any[]; xml?: string }> {
    const defaults = { gtype: 'ft', showtype: 'live', rtype: 'rb', ltype: '3', sorttype: 'L' };
    const params = { ...defaults, ...(opts || {}) };

    const attempt = async () => {
      const page = await this.ensureSystemSession();
      if (!page) {
        console.error('无法建立系统会话，会话返回为空');
        return { matches: [] };
      }
      this.systemLastBeat = Date.now();

      const result = await page.evaluate(async (paramsIn) => {
        const topAny: any = (globalThis as any).top;
        const m2_url: string = topAny?.m2_url || '/transform.php';
        const userData: any = topAny?.userData || {};
        const uid: string = userData?.uid || '';
        const ver: string = topAny?.ver || '';
        const langx: string = topAny?.langx || 'zh-cn';

        const body = new URLSearchParams();
        body.set('p', 'get_game_list');
        body.set('uid', uid);
        body.set('ver', ver);
        body.set('langx', langx);
        body.set('p3type', '');
        body.set('date', '');
        body.set('gtype', paramsIn.gtype);
        body.set('showtype', paramsIn.showtype);
        body.set('rtype', paramsIn.rtype);
        body.set('ltype', paramsIn.ltype);
        body.set('filter', '');
        body.set('cupFantasy', 'N');
        body.set('sorttype', paramsIn.sorttype);
        body.set('specialClick', '');
        body.set('isFantasy', 'N');
        body.set('ts', String(Date.now()));

        const res = await fetch(m2_url + `?ver=${encodeURIComponent(ver)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          credentials: 'include',
        });
        const xml = await res.text();
        return { xml, length: xml ? xml.length : 0 };
      }, params);
      console.log(`抓取赛事 XML 长度: ${result.length}`);
      try { await fs.writeFile('matches-latest.xml', result.xml || ''); } catch {}
      const matches = this.parseMatchesFromXml(result.xml || '');
      console.log(`解析赛事数量: ${matches.length}`);
      return { matches, xml: result.xml };
    };

    try {
      return await attempt();
    } catch (error) {
      console.error('系统抓取赛事失败:', error);
      // 不再自动重试登录，避免无限循环
      // 失败计数会在 ensureSystemSession 中处理
      return { matches: [] };
    }
  }

  // 执行下注
  async placeBet(accountId: number, betRequest: BetRequest): Promise<CrownBetResult> {
    const page = this.pages.get(accountId);
    if (!page) {
      return {
        success: false,
        message: '账号未登录或页面不存在',
      };
    }

    const matchDbIdRaw = betRequest.match_id ?? betRequest.matchId;
    const matchDbId = Number(matchDbIdRaw);

    let siteMatchId = (betRequest.crown_match_id ?? betRequest.crownMatchId ?? '').toString().trim();
    let matchInfo: { match_id?: string; league_name?: string; home_team?: string; away_team?: string } = {};

    if (Number.isFinite(matchDbId)) {
      try {
        const matchInfoResult = await query(
          'SELECT match_id, league_name, home_team, away_team FROM matches WHERE id = $1',
          [matchDbId],
        );

        if (matchInfoResult.rows.length > 0) {
          matchInfo = matchInfoResult.rows[0];
          if (!siteMatchId) {
            siteMatchId = String(matchInfo.match_id || '').trim();
          }
        }
      } catch (matchQueryError) {
        console.warn('⚠️ 查询数据库比赛信息失败（忽略）:', matchQueryError);
      }
    }

    const requestHomeTeam = betRequest.home_team ?? betRequest.homeTeam ?? matchInfo.home_team;
    const requestAwayTeam = betRequest.away_team ?? betRequest.awayTeam ?? matchInfo.away_team;

    if (!siteMatchId && (!requestHomeTeam || !requestAwayTeam)) {
      return {
        success: false,
        message: '缺少皇冠比赛ID或主客队信息，无法定位盘口',
      };
    }

    const platformAmount = betRequest.platformAmount ?? betRequest.amount;
    const crownAmount = betRequest.amount;
    const discount = betRequest.discount ?? 1;

    console.log(`🎯 开始执行下注: ${betRequest.betType} ${betRequest.betOption}`);
    if (matchInfo.league_name || matchInfo.home_team) {
      console.log(`⚽️ 赛事: ${matchInfo.league_name || ''} | ${matchInfo.home_team || ''} vs ${matchInfo.away_team || ''} | matchId=${siteMatchId || '未知'}`);
    } else {
      console.log(`⚽️ 请求比赛: ${requestHomeTeam || ''} vs ${requestAwayTeam || ''} | matchId=${siteMatchId || '未知'}`);
    }
    console.log(`💰 平台金额: ${platformAmount}, 折扣: ${discount}, 皇冠实投: ${crownAmount}`);

    const formatAmount = (value: number) => {
      if (!Number.isFinite(value)) {
        return '0';
      }
      const fixed = value.toFixed(2);
      return fixed.replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    };

    const amountText = formatAmount(crownAmount);
    const orderContainerSelector = '#betInfo_bg';
    const amountSelectorPc = '#bet_gold_pc';
    const amountSelectorTouch = '#bet_input';
    const submitSelector = '#order_bet';
    const successListSelector = '#orderMsg li';
    const successCloseSelector = '#finishBtn_show';
    const errorSelector = '#err_msg';

    const findOrderContext = async (): Promise<Page | Frame> => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const contexts: (Page | Frame)[] = [page, ...page.frames()];
        for (const ctx of contexts) {
          try {
            const container = ctx.locator(orderContainerSelector);
            if (await container.count() > 0 && await container.first().isVisible()) {
              return ctx;
            }
          } catch (locError) {
            console.warn('⚠️ 定位下注窗口失败，重试中:', locError);
          }
        }
        await this.randomDelay(200, 400);
      }
      throw new Error('未找到下注窗口，请确认盘口是否已打开');
    };

    const findBettingContext = async (): Promise<Page | Frame> => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const contexts: (Page | Frame)[] = [page, ...page.frames()];
        for (const ctx of contexts) {
          try {
            const container = ctx.locator('#div_show');
            if (await container.count() > 0 && await container.first().isVisible()) {
              return ctx;
            }
          } catch (locError) {
            console.warn('⚠️ 定位盘口列表失败，重试中:', locError);
          }
        }
        await this.randomDelay(200, 400);
      }
      throw new Error('未找到盘口列表，请确认已进入盘口页面');
    };

    const normalizeToken = (value?: string) => (value || '')
      .replace(/[\s\n\r]+/g, '')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .toLowerCase();

    const optionTokens = (betRequest.betOption || betRequest.bet_option || '')
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean);

    const typeTokens = (betRequest.betType || betRequest.bet_type || '')
      .split(/\s|&|\/|、/)
      .map(normalizeToken)
      .filter(Boolean);

    const escapeForSelector = (id: string) => id.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~\\])/g, '\\$1');

    const resolveMatchTarget = async (ctx: Page | Frame) => {
      return ctx.evaluate(({ matchId, homeTeam, awayTeam }) => {
        const normalize = (value?: string) => (value || '')
          .toLowerCase()
          .replace(/[\s\n\r]+/g, '')
          .replace(/（/g, '(')
          .replace(/）/g, ')');

        const matchIdNormalized = normalize(matchId);
        const homeNormalized = normalize(homeTeam);
        const awayNormalized = normalize(awayTeam);

        const nodes = Array.from((globalThis as any).document?.querySelectorAll?.('[id^="game_"]') || []);

        const candidates = nodes.map((node: any) => {
          try {
            const firstBet = node.querySelector?.('[id^="bet_"]');
            if (!firstBet) {
              return null;
            }
            const idParts = String(firstBet.id || '').split('_');
            if (idParts.length < 3) {
              return null;
            }
            const gid = idParts[1];
            const gameId = idParts[2];
            if (!gid || gid.includes('*')) {
              return null;
            }
            const home = normalize(node.querySelector?.('.box_team.teamH .text_team')?.textContent || '');
            const away = normalize(node.querySelector?.('.box_team.teamC .text_team')?.textContent || '');
            return { gid, gameId, home, away };
          } catch {
            return null;
          }
        }).filter(Boolean) as Array<{ gid: string; gameId: string; home: string; away: string }>;

        if (matchIdNormalized) {
          const foundById = candidates.find(candidate => normalize(candidate.gid) === matchIdNormalized);
          if (foundById) {
            return foundById;
          }
        }

        if (homeNormalized && awayNormalized) {
          const foundByTeams = candidates.find(candidate => candidate.home.includes(homeNormalized) && candidate.away.includes(awayNormalized));
          if (foundByTeams) {
            return foundByTeams;
          }
        }

        if (homeNormalized || awayNormalized) {
          const foundBySingle = candidates.find(candidate => (homeNormalized && candidate.home.includes(homeNormalized)) || (awayNormalized && candidate.away.includes(awayNormalized)));
          if (foundBySingle) {
            return foundBySingle;
          }
        }

        return candidates[0] || null;
      }, {
        matchId: siteMatchId,
        homeTeam: requestHomeTeam,
        awayTeam: requestAwayTeam,
      });
    };

    const targetSuffix = this.resolveBetSuffix(betRequest);

    const selectBetOption = async (ctx: Page | Frame, targetSuffixParam?: string | null) => {
      const resolvedTarget = await resolveMatchTarget(ctx);
      if (!resolvedTarget) {
        throw new Error('未在页面上找到对应比赛盘口，请确认页面是否显示该赛事');
      }

      const prefixMatchId = String(resolvedTarget.gid || '').trim();
      const prefixGameId = String(resolvedTarget.gameId || '').trim();
      if (!prefixMatchId || !prefixGameId) {
        throw new Error('未识别到有效的盘口编号');
      }
      console.log(`🔍 定位到盘口容器: matchId=${prefixMatchId}, gameId=${prefixGameId}`);

      const selectionInfo = await ctx.evaluate(({ matchId, gameId, optionTokensIn, typeTokensIn, targetSuffixIn }) => {
        const normalize = (value?: string) => (value || '')
          .replace(/[\s\n\r]+/g, '')
          .replace(/（/g, '(')
          .replace(/）/g, ')')
          .toLowerCase();

        const optionChecks = Array.isArray(optionTokensIn) ? optionTokensIn : [];
        const typeChecks = Array.isArray(typeTokensIn) ? typeTokensIn : [];

        const doc = (globalThis as any).document as any;
        const prefix = `bet_${matchId}_${gameId}_`;
        const selector = `[id^="${prefix}"]`;
        const nodeList = doc?.querySelectorAll?.(selector) || [];
        const nodes = Array.from(nodeList as any[]).filter(node => String(node?.id || '').startsWith(prefix));

        if (targetSuffixIn) {
          const targetId = `${prefix}${targetSuffixIn}`;
          const directNode = doc?.getElementById?.(targetId);
          if (directNode && typeof directNode.id === 'string') {
            const textNormalized = normalize(directNode.textContent || '');
            const boxOdd = directNode.closest?.('.box_lebet_odd');
            const headEl = boxOdd?.querySelector?.('.head_lebet');
            const typeText = normalize(headEl?.textContent || '');
            const locked = !!(directNode.classList?.contains?.('lock') || directNode.getAttribute?.('aria-disabled') === 'true');
            return {
              id: directNode.id,
              locked,
              text: directNode.textContent || '',
              textNormalized,
              typeText,
            };
          }
        }

        const candidates = nodes.map((node) => {
          const textNormalized = normalize(node?.textContent || '');
          const boxOdd = node?.closest?.('.box_lebet_odd');
          const headEl = boxOdd?.querySelector?.('.head_lebet');
          const typeText = normalize(headEl?.textContent || '');
          const locked = !!(node?.classList?.contains?.('lock') || node?.getAttribute?.('aria-disabled') === 'true');
          return {
            id: node?.id,
            locked,
            text: node?.textContent || '',
            textNormalized,
            typeText,
          };
        }).filter(Boolean);

        const isMatchingOption = (candidate: any, tokens: string[]) => tokens.every((token) => candidate.textNormalized.includes(token));
        const isMatchingType = (candidate: any, tokens: string[]) => tokens.every((token) => candidate.typeText.includes(token));

        const findCandidate = (optionSet: string[], typeSet: string[]) => {
          return candidates.find(candidate => isMatchingOption(candidate, optionSet) && isMatchingType(candidate, typeSet));
        };

        let chosen = findCandidate(optionChecks, typeChecks);

        if (!chosen && optionChecks.length > 1) {
          chosen = findCandidate([optionChecks[0]], typeChecks);
        }

        if (!chosen && typeChecks.length > 0) {
          chosen = findCandidate([], typeChecks);
        }

        if (!chosen) {
          chosen = candidates.find(candidate => !candidate.locked) || candidates[0] || null;
        }

        return chosen;
      }, {
        matchId: prefixMatchId,
        gameId: prefixGameId,
        optionTokensIn: optionTokens,
        typeTokensIn: typeTokens,
        targetSuffixIn: targetSuffixParam || null,
      });

      if (!selectionInfo) {
        throw new Error(`未找到匹配的盘口按钮，bet_type=${betRequest.bet_type || betRequest.betType}, bet_option=${betRequest.bet_option || betRequest.betOption}`);
      }

      if (selectionInfo.locked) {
        throw new Error(`目标盘口已锁盘或不可用: ${selectionInfo.text}`);
      }

      const selector = `#${escapeForSelector(selectionInfo.id)}`;
      const targetLocator = ctx.locator(selector);
      await targetLocator.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await this.randomDelay(80, 160);
      await targetLocator.first().click({ delay: 50 }).catch((clickError: any) => {
        throw new Error(`点击盘口按钮失败(${selectionInfo.id}): ${clickError instanceof Error ? clickError.message : String(clickError)}`);
      });
      console.log(`✅ 已选择盘口按钮: ${selectionInfo.id} (${selectionInfo.text})`);
    };

    const typeAmount = async (ctx: Page | Frame) => {
      const candidates = [amountSelectorPc, amountSelectorTouch];
      for (const selector of candidates) {
        const locator = ctx.locator(selector);
        if (await locator.count() === 0) {
          continue;
        }
        try {
          await locator.first().waitFor({ state: 'visible', timeout: 4000 });
          await locator.first().click({ force: true });
          await locator.first().fill('');
          await this.randomDelay(80, 180);
          await locator.first().type(amountText, { delay: 80 });
          return true;
        } catch (inputError) {
          console.warn(`⚠️ 金额输入失败(selector: ${selector})，尝试下一候选:`, inputError);
        }
      }
      return false;
    };

    const waitSubmitEnabled = async (ctx: Page | Frame) => {
      await ctx.waitForFunction((selector: string) => {
        const doc = (globalThis as any).document as any;
        const el = doc?.querySelector?.(selector) as any;
        if (!el) {
          return false;
        }
        return !el.disabled;
      }, submitSelector, { timeout: 8000 }).catch(() => undefined);
    };

    const waitOutcome = async (ctx: Page | Frame) => {
      const deadline = Date.now() + 20000;
      const successLocator = ctx.locator(successListSelector);
      const errorLocator = ctx.locator(errorSelector);

      while (Date.now() < deadline) {
        if (await successLocator.count() > 0 && await successLocator.first().isVisible()) {
          const messages = (await successLocator.allTextContents()).map(t => t.trim()).filter(Boolean);
          let officialBetId: string | undefined;
          for (const line of messages) {
            const match = line.match(/(注单|单号|订单|编号)[^\d]*(\d+)/);
            if (match) {
              officialBetId = match[2];
              break;
            }
          }
          return { type: 'success' as const, messages, officialBetId };
        }

        if (await errorLocator.count() > 0 && await errorLocator.first().isVisible()) {
          const content = (await errorLocator.first().innerText()).trim();
          if (content) {
            return { type: 'error' as const, message: content };
          }
        }

        await this.randomDelay(200, 400);
      }

      return { type: 'timeout' as const };
    };

    try {
      await page.bringToFront().catch(() => undefined);

      if (!/\/betting/i.test(page.url())) {
        await page.goto('/betting', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined);
        await this.randomDelay(400, 700);
      }

      const bettingContext = await findBettingContext();
      await selectBetOption(bettingContext, targetSuffix);
      await this.randomDelay(200, 400);

      const orderContext = await findOrderContext();

      const typed = await typeAmount(orderContext);
      if (!typed) {
        return {
          success: false,
          message: '未找到下注金额输入框',
        };
      }

      await waitSubmitEnabled(orderContext);
      const submitButton = orderContext.locator(submitSelector);
      if (await submitButton.count() === 0) {
        return {
          success: false,
          message: '未找到下注提交按钮',
        };
      }

      await this.randomDelay(100, 250);
      await submitButton.first().click({ delay: 50 }).catch((clickError) => {
        throw new Error(`点击下注按钮失败: ${clickError instanceof Error ? clickError.message : String(clickError)}`);
      });

      const outcome = await waitOutcome(orderContext);

      if (outcome.type === 'success') {
        const finishButton = orderContext.locator(successCloseSelector);
        if (await finishButton.count() > 0) {
          await this.randomDelay(120, 220);
          await finishButton.first().click({ delay: 40 }).catch(() => undefined);
        }

        return {
          success: true,
          message: outcome.messages.join(' ')
            || '下注成功',
          betId: outcome.officialBetId,
          actualOdds: betRequest.odds,
          platformAmount,
          crownAmount,
        };
      }

      if (outcome.type === 'error') {
        return {
          success: false,
          message: outcome.message,
        };
      }

      return {
        success: false,
        message: '未在预期时间内收到下注结果，请检查页面状态',
      };

    } catch (error) {
      console.error('下注执行失败:', error);
      try {
        await page.screenshot({ path: `bet-error-${accountId}-${Date.now()}.png`, fullPage: true });
        const html = await page.content();
        await fs.writeFile(`bet-error-${accountId}-${Date.now()}.html`, html);
      } catch (captureError) {
        console.warn('⚠️ 保存下注失败快照时出错:', captureError);
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : `下注失败: ${String(error)}`,
      };
    }
  }

  private async getAccountFinancialSnapshot(accountId: number): Promise<FinancialSnapshot> {
    const snapshot: FinancialSnapshot = {
      balance: null,
      credit: null,
      balanceSource: 'unknown',
      creditSource: 'unknown',
    };

    const page = this.pages.get(accountId);
    if (!page) {
      console.warn(`⚠️ [financial] 无页面上下文，账号 ${accountId}`);
      return snapshot;
    }

    const normalizeNumber = (value: any): number | null => {
      if (value === null || value === undefined) {
        return null;
      }
      const str = String(value).replace(/[\u00A0\s]+/g, ' ').trim();
      if (!str) {
        return null;
      }
      const match = str.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
      if (!match) {
        return null;
      }
      const numeric = parseFloat(match[0].replace(/,/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
    };

    const mergeValue = (key: 'balance' | 'credit', value: number | null, source: string) => {
      if (value === null) {
        return;
      }
      if (key === 'balance' && snapshot.balance === null) {
        snapshot.balance = value;
        snapshot.balanceSource = source;
      }
      if (key === 'credit' && snapshot.credit === null) {
        snapshot.credit = value;
        snapshot.creditSource = source;
      }
    };

    try {
      await page
        .waitForFunction(() => {
          const topWin = (globalThis as any).top || (globalThis as any);
          const param: any = topWin?.param;
          return typeof param === 'string' && param.includes('uid=');
        }, { timeout: 8000 })
        .catch(() => undefined);

      await page
        .waitForFunction(() => {
          const topWin = (globalThis as any).top || (globalThis as any);
          const userData: any = topWin?.userData || {};

          const numericFields = [
            userData?.cash,
            userData?.money,
            userData?.balance,
            userData?.wallet,
            userData?.maxcredit,
            userData?.maxCredit,
            userData?.oldCredit,
            userData?.credit,
          ];

          return numericFields.some((val) => {
            if (val === null || val === undefined) {
              return false;
            }
            const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            return Number.isFinite(num);
          });
        }, { timeout: 10000 })
        .catch(() => undefined);
    } catch (waitErr) {
      console.warn(`[financial] 等待 userData 超时:`, waitErr);
    }

    type RuntimeInfo = {
      param: string | null;
      paramLength: number | null;
      m2Url: string | null;
      cuDomain: string | null;
      currency: string | null;
      tableId: any;
      cashRaw: any;
      creditRaw: any;
      creditKey: string | null;
      userDataKeys: string[];
      uid: string | null;
      cash: number | null;
      credit: number | null;
    };

    const runtimeInfo: RuntimeInfo = await page
      .evaluate(() => {
        const topWin = (globalThis as any).top || (globalThis as any);
        const userData = topWin?.userData || {};

        const parseCandidate = (value: any) => {
          if (value === null || value === undefined || value === '') {
            return { numeric: null, raw: value };
          }
          const numeric = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
          return Number.isFinite(numeric) ? { numeric, raw: value } : { numeric: null, raw: value };
        };

        const pickFirst = (entries: Array<{ key: string; value: any }>) => {
          for (const entry of entries) {
            const parsed = parseCandidate(entry.value);
            if (parsed.numeric !== null) {
              return {
                key: entry.key,
                numeric: parsed.numeric,
                raw: entry.value,
              };
            }
          }
          return { key: null, numeric: null, raw: null };
        };

        const balanceEntries = [
          { key: 'cash', value: userData?.cash },
          { key: 'money', value: userData?.money },
          { key: 'balance', value: userData?.balance },
          { key: 'wallet', value: userData?.wallet },
          { key: 'maxcredit', value: userData?.maxcredit },
          { key: 'maxCredit', value: userData?.maxCredit },
          { key: 'oldCredit', value: userData?.oldCredit },
          { key: 'credit', value: userData?.credit },
        ];

        const balanceInfo = pickFirst(balanceEntries);

        return {
          param: topWin?.param || null,
          paramLength: typeof topWin?.param === 'string' ? topWin.param.length : null,
          m2Url: topWin?.m2_url || null,
          cuDomain: topWin?.cu_domain || null,
          currency: userData?.currency || null,
          tableId: userData?.table_id || userData?.tableId || null,
          cashRaw: userData?.cash ?? userData?.money ?? userData?.balance ?? userData?.wallet ?? null,
          creditRaw: balanceInfo.raw,
          creditKey: balanceInfo.key,
          userDataKeys: Object.keys(userData || {}),
          uid: userData?.uid || null,
          cash: parseCandidate(userData?.cash ?? userData?.money ?? userData?.balance ?? userData?.wallet).numeric,
          credit: balanceInfo.numeric,
        } as RuntimeInfo;
      })
      .catch((err) => {
        console.warn(`[financial] 无法采集 runtime 信息:`, err);
        return {
          param: null,
          paramLength: null,
          m2Url: null,
          cuDomain: null,
          currency: null,
          tableId: null,
          cashRaw: null,
          creditRaw: null,
          creditKey: null,
          userDataKeys: [],
          uid: null,
          cash: null,
          credit: null,
        } as RuntimeInfo;
      });

    console.log(`[financial] runtime info`, {
      accountId,
      paramReady: !!runtimeInfo.param,
      paramLength: runtimeInfo.paramLength,
      paramSample: runtimeInfo.param ? String(runtimeInfo.param).slice(0, 120) : null,
      m2Url: runtimeInfo.m2Url,
      cuDomain: runtimeInfo.cuDomain,
      uid: runtimeInfo.uid,
      currency: runtimeInfo.currency,
      tableId: runtimeInfo.tableId,
      cashRaw: runtimeInfo.cashRaw,
      creditRaw: runtimeInfo.creditRaw,
      creditKey: runtimeInfo.creditKey,
      userDataKeys: runtimeInfo.userDataKeys,
      cash: runtimeInfo.cash,
      credit: runtimeInfo.credit,
    });

    mergeValue('balance', runtimeInfo.cash ?? runtimeInfo.credit, 'top_userData');
    mergeValue('credit', runtimeInfo.credit ?? runtimeInfo.cash, 'top_userData');

    if (snapshot.balance === null || snapshot.credit === null) {
      try {
        const memberDataXml = await page.evaluate(async () => {
          try {
            const topWin: any = (globalThis as any).top || (globalThis as any);
            if (!topWin?.m2_url) {
              return null;
            }

            const params = new URLSearchParams();
            params.set('p', 'get_member_data');
            params.set('change', 'all');

            const langx = topWin?.userData?.langx || topWin?.langx || 'en-us';
            params.set('langx', String(langx));

            const uid = topWin?.userData?.uid || topWin?.uid || topWin?.param?.match(/uid=([^&]+)/)?.[1] || '';
            if (uid) {
              params.set('uid', String(uid));
            }

            const ver = topWin?.userData?.ver || topWin?.ver || topWin?.param?.match(/ver=([^&]+)/)?.[1] || '';
            if (ver) {
              params.set('ver', String(ver));
            }

            const response = await fetch(topWin.m2_url, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            });

            const text = await response.text();
            return text || null;
          } catch (err) {
            console.error('[financial] member_data fetch failed', err);
            return null;
          }
        });

        if (memberDataXml && memberDataXml.includes('<maxcredit>')) {
          try {
            await fs.writeFile(`member-data-${accountId}.xml`, memberDataXml);
          } catch {}

          const extractTagValue = (text: string, tagNames: string[]): number | null => {
            for (const tag of tagNames) {
              const regex = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'i');
              const match = text.match(regex);
              if (match && match[1]) {
                const numeric = parseFloat(match[1].replace(/[^0-9.+-]/g, ''));
                if (Number.isFinite(numeric)) {
                  return numeric;
                }
              }
            }
            return null;
          };

          const xmlBalance = extractTagValue(memberDataXml, ['cash', 'balance', 'availablebalance', 'available_balance', 'money']);
          const xmlCredit = extractTagValue(memberDataXml, ['maxcredit', 'credit', 'limit', 'oldcredit']);

          const effectiveBalance = (xmlBalance === null || xmlBalance === 0)
            ? xmlCredit
            : xmlBalance;

          mergeValue('balance', effectiveBalance, 'transform_fetch');
          mergeValue('credit', xmlCredit, 'transform_fetch');

          console.log('[financial] member_data fetch success', {
            accountId,
            xmlBalance,
            xmlCredit,
            effectiveBalance,
          });
        } else if (memberDataXml) {
          console.warn('[financial] member_data fetch returned no credit', {
            accountId,
            sample: memberDataXml.slice(0, 160),
          });
        }

      } catch (memberError) {
        console.warn('⚠️ member_data fetch error:', memberError);
      }
    }

    try {
      await this.hideLoadingOverlay(page).catch(() => undefined);
    } catch (hideErr) {
      console.warn(`⚠️ [financial] hide overlay 失败:`, hideErr);
    }

    await page.waitForSelector('#home_show, #acc_cash, #acc_credit', { state: 'visible', timeout: 5000 }).catch(() => undefined);

    const selectorGroups = [
      {
        key: 'balance' as const,
        selectors: [
          '#acc_cash',
          '#menu_acc_cash',
          '#acc_balance',
          '.acc_cash',
          '.account-cash',
          '.accountBalance',
          '[data-balance]',
          '[data-cash]',
          '.cash',
        ],
      },
      {
        key: 'credit' as const,
        selectors: [
          '#acc_credit',
          '#menu_acc_credit',
          '.acc_credit',
          '.account-credit',
          '[data-credit]',
          '.credit',
        ],
      },
    ];

    const extractFromFrame = async (frame: Page | Frame) => {
      return frame
        .evaluate((groups) => {
          const normalize = (value: any): number | null => {
            if (value === null || value === undefined) {
              return null;
            }
            const str = String(value).replace(/[\u00A0\s]+/g, ' ').trim();
            if (!str) {
              return null;
            }
            const match = str.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
            if (!match) {
              return null;
            }
            const numeric = parseFloat(match[0].replace(/,/g, ''));
            return Number.isFinite(numeric) ? numeric : null;
          };

          const inspectElement = (el: any): number | null => {
            if (!el) {
              return null;
            }
            const candidates: any[] = [];
            const push = (val: any) => {
              if (val !== null && val !== undefined && val !== '') {
                candidates.push(val);
              }
            };

            try {
              push(el.innerText);
              push(el.textContent);
              push(el.value);
            } catch {}

            if (typeof el.getAttribute === 'function') {
              const attrNames = ['data-balance', 'data-cash', 'data-credit', 'data-value', 'data-amount', 'value', 'aria-label', 'title'];
              for (const attr of attrNames) {
                try {
                  push(el.getAttribute(attr));
                } catch {}
              }
            }

            try {
              const dataset = (el as any).dataset || {};
              for (const key of Object.keys(dataset)) {
                push(dataset[key]);
              }
            } catch {}

            for (const candidate of candidates) {
              const numeric = normalize(candidate);
              if (numeric !== null) {
                return numeric;
              }
            }
            return null;
          };

          const mergeResults = (target: any, source: any) => {
            if (source.balance !== null && target.balance === null) {
              target.balance = source.balance;
            }
            if (source.credit !== null && target.credit === null) {
              target.credit = source.credit;
            }
          };

          const visit = (doc: any): { balance: number | null; credit: number | null } => {
            const result: { balance: number | null; credit: number | null } = { balance: null, credit: null };

            for (const group of groups) {
              if (result[group.key] !== null) {
                continue;
              }
              for (const selector of group.selectors) {
                let elements: any[] = [];
                try {
                  const nodeList = doc?.querySelectorAll?.(selector);
                  if (!nodeList) {
                    continue;
                  }
                  elements = Array.from(nodeList);
                } catch {
                  continue;
                }

                for (const el of elements) {
                  const numeric = inspectElement(el);
                  if (numeric !== null) {
                    result[group.key] = numeric;
                    break;
                  }
                }

                if (result[group.key] !== null) {
                  break;
                }
              }
            }

            if ((result.balance === null || result.credit === null) && doc?.querySelectorAll) {
              const frames = Array.from(doc.querySelectorAll('iframe, frame') || []);
              for (const iframeEl of frames) {
                try {
                  const frameEl = iframeEl as any;
                  const subDoc = frameEl.contentDocument || frameEl.contentWindow?.document;
                  if (!subDoc) {
                    continue;
                  }
                  const nested = visit(subDoc);
                  mergeResults(result, nested);
                  if (result.balance !== null && result.credit !== null) {
                    break;
                  }
                } catch {
                  continue;
                }
              }
            }

            return result;
          };

          try {
            const rootDoc = (globalThis as any).document;
            if (!rootDoc) {
              return { balance: null, credit: null };
            }
            return visit(rootDoc);
          } catch {
            return { balance: null, credit: null };
          }
        }, selectorGroups)
        .catch(() => ({ balance: null, credit: null }));
    };

    for (let attempt = 0; attempt < 6 && (snapshot.balance === null || snapshot.credit === null); attempt += 1) {
      const frames = [page, ...page.frames()];
      for (const frame of frames) {
        const frameUrl = frame === page ? 'main' : frame.url?.() || 'iframe';
        console.log(`[financial] inspect frame`, {
          accountId,
          frameUrl,
          detached: typeof (frame as Frame).isDetached === 'function' ? (frame as Frame).isDetached() : undefined,
        });

        const result = await extractFromFrame(frame);
        if (result.balance !== null || result.credit !== null) {
          console.log(`[financial] DOM 提取:`, {
            accountId,
            frameUrl,
            balance: result.balance,
            credit: result.credit,
          });
        }
        mergeValue('balance', result.balance, 'dom');
        mergeValue('credit', result.credit, 'dom');
      }

      if (snapshot.balance !== null && snapshot.credit !== null) {
        break;
      }

      await this.randomDelay(250, 450);
    }

    if (snapshot.balance === null || snapshot.credit === null) {
      const topValues = await page
        .evaluate(() => {
          const normalize = (value: any): number | null => {
            if (value === null || value === undefined) {
              return null;
            }
            const str = String(value).replace(/[\u00A0\s]+/g, ' ').trim();
            if (!str) {
              return null;
            }
            const match = str.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
            if (!match) {
              return null;
            }
            const numeric = parseFloat(match[0].replace(/,/g, ''));
            return Number.isFinite(numeric) ? numeric : null;
          };

          try {
            const top = (globalThis as any).top || (globalThis as any);
            const userData = top?.userData || {};
            const cashRaw = userData?.cash ?? userData?.money ?? userData?.balance ?? userData?.wallet ?? null;
            const creditRaw = userData?.maxcredit ?? userData?.oldCredit ?? userData?.credit ?? null;
            return {
              balance: normalize(cashRaw),
              credit: normalize(creditRaw),
            };
          } catch {
            return { balance: null, credit: null };
          }
        })
        .catch(() => ({ balance: null, credit: null }));

      mergeValue('balance', topValues.balance, 'top');
      mergeValue('credit', topValues.credit, 'top');
      if (topValues.balance !== null || topValues.credit !== null) {
        console.log(`[financial] top.userData 提取:`, { accountId, topValues });
      }
    }

    if (snapshot.balance === null || snapshot.credit === null) {
      const xmlText = await page
        .evaluate(async () => {
          try {
            const top: any = (globalThis as any).top;
            const m2_url: string = top?.m2_url || '/transform.php';
            const param: string = top?.param || '';

            const body = new URLSearchParams();
            body.set('p', 'get_member_data');
            body.set('param', param);
            body.set('change', 'all');

            const res = await fetch(m2_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString(),
              credentials: 'include',
            });
            return await res.text();
          } catch (e) {
            return '';
          }
        })
        .catch(() => '');

      if (xmlText && xmlText.trim()) {
        try {
          await fs.writeFile(`member-data-${accountId}.xml`, xmlText);
        } catch {}

        const extractTagValue = (text: string, tagNames: string[]): number | null => {
          for (const tag of tagNames) {
            const regex = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'i');
            const match = text.match(regex);
            if (match && match[1]) {
              const numeric = parseFloat(match[1].replace(/[^0-9.+-]/g, ''));
              if (Number.isFinite(numeric)) {
                return numeric;
              }
            }
          }
          return null;
        };

        const xmlBalance = extractTagValue(xmlText, ['cash', 'balance', 'availablebalance', 'available_balance', 'money']);
        const xmlCredit = extractTagValue(xmlText, ['maxcredit', 'credit', 'limit']);

        mergeValue('balance', xmlBalance, 'transform');
        mergeValue('credit', xmlCredit, 'transform');
        console.log(`[financial] transform.php 提取:`, {
          accountId,
          xmlBalance,
          xmlCredit,
          paramReady: !!runtimeInfo.param,
        });
      } else {
        console.warn(`[financial] transform.php 返回空`, {
          accountId,
          paramReady: !!runtimeInfo.param,
          length: xmlText ? xmlText.length : 0,
          sample: xmlText ? xmlText.slice(0, 160) : null,
        });
      }
    }

    if (snapshot.balance === null && !this.balanceDebugCaptured.has(accountId)) {
      this.balanceDebugCaptured.add(accountId);
      try {
        const html = await page.content();
        await fs.writeFile(`debug-balance-${accountId}-${Date.now()}.html`, html);
      } catch (err) {
        console.warn('⚠️ 保存余额调试 HTML 失败:', err);
      }

      try {
        await page.screenshot({ path: `debug-balance-${accountId}-${Date.now()}.png`, fullPage: true });
      } catch (err) {
        console.warn('⚠️ 保存余额调试截图失败:', err);
      }

      console.warn(`⚠️ 未能解析账号 ${accountId} 的余额，已输出调试文件`);
    }

    console.log(`[financial] 汇总结果:`, { accountId, snapshot });

    return snapshot;
  }

  // 获取账号余额
  async getAccountBalance(accountId: number): Promise<number | null> {
    try {
      const snapshot = await this.getAccountFinancialSnapshot(accountId);
      return snapshot.balance;
    } catch (error) {
      console.error('获取账号余额失败:', error);
      return null;
    }
  }

  // 获取账号额度（maxcredit）
  async getAccountCredit(accountId: number): Promise<number | null> {
    try {
      const snapshot = await this.getAccountFinancialSnapshot(accountId);
      return snapshot.credit;
    } catch (error) {
      console.error('获取账号额度失败:', error);
      return null;
    }
  }

  async getAccountFinancialSummary(accountId: number): Promise<FinancialSnapshot> {
    return this.getAccountFinancialSnapshot(accountId);
  }

  private async checkSessionAlive(page: Page): Promise<boolean> {
    try {
      const status = await page.evaluate(() => {
        const global: any = globalThis as any;
        const topWin: any = global?.top || {};
        const doc: any = global?.document || {};
        const uid = topWin?.userData?.uid || '';
        const home = doc?.querySelector?.('#home_show');
        const login = doc?.querySelector?.('#acc_show');
        const isVisible = (el: any) => {
          if (!el) return false;
          const style = global?.getComputedStyle?.(el);
          if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
            return false;
          }
          if (typeof el.offsetParent !== 'undefined') {
            return el.offsetParent !== null;
          }
          return true;
        };
        return {
          uid: uid || '',
          homeVisible: isVisible(home),
          loginVisible: isVisible(login),
        };
      });
      if (!status) {
        return false;
      }
      if (status.loginVisible) {
        return false;
      }
      if (status.uid) {
        return true;
      }
      return status.homeVisible;
    } catch (error) {
      console.warn('⚠️ 会话心跳检测失败:', error);
      return false;
    }
  }

  private async cleanupSession(accountId: number) {
    const page = this.pages.get(accountId);
    const context = this.contexts.get(accountId);
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    this.pages.delete(accountId);
    this.contexts.delete(accountId);
    this.lastHeartbeats.delete(accountId);
    if (accountId === 0) {
      this.systemLastBeat = 0;
    }
  }

  private async ensureSession(accountId: number): Promise<Page | null> {
    let page = this.pages.get(accountId);
    if (page && !page.isClosed()) {
      const lastBeat = this.lastHeartbeats.get(accountId) || 0;
      const now = Date.now();
      if (now - lastBeat < 30000) {
        return page;
      }
      if (await this.checkSessionAlive(page)) {
        this.lastHeartbeats.set(accountId, now);
        return page;
      }
      await this.cleanupSession(accountId);
    }

    const accountDb = await query('SELECT * FROM crown_accounts WHERE id = $1', [accountId]);
    if (accountDb.rows.length === 0) {
      return null;
    }
    const account = accountDb.rows[0];

    const sessionInfo = await this.getSessionInfo(accountId);
    const storageStateRaw = sessionInfo?.storageState;
    let storageState: any;
    if (storageStateRaw) {
      if (typeof storageStateRaw === 'string') {
        try {
          storageState = JSON.parse(storageStateRaw);
        } catch {
          storageState = undefined;
        }
      } else {
        storageState = storageStateRaw;
      }
    }

    if (storageState) {
      try {
        const context = await this.createStealthContext(account, storageState);
        const restoredPage = await context.newPage();
        const targetUrl = sessionInfo?.url && typeof sessionInfo.url === 'string' ? sessionInfo.url : LOGIN_PAGE_URL;
        await restoredPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined);
        await this.handlePostLoginPrompts(restoredPage).catch(() => undefined);
        if (await this.checkSessionAlive(restoredPage)) {
          this.contexts.set(accountId, context);
          this.pages.set(accountId, restoredPage);
          this.lastHeartbeats.set(accountId, Date.now());
          this.sessionInfos.set(accountId, sessionInfo);
          return restoredPage;
        }
        await restoredPage.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      } catch (restoreError) {
        console.warn('⚠️ 会话恢复失败，尝试重新登录:', restoreError);
      }
    }

    const loginResult = await this.loginAccount(account);
    if (loginResult.success) {
      const livePage = this.pages.get(accountId) || null;
      if (livePage) {
        this.lastHeartbeats.set(accountId, Date.now());
      }
      return livePage;
    }

    return null;
  }

  private resolveInterval(raw: string | undefined, fallback: number, minimum: number): number {
    const parsed = raw !== undefined ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Math.max(minimum, fallback);
    }
    return Math.max(minimum, parsed);
  }

  private startOnlineMonitor() {
    if (this.onlineStatusTimer) {
      return;
    }

    const tick = async () => {
      try {
        await this.syncOnlineStatus();
      } catch (error) {
        console.error('[online-monitor] 同步账号在线状态失败:', error);
      }
    };

    setTimeout(() => {
      void tick();
    }, 5000);

    this.onlineStatusTimer = setInterval(() => {
      void tick();
    }, this.onlineStatusIntervalMs);
  }

  private async syncOnlineStatus(): Promise<void> {
    if (this.onlineStatusRunning) {
      return;
    }
    this.onlineStatusRunning = true;

    try {
      const result = await query(
        'SELECT id, is_online FROM crown_accounts WHERE is_enabled = true'
      );

      const now = Date.now();
      const pendingUpdates = new Map<number, boolean>();
      const dbStates = new Map<number, boolean>();

      for (const row of result.rows) {
        const accountId = Number(row.id);
        if (!Number.isInteger(accountId)) {
          continue;
        }

        const dbOnline = row.is_online === true || row.is_online === 't' || row.is_online === 1;
        dbStates.set(accountId, dbOnline);

        try {
          let alive = false;
          const page = this.pages.get(accountId);

          if (page && !page.isClosed()) {
            const lastBeat = this.lastHeartbeats.get(accountId) || 0;
            if (now - lastBeat > this.onlineHeartbeatTtlMs) {
              const sessionAlive = await this.checkSessionAlive(page);
              if (sessionAlive) {
                this.lastHeartbeats.set(accountId, now);
                alive = true;
              } else {
                await this.cleanupSession(accountId);
                alive = false;
              }
            } else {
              alive = true;
            }
          } else {
            if (page?.isClosed()) {
              await this.cleanupSession(accountId);
            }
            alive = false;
          }

          if (dbOnline !== alive) {
            pendingUpdates.set(accountId, alive);
          }
        } catch (error) {
          console.error(`[online-monitor] 检查账号 ${accountId} 在线状态失败:`, error);
        }
      }

      for (const [accountId, page] of this.pages.entries()) {
        if (accountId === 0 || !Number.isInteger(accountId)) {
          continue;
        }

        if (!dbStates.has(accountId)) {
          const alive = page && !page.isClosed();
          if (!alive) {
            await this.cleanupSession(accountId);
          }
          if (alive) {
            pendingUpdates.set(accountId, true);
          }
        }
      }

      for (const [accountId, alive] of pendingUpdates.entries()) {
        await query(
          `UPDATE crown_accounts
             SET is_online = $1,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [alive, accountId]
        );
      }
    } catch (error) {
      console.error('[online-monitor] 执行在线状态同步时发生错误:', error);
    } finally {
      this.onlineStatusRunning = false;
    }
  }

  async fetchTodayWagers(accountId: number): Promise<CrownWagerItem[]> {
    const page = this.pages.get(accountId);
    if (!page) {
      throw new Error('账号未登录或页面不存在');
    }

    const result = await page.evaluate<CrownWagerEvalResult>(async () => {
      const topWin: any = (globalThis as any).top || (globalThis as any);
      const m2Url: string = topWin?.m2_url || '/transform.php';
      const userData: any = topWin?.userData || {};
      const uid: string = userData?.uid || topWin?.uid || '';
      const langx: string = userData?.langx || topWin?.langx || 'en-us';
      const ver: string = topWin?.ver || '';
      const ls: string = topWin?.ls || 'e';

      if (!uid) {
        return { ok: false, reason: 'missing_uid' };
      }

      const body = new URLSearchParams();
      body.set('p', 'get_today_wagers');
      body.set('uid', uid);
      body.set('langx', langx);
      body.set('LS', ls);
      body.set('selGtype', 'ALL');
      body.set('chk_cw', 'N');
      body.set('ts', String(Date.now()));
      body.set('format', 'xml');
      body.set('db_slow', 'N');

      try {
        const response = await fetch(m2Url + `?ver=${encodeURIComponent(ver)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          credentials: 'include',
          body: body.toString(),
        });

        const xmlText = await response.text();
        if (!xmlText) {
          return { ok: false, reason: 'empty_response' };
        }

        const DomParserCtor = (globalThis as any).DOMParser;
        if (!DomParserCtor) {
          return { ok: false, reason: 'dom_parser_unavailable', xml: xmlText };
        }
        const parser = new DomParserCtor();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        if (doc.querySelector && doc.querySelector('parsererror')) {
          return { ok: false, reason: 'xml_parse_error', xml: xmlText };
        }

        const wagerNodes = Array.from((doc as any).getElementsByTagName?.('wagers') || []) as any[];
        const trim = (value?: string | null) => (value ?? '').trim();
        const items = wagerNodes.map((node: any) => {
          const firstSub = node?.getElementsByTagName?.('wagers_sub')?.[0] || null;
          const getText = (target: any, tag: string): string => {
            if (!target?.getElementsByTagName) {
              return '';
            }
            const el = target.getElementsByTagName(tag)?.[0] || null;
            return trim(el?.textContent ?? '');
          };

          const ticketIdAttr = trim(node.getAttribute('tid'));

          return {
            ticketId: ticketIdAttr || getText(node, 'w_id'),
            gold: getText(node, 'gold'),
            winGold: getText(node, 'win_gold'),
            resultText: getText(firstSub, 'result'),
            score: getText(firstSub, 'score'),
            league: getText(firstSub, 'league'),
            teamH: getText(firstSub, 'team_h_show'),
            teamC: getText(firstSub, 'team_c_show'),
            ballActRet: getText(node, 'ball_act_ret'),
            ballActClass: getText(node, 'ball_act_class'),
            wagerDate: getText(firstSub, 'date'),
            betWtype: getText(node, 'bet_wtype'),
            rawXml: typeof node?.outerHTML === 'string' ? node.outerHTML : '',
          } satisfies CrownWagerItem;
        });

        return { ok: true, xml: xmlText, items };
      } catch (err) {
        return { ok: false, reason: `fetch_failed:${String(err)}` };
      }
    });

    if (!result || !result.ok) {
      console.warn('[wagers] 获取注单失败', {
        accountId,
        reason: result?.reason,
      });
      return [];
    }

    if (process.env.SAVE_WAGERS_DEBUG === '1' && result.xml) {
      const debugFile = `today-wagers-${accountId}-${Date.now()}.xml`;
      await fs.writeFile(debugFile, result.xml).catch((err) => {
        console.warn('[wagers] 保存注单XML失败:', err);
      });
    }

    this.lastHeartbeats.set(accountId, Date.now());
    return Array.isArray(result.items) ? result.items : [];
  }

  // 抓取赛事列表（返回解析后的基础字段与原始XML）
  async fetchMatches(accountId: number, opts?: {
    gtype?: string; // ft(足球)/bk(篮球)...
    showtype?: string; // live/today/early
    rtype?: string; // rb/r/...
    ltype?: string; // 3 等
    sorttype?: string; // L 等
  }): Promise<{ matches: any[]; xml?: string }> {
    const defaults = { gtype: 'ft', showtype: 'live', rtype: 'rb', ltype: '3', sorttype: 'L' };
    const params = { ...defaults, ...(opts || {}) };

    const attempt = async (): Promise<{ matches: any[]; xml?: string }> => {
      const page = await this.ensureSession(accountId);
      if (!page) {
        console.error('无法建立皇冠会话，会话返回为空');
        return { matches: [] };
      }

      this.lastHeartbeats.set(accountId, Date.now());
      console.log('fetchMatches 请求参数', params);

      const result = await page.evaluate(async (paramsIn) => {
        const topAny: any = (globalThis as any).top;
        const m2_url: string = topAny?.m2_url || '/transform.php';
        const userData: any = topAny?.userData || {};
        const uid: string = userData?.uid || '';
        const ver: string = topAny?.ver || '';
        const langx: string = topAny?.langx || 'zh-cn';

        const body = new URLSearchParams();
        body.set('p', 'get_game_list');
        body.set('uid', uid);
        body.set('ver', ver);
        body.set('langx', langx);
        body.set('p3type', '');
        body.set('date', '');
        body.set('gtype', paramsIn.gtype);
        body.set('showtype', paramsIn.showtype);
        body.set('rtype', paramsIn.rtype);
        body.set('ltype', paramsIn.ltype);
        body.set('filter', '');
        body.set('cupFantasy', 'N');
        body.set('sorttype', paramsIn.sorttype);
        body.set('specialClick', '');
        body.set('isFantasy', 'N');
        body.set('ts', String(Date.now()));

        const res = await fetch(m2_url + `?ver=${encodeURIComponent(ver)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          credentials: 'include',
        });
        const xml = await res.text();
        return { xml, length: xml ? xml.length : 0 };
      }, params);

      console.log(`抓取赛事 XML 长度: ${result.length}`);
      try { await fs.writeFile('matches-latest.xml', result.xml || ''); } catch {}
      const matches = this.parseMatchesFromXml(result.xml || '');
      console.log(`解析赛事数量: ${matches.length}`);
      return { matches, xml: result.xml };
    };

    try {
      return await attempt();
    } catch (error) {
      console.error('抓取赛事失败(第1次):', error);
      // 发生页面关闭或评估错误时，尝试重登后再抓取一次
      try {
        const accountDb = await query('SELECT * FROM crown_accounts WHERE id = $1', [accountId]);
        const account = accountDb.rows[0];
        if (account) {
          await this.logoutAccount(accountId).catch(() => undefined);
          const loginResult = await this.loginAccount(account);
          if (loginResult.success) {
            return await attempt();
          }
        }
      } catch (e2) {
        console.error('抓取赛事重试失败:', e2);
      }
      return { matches: [] };
    }
  }

  private parseMatchesFromXml(xml: string): any[] {
    if (!xml) {
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

    while ((match = gameRegex.exec(xml)) !== null) {
      const fullBlock = match[0];
      const block = match[1];
      if (results.length === 0) {
        console.log('首个 game 片段示例:', block.slice(0, 200));
      }
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
      if (results.length === 0) {
        console.log('解析示例 => league:', league, 'home:', home, 'away:', away, 'time:', time, 'gid:', gid);
      }
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

    const moneyline = {
      home: pick(['IOR_RMH', 'IOR_MH']),
      draw: pick(['IOR_RMN', 'IOR_MN', 'IOR_RMD']),
      away: pick(['IOR_RMC', 'IOR_MC']),
    };
    if (moneyline.home || moneyline.draw || moneyline.away) {
      markets.moneyline = { ...moneyline };
      markets.full.moneyline = { ...moneyline };
    }

    const handicapLines: Array<{ line: string; home: string; away: string }> = [];
    const addHandicapLine = (ratioKeys: string[], homeKeys: string[], awayKeys: string[]) => {
      const line = pick(ratioKeys);
      const homeOdds = pick(homeKeys);
      const awayOdds = pick(awayKeys);
      if (line || homeOdds || awayOdds) {
        handicapLines.push({ line, home: homeOdds, away: awayOdds });
      }
    };
    addHandicapLine(['RATIO_RE', 'RATIO_R'], ['IOR_REH', 'IOR_RH'], ['IOR_REC', 'IOR_RC']);
    if (handicapLines.length > 0) {
      markets.handicap = { ...handicapLines[0] };
      markets.full.handicap = { ...handicapLines[0] };
      markets.full.handicapLines = handicapLines;
    }

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

    const odd = pick(['IOR_REOO']);
    const even = pick(['IOR_REOE']);
    if (odd || even) {
      markets.full.oddEven = { odd, even };
    }

    const halfMoneyline = {
      home: pick(['IOR_HRMH']),
      draw: pick(['IOR_HRMN']),
      away: pick(['IOR_HRMC']),
    };
    if (halfMoneyline.home || halfMoneyline.draw || halfMoneyline.away) {
      markets.half.moneyline = { ...halfMoneyline };
    }

    const halfHandicap: Array<{ line: string; home: string; away: string }> = [];
    const addHalfHandicap = (ratioKeys: string[], homeKeys: string[], awayKeys: string[]) => {
      const line = pick(ratioKeys);
      const homeOdds = pick(homeKeys);
      const awayOdds = pick(awayKeys);
      if (line || homeOdds || awayOdds) {
        halfHandicap.push({ line, home: homeOdds, away: awayOdds });
      }
    };
    addHalfHandicap(['RATIO_HRE'], ['IOR_HREH'], ['IOR_HREC']);
    if (halfHandicap.length > 0) {
      markets.half.handicap = { ...halfHandicap[0] };
      markets.half.handicapLines = halfHandicap;
    }

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
    addHalfOu(['RATIO_HROUO'], ['RATIO_HROUU'], ['IOR_HROUH'], ['IOR_HROUC']);
    if (halfOu.length > 0) {
      markets.half.ou = { ...halfOu[0] };
      markets.half.overUnderLines = halfOu;
    }

    const more = pick(['MORE']);
    if (more) {
      const moreNum = Number(more);
      markets.more = Number.isFinite(moreNum) ? moreNum : more;
    }

    const counts = {
      handicap: pick(['R_COUNT']),
      overUnder: pick(['OU_COUNT']),
      correctScore: pick(['PD_COUNT']),
      corners: pick(['CN_COUNT']),
      winners: pick(['WI_COUNT']),
      specials: pick(['SFS_COUNT']),
      penalties: pick(['PK_COUNT']),
    };
    markets.counts = counts;

    if (Object.keys(markets.half).length === 0) {
      delete markets.half;
    }
    if (Object.keys(markets.full).length === 0) {
      delete markets.full;
    }

    return markets;
  }


  // 登出账号
  async logoutAccount(accountId: number): Promise<boolean> {
    try {
      const context = this.contexts.get(accountId);
      const page = this.pages.get(accountId);

      if (page) {
        try {
          const logoutButton = page.locator('a, button').filter({ hasText: /登出|退出|Logout/ }).first();
          if (await logoutButton.count()) {
            await logoutButton.click({ timeout: 5000 });
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
          }
        } catch (err) {
          console.warn(`⚠️ 尝试点击登出按钮失败: ${err}`);
        }
      }

      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);

      // 若存在专用代理浏览器，一并关闭
      const perBrowser = this.accountBrowsers.get(accountId);
      if (perBrowser) {
        try { await perBrowser.close(); } catch {}
        this.accountBrowsers.delete(accountId);
      }

      this.contexts.delete(accountId);
      this.pages.delete(accountId);
      this.sessionInfos.delete(accountId);
      this.lastHeartbeats.delete(accountId);

      console.log(`🔓 账号 ${accountId} 已登出`);
      return true;

    } catch (error) {
      console.error(`登出账号 ${accountId} 失败:`, error);
      return false;
    }
  }

  // 关闭自动化服务
  async close() {
    try {
      // 关闭所有上下文
      for (const [accountId, context] of this.contexts) {
        await context.close();
      }

      // 关闭 per-account 浏览器
      for (const [aid, br] of this.accountBrowsers) {
        try { await br.close(); } catch {}
      }
      this.accountBrowsers.clear();

      // 关闭共享浏览器
      if (this.browser) {
        await this.browser.close();
      }

      this.contexts.clear();
      this.pages.clear();
      this.sessionInfos.clear();
      this.lastHeartbeats.clear();
      this.browser = null;

      console.log('🔒 皇冠自动化服务已关闭');
    } catch (error) {
      console.error('关闭自动化服务失败:', error);
    }
  }

  // 获取活跃会话数量
  getActiveSessionCount(): number {
    return this.contexts.size;
  }

  getSystemStatus() {
    const username = this.systemUsername || process.env.CROWN_SYSTEM_USERNAME || '';
    const online = this.pages.has(0) && this.contexts.has(0);
    return {
      username,
      online,
      lastHeartbeat: this.systemLastBeat || null,
      lastLogin: this.systemLastLogin || null,
    };
  }

  // 检查账号是否在线
  isAccountOnline(accountId: number): boolean {
    return this.pages.has(accountId) && this.contexts.has(accountId);
  }

  triggerFetchWarmup() {
    this.ensureFetchWarmup().catch((error) => {
      console.error('❌ 手动触发抓取账号预热失败:', error);
    });
  }

  async getSessionInfo(accountId: number): Promise<any | null> {
    if (this.sessionInfos.has(accountId)) {
      return this.sessionInfos.get(accountId);
    }

    try {
      const result = await query(
        'SELECT session_data FROM crown_account_sessions WHERE account_id = $1',
        [accountId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      const session = result.rows[0].session_data;
      this.sessionInfos.set(accountId, session);
      return session;
    } catch (error) {
      console.error('获取会话信息失败:', error);
      return null;
    }
  }

  // 检查出口 IP（用于验证代理是否生效）
  async getExternalIP(accountId: number): Promise<string | null> {
    try {
      const page = this.pages.get(accountId);
      if (!page) return null;

      // 新开临时页面，避免污染业务页面
      const context = this.contexts.get(accountId);
      if (!context) return null;
      const tmp = await context.newPage();
      try {
        await tmp.goto('https://api.ipify.org?format=json', { waitUntil: 'load', timeout: 15000 });
        const body = await tmp.locator('body').innerText({ timeout: 5000 }).catch(() => '');
        if (body) {
          try {
            const data = JSON.parse(body);
            return data.ip || null;
          } catch {
            const m = body.match(/\"ip\"\s*:\s*\"([^\"]+)\"/i);
            return m ? m[1] : null;
          }
        }
        return null;
      } finally {
        await tmp.close().catch(() => undefined);
      }
    } catch (e) {
      console.error('获取出口IP失败:', e);
      return null;
    }
  }
}

// 延迟创建单例实例
let crownAutomationInstance: CrownAutomationService | null = null;

export const getCrownAutomation = (): CrownAutomationService => {
  if (!crownAutomationInstance) {
    crownAutomationInstance = new CrownAutomationService();
  }
  return crownAutomationInstance;
};
