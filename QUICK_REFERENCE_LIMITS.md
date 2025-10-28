# 限额功能快速参考

## 🚀 快速开始

### 用户操作

#### 新增账号（自动获取）
```
1. 点击"添加账号"
2. 填写信息
3. 点击"确定"
4. ✅ 系统自动获取限额
```

#### 编辑账号（手动获取）
```
1. 点击"编辑"
2. 切换到"限额设置"
3. 点击"获取限额"
4. ✅ 自动填充表单
```

## 📋 API 参考

### 获取限额

**端点**: `POST /api/crown-automation/fetch-limits/:accountId`

**请求**:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/crown-automation/fetch-limits/1
```

**响应**:
```json
{
  "success": true,
  "data": {
    "football": {
      "prematch": 200000,
      "live": 200000
    },
    "basketball": {
      "prematch": 200000,
      "live": 200000
    }
  }
}
```

## 🧪 测试命令

### 后端测试
```bash
cd backend
npm run build
node backend/test-fetch-limits.js
```

### 启动服务
```bash
# 后端
cd backend && npm run dev

# 前端
cd frontend && npm run dev
```

## 📁 关键文件

### 后端
- `backend/src/routes/crown-automation.ts` - API 路由
- `backend/src/services/crown-automation.ts` - 核心逻辑
- `backend/src/services/crown-api-client.ts` - HTTP 客户端

### 前端
- `frontend/src/components/Accounts/AccountFormModal.tsx` - UI 组件
- `frontend/src/services/api.ts` - API 调用

## 🔍 调试

### 查看日志
```bash
# 后端日志
tail -f backend/logs/app.log

# 前端控制台
打开浏览器 F12 -> Console
```

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 登录失败 | 账号密码错误 | 检查账号密码 |
| 网络错误 | 无法访问皇冠 | 检查网络连接 |
| 解析失败 | 页面结构变化 | 更新解析逻辑 |

## 📊 数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `football_prematch_limit` | DECIMAL | 足球赛前限额 |
| `football_live_limit` | DECIMAL | 足球滚球限额 |
| `basketball_prematch_limit` | DECIMAL | 篮球赛前限额 |
| `basketball_live_limit` | DECIMAL | 篮球滚球限额 |

## 💡 提示

### 最佳实践
✅ 新增账号时让系统自动获取
✅ 定期手动更新限额
✅ 获取失败时检查账号密码
✅ 保持网络连接稳定

### 注意事项
⚠️ 获取需要 3-5 秒
⚠️ 需要正确的账号密码
⚠️ 失败不影响账号创建
⚠️ 可以手动输入限额

## 📚 文档链接

- [详细功能文档](docs/fetch-limits-feature.md)
- [实现文档](FETCH_LIMITS_IMPLEMENTATION.md)
- [测试指南](TEST_FETCH_LIMITS.md)
- [完整总结](LIMITS_FEATURE_SUMMARY.md)
- [变更日志](CHANGELOG_LIMITS_FEATURE.md)

## 🎯 核心代码片段

### 前端调用
```typescript
// 自动获取（新增账号后）
const limitsResponse = await accountApi.fetchLimits(accountId);

// 手动获取（编辑账号时）
const handleFetchLimits = async () => {
  const limitsResponse = await accountApi.fetchLimits(account.id);
  if (limitsResponse.success) {
    form.setFieldsValue({
      football_prematch_limit: limitsResponse.data.football.prematch,
      football_live_limit: limitsResponse.data.football.live,
      basketball_prematch_limit: limitsResponse.data.basketball.prematch,
      basketball_live_limit: limitsResponse.data.basketball.live,
    });
  }
};
```

### 后端处理
```typescript
// 获取限额
const result = await getCrownAutomation().fetchAccountLimits(account);

// 更新数据库
await pool.query(
  `UPDATE crown_accounts 
   SET football_prematch_limit = $1,
       football_live_limit = $2,
       basketball_prematch_limit = $3,
       basketball_live_limit = $4
   WHERE id = $5`,
  [
    result.limits.football.prematch,
    result.limits.football.live,
    result.limits.basketball.prematch,
    result.limits.basketball.live,
    accountId
  ]
);
```

## 🔧 故障排除

### 问题: 自动获取没有触发

**检查清单**:
- [ ] 前端代码是否最新
- [ ] 后端服务是否运行
- [ ] 浏览器控制台是否有错误
- [ ] 网络请求是否成功

**解决步骤**:
```bash
# 1. 重新编译
cd backend && npm run build

# 2. 重启服务
pm2 restart all

# 3. 清除浏览器缓存
Ctrl+Shift+R (硬刷新)
```

### 问题: 限额获取失败

**检查清单**:
- [ ] 账号密码是否正确
- [ ] 皇冠网站是否可访问
- [ ] 网络连接是否正常
- [ ] 后端日志中的错误信息

**解决步骤**:
```bash
# 1. 测试登录
node backend/test-fetch-limits.js

# 2. 检查网络
curl https://hga038.com

# 3. 查看日志
tail -f backend/logs/app.log
```

## 📞 支持

如有问题，请查看：
1. 本文档的故障排除部分
2. 详细文档 `docs/fetch-limits-feature.md`
3. 测试指南 `TEST_FETCH_LIMITS.md`

---

**最后更新**: 2025-10-28
**版本**: 1.0.0
**状态**: ✅ 生产就绪

