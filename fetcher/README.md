# 皇冠赛事抓取服务

独立的赛事抓取服务，与主程序完全分离。

## 特点

- ✅ **独立运行**：不依赖主程序，单独的 PM2 进程
- ✅ **会话持久化**：登录后保存会话，重启不需要重新登录
- ✅ **自动重连**：会话过期自动重新登录
- ✅ **数据持久化**：抓取的数据保存到文件，主程序可以读取
- ✅ **避免频繁登录**：减少账号被锁风险

## 安装

```bash
cd fetcher
npm install
npm run build
```

## 配置

复制 `.env.example` 为 `.env` 并修改：

```bash
cp .env.example .env
nano .env
```

配置项：
- `CROWN_USERNAME`: 皇冠账号
- `CROWN_PASSWORD`: 皇冠密码
- `CROWN_BASE_URL`: 皇冠站点地址
- `FETCH_INTERVAL`: 抓取间隔（毫秒），默认 1000
- `SESSION_CHECK_INTERVAL`: 会话检查间隔（毫秒），默认 300000（5分钟）
- `DATA_DIR`: 数据存储目录，默认 ./data

## 启动

### 开发模式
```bash
npm run dev
```

### 生产模式
```bash
# 使用 PM2 启动
pm2 start ecosystem.config.js

# 查看日志
pm2 logs crown-fetcher

# 查看状态
pm2 status

# 停止
pm2 stop crown-fetcher

# 重启
pm2 restart crown-fetcher
```

## 数据文件

抓取的数据保存在 `data/latest-matches.json`：

```json
{
  "timestamp": 1234567890,
  "matches": [...],
  "matchCount": 27
}
```

主程序可以读取这个文件获取最新的赛事数据。

## 会话管理

- 登录后会话保存在 `data/session.json`
- 会话有效期 2 小时
- 每 5 分钟检查一次会话有效性
- 会话失效自动重新登录
- 重启服务会尝试加载已保存的会话

## 监控

服务每分钟打印一次统计信息：
- 运行时长
- 总抓取次数
- 成功/失败次数
- 成功率
- 登录次数
- 最新比赛数

## 日志

PM2 日志位置：
- 输出日志：`logs/out.log`
- 错误日志：`logs/error.log`

