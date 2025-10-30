# iSportsAPI 独立抓取服务

使用 iSportsAPI 替代皇冠 API，避免账号被封问题。

## 工作原理

1. **首次启动**：获取完整的赛前和滚球赔率数据（`/odds/main`）
2. **定期完整更新**：每 60 秒获取一次完整数据
3. **实时增量更新**：每 2 秒获取过去 20 秒内变化的赔率（`/odds/main/changes`）
4. **合并数据**：将变化的赔率更新到缓存中

## 优势

- ✅ **稳定可靠**：专业的数据服务商，不会被封账号
- ✅ **实时更新**：赛前赔率 20 秒更新，滚球赔率实时更新
- ✅ **数据准确**：直接从皇冠获取数据
- ✅ **无缝替换**：输出格式与原皇冠 API 完全兼容

## 安装

```bash
cd fetcher-isports
npm install
```

## 配置

编辑 `.env` 文件：

```env
ISPORTS_API_KEY=GvpziueL9ouzIJNj
DATA_DIR=./data
FULL_FETCH_INTERVAL=60000  # 完整更新间隔（毫秒）
CHANGES_INTERVAL=2000      # 实时更新间隔（毫秒）
```

## 运行

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 使用 PM2 管理

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start src/index.ts --name crown-fetcher-isports --interpreter ts-node

# 查看日志
pm2 logs crown-fetcher-isports

# 停止服务
pm2 stop crown-fetcher-isports

# 重启服务
pm2 restart crown-fetcher-isports
```

## 输出数据

数据保存在 `data/latest-matches.json`，格式与原皇冠 API 完全兼容：

```json
[
  {
    "gid": "446688822",
    "league": "Turkey Cup",
    "team_h": "Erokspor",
    "team_c": "Agri 1970 Spor",
    "timer": "2025-10-30T10:00:00.000Z",
    "ratio": "1.5",
    "ratio_o": "0.69",
    "ratio_u": "1.01",
    "ior_RH": "1.22",
    "ior_RN": "5.20",
    "ior_RC": "7.20",
    "ratio_uo": "3.25",
    "ratio_uo_o": "0.78",
    "ratio_uo_u": "0.92",
    "more": 1,
    "strong": "H"
  }
]
```

## 集成到现有系统

只需修改后端读取数据的路径，从原来的 `fetcher/data/latest-matches.json` 改为 `fetcher-isports/data/latest-matches.json`。

前端和后端无需任何修改！

