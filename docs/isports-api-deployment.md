# iSportsAPI 集成部署指南

## 📋 概述

使用 iSportsAPI 替代皇冠 API，彻底解决账号被封问题。

### 优势对比

| 项目 | 皇冠 API（当前） | iSportsAPI（新方案） |
|------|-----------------|---------------------|
| 稳定性 | ❌ 账号容易被封 | ✅ 专业服务，稳定可靠 |
| 维护成本 | ❌ 高（需处理登录、封号等） | ✅ 低（API 调用即可） |
| 数据覆盖 | ✅ 皇冠赔率 | ✅ 皇冠 + 17 家其他公司 |
| 实时性 | ✅ 实时 | ✅ 赛前 20 秒，滚球实时 |
| 成本 | ✅ 免费 | ❌ $449/月 |
| 数据格式 | ✅ 原生格式 | ✅ 可转换为兼容格式 |

## 🎯 工作原理

### 数据更新机制

1. **首次启动**：获取完整的赛前和滚球赔率数据（`/odds/main`）
2. **定期完整更新**：每 60 秒获取一次完整数据
3. **实时增量更新**：每 2 秒获取过去 20 秒内变化的赔率（`/odds/main/changes`）
4. **合并数据**：将变化的赔率更新到缓存中

### 更新频率说明

- **赛前赔率**：每 20 秒自动更新（由 iSportsAPI 保证）
- **滚球赔率**：实时更新（通过 `/odds/main/changes` 接口）
- **完整刷新**：每 60 秒获取一次完整数据（防止遗漏）

## 🚀 部署步骤

### 1. 安装依赖

```bash
cd /www/wwwroot/aibcbot.top/fetcher-isports
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件：

```env
ISPORTS_API_KEY=GvpziueL9ouzIJNj
DATA_DIR=./data
FULL_FETCH_INTERVAL=60000  # 完整更新间隔（毫秒）
CHANGES_INTERVAL=2000      # 实时更新间隔（毫秒）
```

### 3. 使用 PM2 启动服务

```bash
# 进入目录
cd /www/wwwroot/aibcbot.top/fetcher-isports

# 启动服务
/www/server/nodejs/v22.18.0/bin/pm2 start src/index.ts \
  --name crown-fetcher-isports \
  --interpreter /www/server/nodejs/v22.18.0/bin/ts-node

# 查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports

# 查看状态
/www/server/nodejs/v22.18.0/bin/pm2 status

# 设置开机自启
/www/server/nodejs/v22.18.0/bin/pm2 save
/www/server/nodejs/v22.18.0/bin/pm2 startup
```

### 4. 修改后端读取路径

修改 `backend/src/routes/matches.ts`，将数据读取路径从：

```typescript
const dataPath = path.join(__dirname, '../../../fetcher/data/latest-matches.json');
```

改为：

```typescript
const dataPath = path.join(__dirname, '../../../fetcher-isports/data/latest-matches.json');
```

### 5. 重启后端服务

```bash
cd /www/wwwroot/aibcbot.top/backend
/www/server/nodejs/v22.18.0/bin/pm2 restart bclogin-backend
```

### 6. 验证数据

访问前端页面，检查：
- ✅ 比赛列表是否正常显示
- ✅ 赔率数据是否正确
- ✅ 实时更新是否正常

## 📊 测试结果

### 服务状态
- ✅ 成功启动
- ✅ 获取到 264 场比赛
- ✅ 获取到 731 条皇冠赔率（让球、独赢、大小球各 731 条）
- ✅ 保存了 112 场有赔率的比赛数据
- ✅ 实时更新正常工作（每 2 秒检测赔率变化）

### 数据格式示例

```json
{
  "gid": "446688822",
  "league": "Turkey Cup",
  "team_h": "Erokspor",
  "team_c": "Agri 1970 Spor",
  "timer": "2025-10-30T10:00:00.000Z",
  "ratio": "1.5",
  "ratio_o": "1.00",
  "ratio_u": "0.70",
  "ior_RH": "1.34",
  "ior_RN": "4.55",
  "ior_RC": "5.40",
  "ratio_uo": "3.25",
  "ratio_uo_o": "0.85",
  "ratio_uo_u": "0.85",
  "ratio_h": "0.5",
  "ratio_ho": "0.89",
  "ratio_hu": "0.81",
  "more": 1,
  "strong": "H"
}
```

## 🔧 常用命令

### PM2 管理

```bash
# 查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports

# 查看实时日志（最后 100 行）
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --lines 100

# 停止服务
/www/server/nodejs/v22.18.0/bin/pm2 stop crown-fetcher-isports

# 重启服务
/www/server/nodejs/v22.18.0/bin/pm2 restart crown-fetcher-isports

# 删除服务
/www/server/nodejs/v22.18.0/bin/pm2 delete crown-fetcher-isports

# 查看服务状态
/www/server/nodejs/v22.18.0/bin/pm2 status
```

### 数据检查

```bash
# 查看数据文件
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | head -50

# 查看数据文件大小
ls -lh /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json

# 统计比赛数量
cat /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json | jq '. | length'
```

## 💰 成本分析

### 免费试用期（15 天）
- **每天调用次数**：200 次
- **完整更新**：60 秒/次 = 1440 次/天（超出限制）
- **实时更新**：2 秒/次 = 43200 次/天（超出限制）

**建议**：免费试用期间，调整更新频率：
- 完整更新：5 分钟/次 = 288 次/天
- 实时更新：10 秒/次 = 8640 次/天
- 总计：约 8928 次/天（远超 200 次限制）

**结论**：免费试用仅适合测试，无法满足生产环境需求。

### 付费订阅（$449/月）
- **无调用次数限制**
- **推荐调用频率**：
  - 完整更新：1 分钟/次
  - 实时更新：2 秒/次

### ROI 评估

如果你的系统每月产生的价值 > $449，建议付费订阅。

## 🎯 下一步

1. **测试阶段**（当前）：
   - ✅ 使用免费试用测试数据质量
   - ✅ 验证系统兼容性
   - ✅ 评估实时性和准确性

2. **决策阶段**（免费试用结束前）：
   - 评估数据质量是否满足需求
   - 计算 ROI，决定是否付费订阅
   - 如果不订阅，继续使用皇冠 API（需解决账号被封问题）

3. **生产部署**（付费订阅后）：
   - 完全替换皇冠 API
   - 停止原有的 `crown-fetcher` 服务
   - 监控数据质量和系统稳定性

## 📝 注意事项

1. **免费试用限制**：每天 200 次调用，无法满足生产环境需求
2. **数据格式兼容**：已完全兼容原皇冠 API 格式，前端和后端无需修改
3. **实时性**：赛前赔率 20 秒更新，滚球赔率实时更新（通过 changes 接口）
4. **成本**：$449/月，需评估 ROI
5. **备份方案**：保留原有的 `crown-fetcher` 服务作为备份

## 🆘 故障排查

### 问题 1：服务无法启动

```bash
# 查看错误日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports --err

# 检查 Node.js 版本
node --version

# 检查 ts-node 是否安装
npm list ts-node
```

### 问题 2：数据未更新

```bash
# 查看日志
/www/server/nodejs/v22.18.0/bin/pm2 logs crown-fetcher-isports

# 检查数据文件修改时间
ls -l /www/wwwroot/aibcbot.top/fetcher-isports/data/latest-matches.json

# 手动测试 API
curl "http://api.isportsapi.com/sport/football/odds/main?api_key=GvpziueL9ouzIJNj&companyId=3"
```

### 问题 3：API 调用失败

```bash
# 检查 API Key 是否正确
cat /www/wwwroot/aibcbot.top/fetcher-isports/.env

# 检查网络连接
curl "http://api.isportsapi.com/sport/football/schedule/basic?api_key=GvpziueL9ouzIJNj&date=$(date +%Y-%m-%d)"

# 检查免费试用是否过期
# 登录 https://www.isportsapi.com/ 查看账户状态
```

## 📞 技术支持

如有问题，请联系 iSportsAPI 客服：
- WhatsApp: Kimi / Raymond
- 网站: https://www.isportsapi.com/

