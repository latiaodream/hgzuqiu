# 皇冠赛事抓取服务实现总结

## 概述

已成功实现皇冠 API 赛事抓取服务，支持同时抓取滚球、今日、早盘三种类型的赛事。

## 实现的功能

### 1. 多类型赛事抓取

- ✅ **滚球（live）**：正在进行的比赛，使用 `rtype=rb`
- ✅ **今日（today）**：今天的比赛，使用 `rtype=r`
- ✅ **早盘（early）**：明天及以后的比赛，使用 `rtype=r`

### 2. 数据合并和保存

- 每次抓取循环依次获取三种类型的赛事
- 合并所有赛事到一个数组
- 为每场比赛添加 `showtype` 标记
- 保存到 `fetcher/data/latest-matches.json`

### 3. 统计和监控

- 分类统计各类型赛事数量
- 显示成功率和失败次数
- 每分钟打印一次统计信息
- 记录登录次数和最后抓取时间

### 4. 会话管理

- 登录后保存会话到文件
- 会话有效期 2 小时
- 自动检测会话过期并重新登录
- 处理重复登录错误

## 修改的文件

### 1. fetcher/src/crown-client.ts

**修改内容：**
- `fetchMatches()` 方法支持传入参数：
  - `showtype`: 显示类型（live/today/early）
  - `gtype`: 比赛类型（ft=足球）
  - `rtype`: 盘口类型（rb=滚球, r=非滚球）
- 为每场比赛添加 `showtype` 和 `source_showtype` 标记
- 增强赛事数据结构，添加更多字段别名：
  - `league_name`, `team_h`, `team_c`
  - `match_time`, `timer`, `datetime`
  - `current_score`, `state`, `period`

**关键代码：**
```typescript
async fetchMatches(options?: {
  showtype?: string;
  gtype?: string;
  rtype?: string;
}): Promise<FetchResult> {
  const showtype = options?.showtype || 'live';
  const gtype = options?.gtype || 'ft';
  const rtype = options?.rtype || (showtype === 'live' ? 'rb' : 'r');
  
  // ... 抓取逻辑
  
  // 为每场比赛添加 showtype 标记
  matches.forEach((match: any) => {
    match.showtype = showtype;
    match.source_showtype = showtype;
  });
  
  return { success: true, matches, timestamp: Date.now() };
}
```

### 2. fetcher/src/index.ts

**修改内容：**
- 修改主抓取循环，依次抓取三种类型
- 合并所有赛事并保存
- 更新统计信息结构
- 改进日志输出

**关键代码：**
```typescript
async function fetchLoop() {
  // 抓取三种类型的赛事
  const showtypes = [
    { type: 'live', name: '滚球', rtype: 'rb' },
    { type: 'today', name: '今日', rtype: 'r' },
    { type: 'early', name: '早盘', rtype: 'r' },
  ];

  const allMatches: any[] = [];
  const matchCounts: any = { live: 0, today: 0, early: 0 };

  for (const showtype of showtypes) {
    const result = await client.fetchMatches({
      showtype: showtype.type,
      gtype: 'ft',
      rtype: showtype.rtype,
    });
    
    if (result.success) {
      matchCounts[showtype.type] = result.matches.length;
      allMatches.push(...result.matches);
    }
    
    // 延迟 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 保存合并后的数据
  fs.writeFileSync(dataFile, JSON.stringify({
    timestamp: Date.now(),
    matches: allMatches,
    matchCount: allMatches.length,
    breakdown: matchCounts,
  }));
}
```

### 3. fetcher/.env.example

**修改内容：**
- 更新配置说明
- 添加备用站点列表
- 调整推荐的抓取间隔为 3000ms

### 4. fetcher/README.md

**修改内容：**
- 更新功能说明，强调多类型抓取
- 添加数据文件格式说明
- 添加抓取流程说明
- 更新监控信息说明

## 新增的文件

### 1. fetcher/.env
环境变量配置文件模板

### 2. fetcher/DEPLOY.md
详细的部署指南，包括：
- 部署步骤
- 验证方法
- 常见问题解决
- 监控和维护
- 性能优化

### 3. fetcher/CHANGELOG.md
更新日志，记录所有修改

### 4. fetcher/QUICK_START.md
快速开始指南，5分钟快速部署

### 5. fetcher/start.sh
快速启动脚本，自动检查环境

### 6. fetcher/stop.sh
快速停止脚本

## 数据文件格式

### fetcher/data/latest-matches.json

```json
{
  "timestamp": 1699267817000,
  "matches": [
    {
      "gid": "3001234",
      "ecid": "3001234",
      "league": "英格兰超级联赛",
      "league_name": "英格兰超级联赛",
      "home": "曼彻斯特联",
      "away": "利物浦",
      "team_h": "曼彻斯特联",
      "team_c": "利物浦",
      "score": "2-1",
      "current_score": "2-1",
      "time": "11-06 20:00",
      "datetime": "11-06 20:00",
      "match_time": "11-06 20:00",
      "timer": "11-06 20:00",
      "status": "1",
      "state": "1",
      "period": "滚球",
      "showtype": "live",
      "source_showtype": "live",
      "markets": {
        "full": {
          "handicap": { "line": "0.5", "home": "0.95", "away": "0.95" },
          "ou": { "line": "2.5", "over": "0.90", "under": "1.00" },
          "moneyline": { "home": "1.80", "draw": "3.50", "away": "4.20" }
        },
        "half": { ... }
      },
      "raw": { ... }
    }
  ],
  "matchCount": 150,
  "breakdown": {
    "live": 45,
    "today": 60,
    "early": 45
  }
}
```

## 与主程序集成

### 后端集成

后端会自动读取数据文件，优先级如下：

1. `fetcher-isports/data/latest-matches.json`（iSports 数据）
2. `fetcher/data/latest-matches.json`（皇冠数据）

后端使用 `filterMatchesByShowtype()` 函数根据前端选择的 `showtype` 自动过滤赛事。

**无需修改主程序代码**，只需确保 fetcher 服务正常运行即可。

### 前端集成

前端赛事管理页面可以选择不同的赛事类型：
- 滚球（live）
- 今日（today）
- 早盘（early）

后端会自动根据选择的类型过滤并返回对应的赛事。

## 使用方法

### 1. 配置

```bash
cd fetcher
cp .env.example .env
nano .env
```

修改账号密码：
```env
CROWN_USERNAME=your_username
CROWN_PASSWORD=your_password
CROWN_BASE_URL=https://hga026.com
FETCH_INTERVAL=3000
```

### 2. 启动

```bash
# 方式一：使用启动脚本
./start.sh

# 方式二：手动启动
npm run build
pm2 start ecosystem.config.js
```

### 3. 监控

```bash
# 查看日志
pm2 logs crown-fetcher

# 查看状态
pm2 status

# 查看数据
cat data/latest-matches.json | jq '.breakdown'
```

### 4. 停止

```bash
# 方式一：使用停止脚本
./stop.sh

# 方式二：手动停止
pm2 stop crown-fetcher
```

## 性能特点

### 抓取频率

- 配置的 `FETCH_INTERVAL` 为每次抓取循环的间隔
- 每次循环会依次抓取三种类型，每种之间延迟 500ms
- 实际间隔 = FETCH_INTERVAL + 抓取时间 + 1500ms（3次延迟）

### 资源占用

- 内存：约 100-200MB
- CPU：低（大部分时间在等待）
- 网络：每次抓取约 3 个请求

### 数据更新

- 滚球赛事：实时更新
- 今日赛事：每个抓取周期更新
- 早盘赛事：每个抓取周期更新

## 备用站点

如果主站点无法访问，可以尝试以下备用站点：

1. hga026.com
2. hga027.com
3. hga030.com
4. hga035.com
5. hga038.com
6. hga039.com
7. hga050.com
8. mos011.com
9. mos022.com
10. mos033.com
11. mos055.com
12. mos066.com
13. mos100.com

## 故障排查

### 常见问题

1. **登录失败**
   - 检查账号密码
   - 尝试更换备用站点
   - 确认账号未被锁定

2. **抓取失败**
   - 检查网络连接
   - 查看日志找出原因
   - 尝试重启服务

3. **数据不更新**
   - 检查服务状态
   - 查看日志是否有错误
   - 重启服务

### 日志位置

- 输出日志：`logs/out.log`
- 错误日志：`logs/error.log`
- PM2 日志：`~/.pm2/logs/`

## 总结

✅ 已成功实现皇冠 API 赛事抓取服务
✅ 支持滚球、今日、早盘三种类型
✅ 自动合并和保存数据
✅ 完善的监控和统计
✅ 详细的文档和脚本
✅ 与主程序无缝集成

服务已准备就绪，可以立即部署使用！

