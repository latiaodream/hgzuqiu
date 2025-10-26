import axios from 'axios';
import type { AccountShare, ShareableUser } from '../types';

// 使用与主 API 相同的 baseURL 逻辑
const resolveBaseURL = (): string => {
  if (import.meta.env.VITE_API_URL && String(import.meta.env.VITE_API_URL).trim().length > 0) {
    return import.meta.env.VITE_API_URL;
  }

  // 本地开发时默认走同源代理，避免直接命中前端 dev server 返回 404
  if (import.meta.env.DEV) {
    return '/api';
  }

  return 'http://localhost:3001/api';
};

const api = axios.create({
  baseURL: resolveBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const accountShareApi = {
  /**
   * 分享账号给其他用户
   */
  shareAccount: async (accountId: number, sharedToUserIds: number[]) => {
    const response = await api.post('/account-shares/share', {
      account_id: accountId,
      shared_to_user_ids: sharedToUserIds,
    });
    return response.data;
  },

  /**
   * 取消分享
   */
  unshareAccount: async (accountId: number, sharedToUserIds: number[]) => {
    const response = await api.post('/account-shares/unshare', {
      account_id: accountId,
      shared_to_user_ids: sharedToUserIds,
    });
    return response.data;
  },

  /**
   * 获取账号的共享列表
   */
  getAccountShares: async (accountId: number): Promise<{ success: boolean; shares: AccountShare[] }> => {
    const response = await api.get(`/account-shares/${accountId}/shares`);
    return response.data;
  },

  /**
   * 获取可以分享的用户列表
   */
  getAvailableUsers: async (accountId: number): Promise<{ success: boolean; users: ShareableUser[] }> => {
    const response = await api.get(`/account-shares/${accountId}/available-users`);
    return response.data;
  },
};
