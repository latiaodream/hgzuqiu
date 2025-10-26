import axios from 'axios';
import * as https from 'https';

/**
 * 皇冠站点信息
 */
export interface CrownSite {
  url: string;
  name: string;
  category: 'hga' | 'mos';
  isActive: boolean;
  lastCheckTime?: Date;
  lastSuccessTime?: Date;
  failureCount: number;
  responseTime?: number; // 毫秒
  status: 'online' | 'offline' | 'unknown';
}

/**
 * 站点健康检查结果
 */
interface HealthCheckResult {
  url: string;
  success: boolean;
  responseTime: number;
  error?: string;
}

/**
 * 皇冠站点管理器
 * 负责管理多个皇冠站点，实现自动切换和健康检查
 */
export class CrownSiteManager {
  private static instance: CrownSiteManager;
  
  // 所有可用站点
  private sites: Map<string, CrownSite> = new Map();
  
  // 当前使用的站点
  private currentSite: string;
  
  // 健康检查定时器
  private healthCheckTimer?: NodeJS.Timeout;
  private healthCheckInterval: number = 5 * 60 * 1000; // 5分钟检查一次
  
  // 失败阈值：连续失败多少次后标记为离线
  private failureThreshold: number = 3;
  
  // 熔断时间：站点失败后多久才能重试（毫秒）
  private cooldownTime: number = 10 * 60 * 1000; // 10分钟

  private constructor() {
    this.initializeSites();
    this.currentSite = this.getDefaultSite();
    this.startHealthCheck();
  }

  public static getInstance(): CrownSiteManager {
    if (!CrownSiteManager.instance) {
      CrownSiteManager.instance = new CrownSiteManager();
    }
    return CrownSiteManager.instance;
  }

  /**
   * 初始化所有站点
   */
  private initializeSites(): void {
    const siteList = [
      // HGA系列
      { url: 'https://hga026.com', name: 'HGA026', category: 'hga' as const },
      { url: 'https://hga027.com', name: 'HGA027', category: 'hga' as const },
      { url: 'https://hga030.com', name: 'HGA030', category: 'hga' as const },
      { url: 'https://hga035.com', name: 'HGA035', category: 'hga' as const },
      { url: 'https://hga038.com', name: 'HGA038', category: 'hga' as const },
      { url: 'https://hga039.com', name: 'HGA039', category: 'hga' as const },
      { url: 'https://hga050.com', name: 'HGA050', category: 'hga' as const },
      // MOS系列
      { url: 'https://mos011.com', name: 'MOS011', category: 'mos' as const },
      { url: 'https://mos022.com', name: 'MOS022', category: 'mos' as const },
      { url: 'https://mos033.com', name: 'MOS033', category: 'mos' as const },
      { url: 'https://mos055.com', name: 'MOS055', category: 'mos' as const },
      { url: 'https://mos066.com', name: 'MOS066', category: 'mos' as const },
      { url: 'https://mos100.com', name: 'MOS100', category: 'mos' as const },
    ];

    siteList.forEach(site => {
      this.sites.set(site.url, {
        ...site,
        isActive: site.url === 'https://hga050.com', // 默认使用 hga050
        failureCount: 0,
        status: 'unknown',
      });
    });

    console.log(`🌐 初始化 ${this.sites.size} 个皇冠站点`);
  }

  /**
   * 获取默认站点
   */
  private getDefaultSite(): string {
    // 优先使用环境变量
    const envSite = process.env.CROWN_BASE_URL;
    if (envSite && this.sites.has(envSite)) {
      return envSite;
    }

    // 默认使用 hga050.com
    return 'https://hga050.com';
  }

  /**
   * 获取当前使用的站点URL
   */
  public getCurrentSite(): string {
    return this.currentSite;
  }

  /**
   * 获取当前站点信息
   */
  public getCurrentSiteInfo(): CrownSite | undefined {
    return this.sites.get(this.currentSite);
  }

  /**
   * 获取所有站点信息
   */
  public getAllSites(): CrownSite[] {
    return Array.from(this.sites.values());
  }

  /**
   * 手动切换站点
   */
  public switchSite(url: string): boolean {
    const site = this.sites.get(url);
    if (!site) {
      console.error(`❌ 站点不存在: ${url}`);
      return false;
    }

    // 更新当前站点
    const oldSite = this.currentSite;
    this.currentSite = url;

    // 更新激活状态
    this.sites.forEach((s, u) => {
      s.isActive = u === url;
    });

    console.log(`🔄 站点切换: ${oldSite} → ${url}`);
    return true;
  }

  /**
   * 自动切换到可用站点
   */
  public async autoSwitchToAvailableSite(): Promise<string | null> {
    console.log('🔍 开始自动切换站点...');

    // 获取所有在线站点，按响应时间排序
    const onlineSites = Array.from(this.sites.values())
      .filter(site => site.status === 'online' && site.url !== this.currentSite)
      .sort((a, b) => (a.responseTime || 9999) - (b.responseTime || 9999));

    if (onlineSites.length === 0) {
      console.warn('⚠️  没有可用的备用站点');
      return null;
    }

    // 切换到响应最快的站点
    const bestSite = onlineSites[0];
    this.switchSite(bestSite.url);
    console.log(`✅ 已切换到: ${bestSite.name} (${bestSite.responseTime}ms)`);
    
    return bestSite.url;
  }

  /**
   * 报告站点访问失败
   */
  public reportFailure(url: string): void {
    const site = this.sites.get(url);
    if (!site) return;

    site.failureCount++;
    site.lastCheckTime = new Date();

    console.log(`⚠️  站点访问失败: ${site.name} (失败次数: ${site.failureCount})`);

    // 达到失败阈值，标记为离线
    if (site.failureCount >= this.failureThreshold) {
      site.status = 'offline';
      console.log(`❌ 站点标记为离线: ${site.name}`);

      // 如果是当前站点失败，自动切换
      if (url === this.currentSite) {
        this.autoSwitchToAvailableSite().catch(err => {
          console.error('自动切换站点失败:', err);
        });
      }
    }
  }

  /**
   * 报告站点访问成功
   */
  public reportSuccess(url: string, responseTime?: number): void {
    const site = this.sites.get(url);
    if (!site) return;

    site.failureCount = 0;
    site.status = 'online';
    site.lastSuccessTime = new Date();
    site.lastCheckTime = new Date();
    if (responseTime !== undefined) {
      site.responseTime = responseTime;
    }
  }

  /**
   * 健康检查单个站点
   */
  private async checkSiteHealth(url: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // 创建一个简单的健康检查请求
      const response = await axios.get(`${url}/app/member/FT_browse/index.php`, {
        timeout: 10000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: () => true, // 接受所有状态码
      });

      const responseTime = Date.now() - startTime;
      
      // 只要能连接上就算成功（即使返回错误页面）
      const success = response.status < 500;

      return {
        url,
        success,
        responseTime,
        error: success ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      return {
        url,
        success: false,
        responseTime,
        error: error.message || '连接失败',
      };
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    console.log('🏥 开始站点健康检查...');

    const checkPromises = Array.from(this.sites.keys()).map(url => 
      this.checkSiteHealth(url)
    );

    const results = await Promise.allSettled(checkPromises);

    let onlineCount = 0;
    let offlineCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const checkResult = result.value;
        const site = this.sites.get(checkResult.url);
        
        if (site) {
          site.lastCheckTime = new Date();
          
          if (checkResult.success) {
            site.status = 'online';
            site.failureCount = 0;
            site.lastSuccessTime = new Date();
            site.responseTime = checkResult.responseTime;
            onlineCount++;
          } else {
            site.failureCount++;
            if (site.failureCount >= this.failureThreshold) {
              site.status = 'offline';
              offlineCount++;
            }
          }
        }
      }
    });

    console.log(`✅ 健康检查完成: ${onlineCount} 在线, ${offlineCount} 离线`);

    // 如果当前站点离线，自动切换
    const currentSiteInfo = this.sites.get(this.currentSite);
    if (currentSiteInfo && currentSiteInfo.status === 'offline') {
      console.warn(`⚠️  当前站点 ${currentSiteInfo.name} 离线，尝试自动切换...`);
      await this.autoSwitchToAvailableSite();
    }
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    // 立即执行一次
    this.performHealthCheck().catch(err => {
      console.error('健康检查失败:', err);
    });

    // 定期执行
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(err => {
        console.error('健康检查失败:', err);
      });
    }, this.healthCheckInterval);

    console.log(`⏰ 已启动站点健康检查 (间隔: ${this.healthCheckInterval / 1000}秒)`);
  }

  /**
   * 停止健康检查
   */
  public stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      console.log('⏹️  已停止站点健康检查');
    }
  }

  /**
   * 手动触发健康检查
   */
  public async triggerHealthCheck(): Promise<void> {
    await this.performHealthCheck();
  }
}

// 导出单例
export const getCrownSiteManager = () => CrownSiteManager.getInstance();

