import { Router, Request, Response } from 'express';
import { query } from '../models/database';
import { authenticateToken } from '../middleware/auth';
import { AccountShareRequest, AccountShareResponse } from '../types';

const router = Router();

/**
 * 分享账号给其他用户
 */
router.post('/share', authenticateToken, async (req: Request, res: Response) => {
  const { account_id, shared_to_user_ids } = req.body as AccountShareRequest;
  const userId = (req as any).user.id;

  try {
    // 验证账号是否属于当前用户
    const accountResult = await query(
      'SELECT id, user_id, username FROM crown_accounts WHERE id = $1',
      [account_id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const account = accountResult.rows[0];
    if (account.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权分享此账号' });
    }

    // 批量插入共享记录（使用 ON CONFLICT DO NOTHING 避免重复）
    const shares = [];
    for (const sharedToUserId of shared_to_user_ids) {
      // 不能分享给自己
      if (sharedToUserId === userId) {
        continue;
      }

      const result = await query(
        `INSERT INTO account_shares (account_id, owner_user_id, shared_to_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_id, shared_to_user_id) DO NOTHING
         RETURNING *`,
        [account_id, userId, sharedToUserId]
      );

      if (result.rows.length > 0) {
        shares.push(result.rows[0]);
      }
    }

    // 更新账号的 share_count
    await query(
      `UPDATE crown_accounts
       SET share_count = (SELECT COUNT(*) FROM account_shares WHERE account_id = $1)
       WHERE id = $1`,
      [account_id]
    );

    res.json({
      success: true,
      message: `成功分享给 ${shares.length} 个用户`,
      shares,
    } as AccountShareResponse);
  } catch (error) {
    console.error('分享账号失败:', error);
    res.status(500).json({ success: false, message: '分享账号失败' });
  }
});

/**
 * 取消分享（批量）
 */
router.post('/unshare', authenticateToken, async (req: Request, res: Response) => {
  const { account_id, shared_to_user_ids } = req.body;
  const userId = (req as any).user.id;

  try {
    // 验证账号是否属于当前用户
    const accountResult = await query(
      'SELECT id, user_id FROM crown_accounts WHERE id = $1',
      [account_id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const account = accountResult.rows[0];
    if (account.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权操作此账号' });
    }

    // 删除共享记录
    const result = await query(
      `DELETE FROM account_shares
       WHERE account_id = $1 AND owner_user_id = $2 AND shared_to_user_id = ANY($3)
       RETURNING *`,
      [account_id, userId, shared_to_user_ids]
    );

    // 更新账号的 share_count
    await query(
      `UPDATE crown_accounts
       SET share_count = (SELECT COUNT(*) FROM account_shares WHERE account_id = $1)
       WHERE id = $1`,
      [account_id]
    );

    res.json({
      success: true,
      message: `成功取消 ${result.rows.length} 个共享`,
    } as AccountShareResponse);
  } catch (error) {
    console.error('取消分享失败:', error);
    res.status(500).json({ success: false, message: '取消分享失败' });
  }
});

/**
 * 获取账号的共享列表
 */
router.get('/:accountId/shares', authenticateToken, async (req: Request, res: Response) => {
  const { accountId } = req.params;
  const userId = (req as any).user.id;

  try {
    // 验证账号是否属于当前用户
    const accountResult = await query(
      'SELECT id, user_id FROM crown_accounts WHERE id = $1',
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const account = accountResult.rows[0];
    if (account.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权查看此账号的共享信息' });
    }

    // 获取共享列表
    const result = await query(
      `SELECT
        s.*,
        u.username as shared_to_username,
        u.email as shared_to_email
       FROM account_shares s
       LEFT JOIN users u ON s.shared_to_user_id = u.id
       WHERE s.account_id = $1 AND s.owner_user_id = $2
       ORDER BY s.created_at DESC`,
      [accountId, userId]
    );

    res.json({
      success: true,
      shares: result.rows,
    });
  } catch (error) {
    console.error('获取共享列表失败:', error);
    res.status(500).json({ success: false, message: '获取共享列表失败' });
  }
});

/**
 * 获取可以分享的用户列表（排除已分享的）
 */
router.get('/:accountId/available-users', authenticateToken, async (req: Request, res: Response) => {
  const { accountId } = req.params;
  const userId = (req as any).user.id;

  try {
    // 验证账号是否属于当前用户
    const accountResult = await query(
      'SELECT id, user_id FROM crown_accounts WHERE id = $1',
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }

    const account = accountResult.rows[0];
    if (account.user_id !== userId) {
      return res.status(403).json({ success: false, message: '无权操作此账号' });
    }

    // 获取所有员工用户，排除自己和已分享的用户
    const result = await query(
      `SELECT u.id, u.username, u.email, u.role
       FROM users u
       WHERE u.id != $1
       AND u.role = 'staff'
       AND u.id NOT IN (
         SELECT shared_to_user_id
         FROM account_shares
         WHERE account_id = $2 AND owner_user_id = $1
       )
       ORDER BY u.username`,
      [userId, accountId]
    );

    res.json({
      success: true,
      users: result.rows,
    });
  } catch (error) {
    console.error('获取可分享用户列表失败:', error);
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

export default router;
