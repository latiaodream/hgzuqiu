import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../models/database';
import { LoginRequest, UserCreateRequest, ApiResponse, LoginResponse, User } from '../types';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 用户注册
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, role, parent_id }: UserCreateRequest = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名、邮箱和密码不能为空'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: '密码长度至少6位'
            });
        }

        // 默认角色为 staff
        const userRole = role || 'staff';

        // 验证角色有效性
        if (!['admin', 'agent', 'staff'].includes(userRole)) {
            return res.status(400).json({
                success: false,
                error: '无效的角色'
            });
        }

        // 检查用户是否已存在
        const existingUser = await query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: '用户名或邮箱已存在'
            });
        }

        // 如果有 parent_id，验证上级用户存在
        if (parent_id) {
            const parentUser = await query(
                'SELECT id, role FROM users WHERE id = $1',
                [parent_id]
            );

            if (parentUser.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '上级用户不存在'
                });
            }

            // 只有代理可以创建员工
            if (userRole === 'staff' && parentUser.rows[0].role !== 'agent') {
                return res.status(400).json({
                    success: false,
                    error: '只有代理可以创建员工账号'
                });
            }
        }

        // 加密密码
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 计算 agent_id
        let agentId = null;
        if (userRole === 'staff' && parent_id) {
            const parentUser = await query(
                'SELECT id, role FROM users WHERE id = $1',
                [parent_id]
            );
            if (parentUser.rows[0].role === 'agent') {
                agentId = parent_id;
            }
        }

        // 创建用户
        const result = await query(
            'INSERT INTO users (username, email, password_hash, role, parent_id, agent_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role, parent_id, agent_id, created_at, updated_at',
            [username, email, passwordHash, userRole, parent_id || null, agentId]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    parent_id: user.parent_id,
                    agent_id: user.agent_id
                }
            },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        // 只为员工创建默认分组
        if (userRole === 'staff') {
            await query(
                'INSERT INTO groups (user_id, name, description) VALUES ($1, $2, $3)',
                [user.id, '默认分组', '系统自动创建的默认分组']
            );
        }

        res.status(201).json({
            success: true,
            data: {
                user,
                token
            },
            message: '注册成功'
        } as ApiResponse<LoginResponse>);

    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({
            success: false,
            error: '注册失败'
        });
    }
});

// 用户登录
router.post('/login', async (req, res) => {
    const safeBody = { ...req.body } as any;
    if (typeof safeBody?.password === 'string') safeBody.password = '***';
    console.log('🔐 登录请求开始，请求体:', safeBody);
    try {
        const { username, password }: LoginRequest = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }

        // 查找用户
        const result = await query(
            'SELECT id, username, email, password_hash, role, parent_id, agent_id, created_at, updated_at FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }

        const user = result.rows[0];

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }

        // 生成JWT令牌，包含角色信息
        const token = jwt.sign(
            {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    parent_id: user.parent_id,
                    agent_id: user.agent_id
                }
            },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        // 创建返回的用户对象（不包含password_hash）
        const userResponse = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            parent_id: user.parent_id,
            agent_id: user.agent_id,
            created_at: user.created_at,
            updated_at: user.updated_at
        };

        res.json({
            success: true,
            data: { user: userResponse, token },
            message: '登录成功'
        } as ApiResponse<LoginResponse>);

    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({
            success: false,
            error: '登录失败'
        });
    }
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req: any, res) => {
    try {
        const userId = req.user.id;

        const result = await query(
            'SELECT id, username, email, role, parent_id, agent_id, created_at, updated_at FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        } as ApiResponse<User>);

    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({
            success: false,
            error: '获取用户信息失败'
        });
    }
});

// 修改密码
router.post('/change-password', authenticateToken, async (req: any, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: '旧密码和新密码不能为空'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: '新密码长度至少6位'
            });
        }

        // 获取用户当前密码
        const userResult = await query(
            'SELECT password_hash FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        // 验证旧密码
        const isValidPassword = await bcrypt.compare(oldPassword, userResult.rows[0].password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: '旧密码错误'
            });
        }

        // 加密新密码
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // 更新密码
        await query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, userId]
        );

        console.log(`✅ 用户 ${req.user.username} (ID: ${userId}) 修改密码成功`);

        res.json({
            success: true,
            message: '密码修改成功，请重新登录'
        });

    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({
            success: false,
            error: '修改密码失败'
        });
    }
});

export { router as authRoutes };
