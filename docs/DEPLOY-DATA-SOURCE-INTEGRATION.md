# 数据源整合功能部署指南

## 快速部署

### 1. 更新代码

```bash
# 拉取最新代码
cd /www/wwwroot/aibcbot.top
git pull

# 或者手动上传修改的文件:
# - fetcher-isports/src/index.ts
# - frontend/src/pages/MatchesPage.tsx
# - frontend/src/components/Betting/BetFormModal.tsx
# - backend/scripts/test-data-source-integration.ts
# - backend/package.json
```

### 2. 重新编译和部署

```bash
# 2.1 重新编译 fetcher-isports
cd /www/wwwroot/aibcbot.top/fetcher-isports
npm run build

# 2.2 重启 fetcher-isports 服务
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports

# 2.3 重新编译前端
cd /www/wwwroot/aibcbot.top/frontend
npm run build

# 2.4 重启前端服务 (如果使用 PM2)
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-frontend
```

### 3. 测试功能

```bash
# 3.1 抓取皇冠数据
cd /www/wwwroot/aibcbot.top/backend
npm run crown:fetch-gids

# 3.2 运行测试脚本
npm run test:data-source

# 3.3 检查输出
# 应该看到类似输出:
# ✅ crown-gids.json 存在
# ✅ latest-matches.json 存在
# 📊 统计数据源分布...
#    iSports 数据源: 150 场 (75.0%)
#    皇冠数据源: 50 场 (25.0%)
```

### 4. 验证前端

访问前端页面: `https://aibcbot.top`

检查:
- ✅ 比赛列表是否显示数据来源标记
  - 🟢 绿色 [iSports] - 有中文翻译
  - 🟠 橙色 [皇冠] - 皇冠独有
- ✅ 是否能看到更多比赛（包括皇冠独有的）
- ✅ 点击皇冠独有的比赛是否能正常下注

## 定时任务设置

为了保持皇冠数据最新,建议设置定时任务:

### 方法 1: 使用宝塔面板

1. 登录宝塔面板
2. 进入 "计划任务"
3. 添加任务:
   - 任务类型: Shell 脚本
   - 任务名称: 抓取皇冠赛事
   - 执行周期: 每 10 分钟
   - 脚本内容:
     ```bash
     #!/bin/bash
     cd /www/wwwroot/aibcbot.top/backend
     /www/server/nodejs/v22.18.0/bin/npm run crown:fetch-gids >> /tmp/crown-fetch.log 2>&1
     ```

### 方法 2: 使用 crontab

```bash
# 编辑 crontab
crontab -e

# 添加以下行 (每 10 分钟执行一次)
*/10 * * * * cd /www/wwwroot/aibcbot.top/backend && /www/server/nodejs/v22.18.0/bin/npm run crown:fetch-gids >> /tmp/crown-fetch.log 2>&1

# 保存并退出
```

### 方法 3: 使用 PM2 (推荐)

创建一个独立的定时抓取服务:

```bash
# 创建定时抓取脚本
cat > /www/wwwroot/aibcbot.top/backend/scripts/crown-fetch-daemon.js << 'EOF'
const { exec } = require('child_process');
const path = require('path');

const INTERVAL = 10 * 60 * 1000; // 10 分钟

function fetchCrownGids() {
  console.log(`[${new Date().toISOString()}] 开始抓取皇冠赛事...`);
  
  exec('npm run crown:fetch-gids', {
    cwd: path.resolve(__dirname, '..')
  }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[${new Date().toISOString()}] 抓取失败:`, error);
      return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
    console.log(`[${new Date().toISOString()}] 抓取完成`);
  });
}

// 立即执行一次
fetchCrownGids();

// 定时执行
setInterval(fetchCrownGids, INTERVAL);

console.log(`皇冠赛事定时抓取服务已启动 (间隔: ${INTERVAL / 1000 / 60} 分钟)`);
EOF

# 使用 PM2 启动
cd /www/wwwroot/aibcbot.top/backend
/www/server/nodejs/v22.18.0/bin/pm2 start scripts/crown-fetch-daemon.js --name crown-fetch-daemon

# 保存 PM2 配置
/www/server/nodejs/v22.18.0/bin/pm2 save
```

## 监控和维护

### 查看日志

```bash
# 查看 fetcher-isports 日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 50

# 查看定时抓取日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetch-daemon --lines 50

# 查看皇冠抓取日志
tail -f /tmp/crown-fetch.log
```

### 检查数据文件

```bash
# 检查 crown-gids.json
ls -lh /www/wwwroot/aibcbot.top/backend/crown-gids.json
cat /www/wwwroot/aibcbot.top/backend/crown-gids.json | jq '.matchCount'

# 检查 latest-matches.json
ls -lh /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | jq '.matchCount'

# 统计数据源分布
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | \
  jq '.matches | group_by(.source) | map({source: .[0].source, count: length})'
```

### 运行测试

```bash
# 定期运行测试脚本
cd /www/wwwroot/aibcbot.top/backend
npm run test:data-source
```

## 故障排查

### 问题 1: 前端没有显示数据来源标记

**原因**: 前端代码未更新或未重新编译

**解决**:
```bash
cd /www/wwwroot/aibcbot.top/frontend
npm run build
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-frontend
```

### 问题 2: 皇冠独有比赛没有显示

**原因**: 
1. crown-gids.json 未生成或过期
2. fetcher-isports 未重启

**解决**:
```bash
# 重新抓取皇冠数据
cd /www/wwwroot/aibcbot.top/backend
npm run crown:fetch-gids

# 重启 fetcher-isports
cd /www/wwwroot/aibcbot.top/fetcher-isports
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports

# 等待 1-2 分钟后检查
npm run test:data-source
```

### 问题 3: 皇冠独有比赛无法下注

**原因**: crown_gid 字段缺失

**解决**:
```bash
# 检查数据
cd /www/wwwroot/aibcbot.top/backend
npm run test:data-source

# 如果显示有比赛缺少 crown_gid，检查 convertCrownOnlyMatch 函数
# 确保正确设置了 crown_gid 字段
```

### 问题 4: 数据源标记显示错误

**原因**: source 字段未正确设置

**解决**:
```bash
# 检查 latest-matches.json
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | \
  jq '.matches[0] | {gid, source, crown_gid, league, home, away}'

# 如果 source 字段为空或错误，检查 fetcher-isports/src/index.ts
# 确保 generateOutput 函数正确设置了 source 字段
```

## 回滚方案

如果新功能出现问题,可以快速回滚:

```bash
# 1. 恢复旧版本代码
cd /www/wwwroot/aibcbot.top
git checkout <previous-commit-hash>

# 2. 重新编译
cd fetcher-isports && npm run build
cd ../frontend && npm run build

# 3. 重启服务
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-frontend
```

## 性能优化建议

1. **减少皇冠抓取频率**: 如果服务器负载高,可以将抓取间隔从 10 分钟改为 15-20 分钟

2. **缓存皇冠数据**: 考虑将 crown-gids.json 缓存到 Redis,减少文件 I/O

3. **异步处理**: 将皇冠数据转换放到后台队列处理

4. **数据压缩**: 对 latest-matches.json 进行 gzip 压缩,减少传输大小

## 联系支持

如有问题,请联系技术支持或查看相关文档:
- 技术文档: `/docs/crown-isports-data-source-integration.md`
- 测试脚本: `npm run test:data-source`

