# 多盘口功能故障排查指南

## 1. 常见问题诊断

### 1.1 只显示1条盘口

**症状**：
- 每场比赛只显示1条让球和1条大小球
- 日志显示 `H:1 OU:1`

**可能原因**：
1. 过滤逻辑过于严格，误过滤了正常盘口
2. XML 解析失败
3. API 返回的数据本身只有1条盘口

**排查步骤**：

```bash
# 1. 检查原始 XML 数据
cd fetcher
ls -la data/last-more.xml

# 2. 查看 XML 中有多少个 <game> 节点
grep -c '<game id=' data/last-more.xml

# 3. 查看具体的 game 节点内容
grep -A 10 '<game id=' data/last-more.xml | head -50

# 4. 检查是否有 mode="CN" 的角球盘口
grep 'mode="CN"' data/last-more.xml

# 5. 检查日志中的解析结果
tail -f logs/fetcher.log | grep "多盘口补全完成"
```

**解决方案**：
- 确认过滤逻辑只检查 `mode`、`ptype` 和队名
- 不要检查字段名是否包含 "CN"

### 1.2 球队名字显示为 undefined

**症状**：
- 前端显示 `undefined vs undefined`
- JSON 文件中 `homeTeam` 和 `awayTeam` 为 `null` 或 `undefined`

**可能原因**：
1. `get_game_list` 返回的数据中没有球队名字
2. 字段名不匹配（简体/繁体字段名不同）
3. `get_game_more` 没有成功提取球队名字

**排查步骤**：

```bash
# 1. 检查 latest-matches.json 中的数据
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('fetcher/data/latest-matches.json', 'utf8'));
const match = data.matches[0];
console.log('homeTeam:', match.homeTeam);
console.log('awayTeam:', match.awayTeam);
console.log('home:', match.home);
console.log('away:', match.away);
"

# 2. 检查 XML 中的球队名字字段
grep -E 'TEAM_H|team_h' fetcher/data/last-more.xml | head -5

# 3. 检查日志中是否有球队名字
tail -f logs/fetcher.log | grep -E "vs|多盘口补全完成"
```

**解决方案**：
- 在 `pickString` 中添加所有可能的字段名：
  - `TEAM_H`, `team_h`, `TEAM_H_CN`, `team_h_cn`, `TEAM_H_E`, `TEAM_H_TW`
  - `TEAM_C`, `team_c`, `TEAM_C_CN`, `team_c_cn`, `TEAM_C_E`, `TEAM_C_TW`

### 1.3 赔率不更新

**症状**：
- 页面显示的赔率长时间不变
- 文件修改时间不更新

**可能原因**：
1. Fetcher 服务停止运行
2. 更新间隔设置过长
3. Crown API 本身赔率变化慢
4. 前端缓存问题

**排查步骤**：

```bash
# 1. 检查 fetcher 进程是否运行
ps aux | grep 'node dist/index' | grep -v grep

# 2. 检查文件修改时间
stat fetcher/data/latest-matches.json

# 3. 实时监控文件变化
watch -n 2 'stat fetcher/data/latest-matches.json | grep Modify'

# 4. 检查更新间隔配置
cat fetcher/.env | grep INTERVAL

# 5. 查看最近的日志
tail -20 fetcher/logs/fetcher.log
```

**解决方案**：
- 确认 fetcher 服务正在运行
- 检查更新间隔配置是否合理
- 对于滚球比赛，建议 2-5 秒更新一次

### 1.4 API 返回空数据

**症状**：
- 日志显示 `⚠️ API返回空: xxx vs xxx`
- 某些比赛没有多盘口数据

**可能原因**：
1. 比赛已结束或暂停
2. API 参数不正确
3. 账号权限不足
4. 网络问题

**排查步骤**：

```bash
# 1. 检查日志中的 API 调用
tail -f logs/fetcher.log | grep "get_game_more"

# 2. 查看哪些比赛返回空
tail -f logs/fetcher.log | grep "API返回空"

# 3. 检查网络连接
curl -I https://hga026.com

# 4. 检查会话是否有效
tail -f logs/fetcher.log | grep "登录"
```

**解决方案**：
- 对于返回空的比赛，跳过处理，不影响其他比赛
- 检查账号是否被封禁
- 尝试切换备用站点

## 2. 调试技巧

### 2.1 查看原始 XML 数据

在 `crown-client.ts` 中添加调试代码：

```typescript
async getGameMore(params: any): Promise<string | null> {
  // ... 现有代码 ...
  
  if (res.data && typeof res.data === 'string' && res.data.includes('<game')) {
    // 保存原始 XML 用于调试
    const fs = require('fs');
    fs.writeFileSync('data/last-more.xml', res.data);
    
    console.log(`ℹ️ get_game_more(${params.showtype}) -> xml=Y len=${res.data.length}`);
    return res.data;
  }
}
```

### 2.2 打印解析结果

在 `parseMoreMarkets` 函数中添加调试日志：

```typescript
private parseMoreMarkets(xml: string) {
  // ... 解析代码 ...
  
  console.log('📊 解析结果:', {
    handicapLines: handicapLines.length,
    overUnderLines: overUnderLines.length,
    halfHandicapLines: halfHandicapLines.length,
    halfOverUnderLines: halfOverUnderLines.length,
    homeTeam,
    awayTeam,
  });
  
  return { ... };
}
```

### 2.3 监控数据变化

创建一个监控脚本 `scripts/monitor-odds.js`：

```javascript
const fs = require('fs');

let lastData = null;

setInterval(() => {
  const data = JSON.parse(fs.readFileSync('fetcher/data/latest-matches.json', 'utf8'));
  const live = data.matches.filter(m => m.showtype === 'live');
  
  if (lastData) {
    // 比较赔率变化
    live.forEach((match, i) => {
      const lastMatch = lastData[i];
      if (lastMatch && lastMatch.gid === match.gid) {
        const h1 = match.markets.full.handicapLines[0];
        const h2 = lastMatch.markets.full.handicapLines[0];
        
        if (h1 && h2 && (h1.home !== h2.home || h1.away !== h2.away)) {
          console.log(`🔄 ${match.homeTeam} vs ${match.awayTeam}`);
          console.log(`   让球: ${h2.home}/${h2.away} -> ${h1.home}/${h1.away}`);
        }
      }
    });
  }
  
  lastData = live;
}, 2000);
```

### 2.4 测试特定比赛

创建测试脚本 `scripts/test-match.js`：

```javascript
const CrownClient = require('../dist/crown-client').default;

async function testMatch(gid) {
  const client = new CrownClient({
    username: process.env.CROWN_USERNAME,
    password: process.env.CROWN_PASSWORD,
    baseUrl: process.env.CROWN_BASE_URL,
  });
  
  await client.login();
  
  const xml = await client.getGameMore({
    gtype: 'FT',
    showtype: 'live',
    ltype: '3',
    ecid: gid,
    lid: '0',
    gid: gid,
    isRB: 'Y',
  });
  
  if (xml) {
    console.log('✅ XML 长度:', xml.length);
    console.log('✅ game 节点数:', (xml.match(/<game/g) || []).length);
    
    const result = client.parseMoreMarkets(xml);
    console.log('✅ 解析结果:', result);
  } else {
    console.log('❌ 未获取到数据');
  }
}

testMatch(process.argv[2]);
```

使用方法：

```bash
node scripts/test-match.js 10123456
```

## 3. 性能监控

### 3.1 监控抓取耗时

在 `index.ts` 中添加性能监控：

```typescript
async function fetchShowtype(showtype: string) {
  const startTime = Date.now();
  
  // ... 抓取逻辑 ...
  
  const duration = Date.now() - startTime;
  console.log(`⏱️ [${showtype}] 抓取耗时: ${duration}ms`);
  
  if (duration > 60000) {
    console.warn(`⚠️ [${showtype}] 抓取耗时过长: ${duration}ms`);
  }
}
```

### 3.2 监控 API 调用次数

```typescript
let apiCallCount = 0;
let apiCallStartTime = Date.now();

async function getGameMore(params: any) {
  apiCallCount++;
  
  // 每分钟统计一次
  if (Date.now() - apiCallStartTime > 60000) {
    console.log(`📊 API 调用统计: ${apiCallCount} 次/分钟`);
    apiCallCount = 0;
    apiCallStartTime = Date.now();
  }
  
  // ... API 调用逻辑 ...
}
```

### 3.3 监控内存使用

```typescript
setInterval(() => {
  const used = process.memoryUsage();
  console.log('💾 内存使用:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
  });
}, 60000);
```

## 4. 日志分析

### 4.1 统计成功率

```bash
# 统计总抓取次数
grep "抓取成功" fetcher/logs/fetcher.log | wc -l

# 统计失败次数
grep "抓取失败" fetcher/logs/fetcher.log | wc -l

# 统计 API 返回空的次数
grep "API返回空" fetcher/logs/fetcher.log | wc -l
```

### 4.2 查找特定比赛

```bash
# 查找特定球队的比赛
grep "拜仁慕尼黑" fetcher/logs/fetcher.log

# 查找特定联赛的比赛
grep "德国甲组联赛" fetcher/logs/fetcher.log

# 查找多盘口数量异常的比赛
grep "H:1 OU:1" fetcher/logs/fetcher.log
```

### 4.3 分析赔率变化

```bash
# 提取某场比赛的所有赔率记录
grep "拜仁慕尼黑" fetcher/logs/fetcher.log | grep "H:"
```

## 5. 紧急恢复

### 5.1 服务崩溃恢复

```bash
# 1. 停止所有 fetcher 进程
pkill -f 'node dist/index'

# 2. 清理临时文件
rm -f fetcher/data/*.tmp

# 3. 检查配置文件
cat fetcher/.env

# 4. 重新启动服务
cd fetcher && npm run start
```

### 5.2 数据损坏恢复

```bash
# 1. 备份当前数据
cp fetcher/data/latest-matches.json fetcher/data/latest-matches.json.bak

# 2. 检查 JSON 格式
node -e "JSON.parse(require('fs').readFileSync('fetcher/data/latest-matches.json', 'utf8'))"

# 3. 如果损坏，删除并重新抓取
rm fetcher/data/latest-matches.json
cd fetcher && npm run start
```

### 5.3 账号被封恢复

```bash
# 1. 切换备用站点
# 修改 fetcher/.env 中的 CROWN_BASE_URL
CROWN_BASE_URL=https://hga027.com

# 2. 清除会话缓存
rm fetcher/data/session.json

# 3. 重新登录
cd fetcher && npm run start
```

## 6. 最佳实践

### 6.1 日志管理

- 使用日志轮转，避免日志文件过大
- 保留最近 7 天的日志
- 对关键错误发送告警

### 6.2 监控告警

- 监控抓取成功率，低于 95% 时告警
- 监控 API 响应时间，超过 5 秒时告警
- 监控内存使用，超过 500MB 时告警

### 6.3 定期维护

- 每周检查一次日志，分析异常情况
- 每月更新一次备用站点列表
- 每季度优化一次代码性能

---

**文档版本**：v1.0  
**最后更新**：2025-11-08  
**作者**：开发团队

