import dotenv from 'dotenv';
// 加载环境变量
dotenv.config();

import express from 'express';
import cors from 'cors';
import { authRoutes } from './routes/auth';
import { staffRoutes } from './routes/staff';
import { agentRoutes } from './routes/agents';
import { crownAutomationRoutes } from './routes/crown-automation';
import { accountRoutes } from './routes/accounts';
import accountSharesRoutes from './routes/account-shares';
import { groupRoutes } from './routes/groups';
import { matchRoutes } from './routes/matches';
import { betRoutes } from './routes/bets';
import { coinRoutes } from './routes/coins';
import crownSitesRoutes from './routes/crown-sites';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { getCrownAutomation } from './services/crown-automation';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://yourdomain.com']
        : [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:10086',
            'http://localhost:10087',
            'http://127.0.0.1:10087'
        ],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/crown-automation', crownAutomationRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/account-shares', accountSharesRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/crown-sites', crownSitesRoutes);

// 错误处理中间件
app.use(errorHandler);

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
});

export { app };

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 智投后端服务启动成功！`);
    console.log(`📍 服务地址: http://localhost:${PORT}`);
    console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);

    // 初始化 Crown 自动化服务（纯API版本）
    const automation = getCrownAutomation();
    automation.initSystemAccount().catch((error) => {
        console.error('❌ 初始化系统账号失败:', error);
    });

    // 启动下注结算定时任务（每24小时执行一次）
    const { getBetSettlementScheduler } = require('./services/bet-settlement-scheduler');
    const scheduler = getBetSettlementScheduler();
    scheduler.start(24 * 60); // 24小时间隔（1440分钟）
});
