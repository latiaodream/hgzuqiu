import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  message,
  Typography,
  Row,
  Col,
  Select,
  Input,
  Divider,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { CrownAccount, Group } from '../types';
import { accountApi, groupApi, crownApi } from '../services/api';
import { generateAccountUsername, generateAccountPassword } from '../utils/credentials';
import AccountFormModal from '../components/Accounts/AccountFormModal';
import AccountDetailModal from '../components/Accounts/AccountDetailModal';
import AccountCard from '../components/Accounts/AccountCard';
import AccountInitializeModal from '../components/Accounts/AccountInitializeModal';
import type { AxiosError } from 'axios';

const { Title, Text } = Typography;
const INIT_CREDENTIAL_STORAGE_KEY = 'crown_init_credentials';
const { Search } = Input;

const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | undefined>();
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 模态框状态
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CrownAccount | null>(null);
  const [viewingAccount, setViewingAccount] = useState<CrownAccount | null>(null);
  const [initializeModalVisible, setInitializeModalVisible] = useState(false);
  const [initializingAccount, setInitializingAccount] = useState<CrownAccount | null>(null);
  const [initializeCredentials, setInitializeCredentials] = useState<Record<number, { username: string; password: string }>>(() => {
    try {
      const raw = localStorage.getItem(INIT_CREDENTIAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<number, { username: string; password: string }>;
        }
      }
    } catch (storageError) {
      console.warn('无法从本地存储读取初始化凭证缓存:', storageError);
    }
    return {};
  });

  const syncInitializeCredentials = useCallback((updater: (prev: Record<number, { username: string; password: string }>) => Record<number, { username: string; password: string }>) => {
    setInitializeCredentials((prev) => {
      const next = updater(prev);
      try {
        const keys = Object.keys(next);
        if (keys.length > 0) {
          localStorage.setItem(INIT_CREDENTIAL_STORAGE_KEY, JSON.stringify(next));
        } else {
          localStorage.removeItem(INIT_CREDENTIAL_STORAGE_KEY);
        }
      } catch (storageError) {
        console.warn('无法写入初始化凭证缓存:', storageError);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    loadGroups();
    loadAccounts();
  }, [selectedGroup]);

  const loadGroups = async () => {
    try {
      const response = await groupApi.getGroups();
      if (response.success && response.data) {
        setGroups(response.data);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);

      const [accountResponse, statusResponse] = await Promise.all([
        accountApi.getAccounts(selectedGroup),
        crownApi.getStatus().catch((error) => {
          console.warn('Failed to load automation status:', error);
          return undefined;
        }),
      ]);

      const onlineMap: Record<number, boolean> = {};
      if (statusResponse?.success && statusResponse.data) {
        const statusData = statusResponse.data as {
          accounts?: Array<{ id: number; online?: boolean }>;
        };
        statusData.accounts?.forEach(({ id, online }) => {
          onlineMap[id] = !!online;
        });
      }

      if (accountResponse.success && accountResponse.data) {
        const enriched = accountResponse.data.map((account) => ({
          ...account,
          is_online: onlineMap[account.id] ?? account.is_online ?? false,
        }));
        setAccounts(enriched);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
      message.error('加载账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    setEditingAccount(null);
    setFormModalVisible(true);
  };

  const handleEditAccount = (account: CrownAccount) => {
    setEditingAccount(account);
    setFormModalVisible(true);
  };

  const handleViewAccount = (account: CrownAccount) => {
    setViewingAccount(account);
    setDetailModalVisible(true);
  };

  const getOrCreateInitializeCredentials = (account: CrownAccount) => {
    const existing = initializeCredentials[account.id];
    if (existing) {
      return existing;
    }
    const created = {
      username: generateAccountUsername(),
      password: generateAccountPassword(),
    };
    syncInitializeCredentials((prev) => {
      if (prev[account.id]) {
        return prev;
      }
      return {
        ...prev,
        [account.id]: created,
      };
    });
    return created;
  };

  const handleInitializeAccount = (account: CrownAccount) => {
    getOrCreateInitializeCredentials(account);
    setInitializingAccount(account);
    setInitializeModalVisible(true);
  };

  const handleInitializeCredentialsChange = (accountId: number, values: Partial<{ username: string; password: string }>) => {
    if (!values.username && !values.password) {
      return;
    }
    syncInitializeCredentials((prev) => {
      const current = prev[accountId] ?? {
        username: values.username ?? generateAccountUsername(),
        password: values.password ?? generateAccountPassword(),
      };
      return {
        ...prev,
        [accountId]: {
          ...current,
          ...values,
        },
      };
    });
  };

  const handleInitializeCredentialRegenerate = (accountId: number, field: 'username' | 'password') => {
    syncInitializeCredentials((prev) => {
      const current = prev[accountId] ?? {
        username: generateAccountUsername(),
        password: generateAccountPassword(),
      };
      const nextValue = field === 'username' ? generateAccountUsername() : generateAccountPassword();
      return {
        ...prev,
        [accountId]: {
          ...current,
          [field]: nextValue,
        },
      };
    });
  };

  const handleInitializeConfirm = async ({ username, password }: { username: string; password: string }) => {
    if (!initializingAccount) {
      const error = new Error('未找到需要初始化的账号');
      message.error(error.message);
      throw error;
    }

    const key = `initialize-${initializingAccount.id}`;
    message.loading({
      content: `正在初始化账号 ${initializingAccount.username} ...\n请稍候，过程可能需要 1-2 分钟。`,
      key,
      duration: 0,
    });

    try {
      // 使用纯 API 方式初始化（推荐）
      console.log('🚀 调用纯 API 初始化，账号ID:', initializingAccount.id);
      const response = await crownApi.initializeAccountWithApi(initializingAccount.id, { username, password });
      console.log('📥 初始化响应:', response);

      if (!response.success) {
        throw new Error(response.error || '初始化账号失败');
      }

      let accountForLogin: CrownAccount | null = null;
      if (response.data) {
        const updatedUsername = response.data?.username?.trim?.() || response.data?.username || initializingAccount.username;
        const originalUsername = initializingAccount.original_username || initializingAccount.username;
        const updatedPassword = response.data?.password ?? initializingAccount.password;

        accountForLogin = {
          ...initializingAccount,
          username: updatedUsername,
          original_username: originalUsername,
          initialized_username: updatedUsername,
          password: updatedPassword,
        };

        setAccounts((prev) => prev.map((account) => {
          if (!initializingAccount || account.id !== initializingAccount.id) {
            return account;
          }

          return {
            ...account,
            username: updatedUsername,
            original_username: originalUsername,
            initialized_username: updatedUsername,
            password: updatedPassword,
          };
        }));
      }

      const successContent = (
        <div>
          <strong>{response.message || '账号初始化完成'}</strong>
          {response.data?.username && response.data?.password && (
            <div style={{ marginTop: 6 }}>
              <span>新账号：</span>
              <Text copyable={{ text: response.data.username }}>{response.data.username}</Text>
              <span style={{ marginLeft: 12 }}>新密码：</span>
              <Text copyable={{ text: response.data.password }}>{response.data.password}</Text>
            </div>
          )}
        </div>
      );

      message.success({
        content: successContent,
        key,
        duration: 5,
      });
      setInitializeModalVisible(false);
      if (initializingAccount) {
        syncInitializeCredentials((prev) => {
          if (!prev[initializingAccount.id]) {
            return prev;
          }
          const next = { ...prev };
          delete next[initializingAccount.id];
          return next;
        });
      }
      setInitializingAccount(null);
      await loadAccounts();

      if (accountForLogin) {
        try {
          await handleLoginAccount(accountForLogin);
        } catch (loginErr) {
          console.warn('自动登录新凭证失败:', loginErr);
        }
      }
    } catch (error) {
      let msg = '初始化账号失败';
      if ((error as AxiosError)?.isAxiosError) {
        const axiosErr = error as AxiosError<{ error?: string; message?: string }>;
        msg = axiosErr.response?.data?.error || axiosErr.response?.data?.message || axiosErr.message || msg;
      } else if (error instanceof Error) {
        msg = error.message;
      }
      message.error({ content: msg, key });
      throw (error instanceof Error ? error : new Error(msg));
    }
  };

  const handleDeleteAccount = async (id: number) => {
    try {
      const response = await accountApi.deleteAccount(id);
      if (response.success) {
        message.success('账号删除成功');
        loadAccounts();
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      message.error('删除账号失败');
    }
  };

  const handleToggleAccountStatus = async (account: CrownAccount) => {
    try {
      const response = await accountApi.updateAccount(account.id, {
        is_enabled: !account.is_enabled,
      });
      if (response.success) {
        message.success(`账号已${!account.is_enabled ? '启用' : '禁用'}`);
        loadAccounts();
      }
    } catch (error) {
      console.error('Failed to update account status:', error);
      message.error('更新账号状态失败');
    }
  };

  const handleToggleFetch = async (account: CrownAccount, useForFetch: boolean) => {
    try {
      const response = await crownApi.setFetchConfig(account.id, useForFetch);
      if (response.success) {
        message.success(useForFetch ? '已启用该账号用于赛事抓取' : '已禁用该账号用于赛事抓取');
        loadAccounts();
      }
    } catch (error) {
      console.error('Failed to update fetch config:', error);
      message.error('更新赛事抓取配置失败');
    }
  };

  const handleBatchStatusUpdate = async (enabled: boolean) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要操作的账号');
      return;
    }

    try {
      const response = await accountApi.batchUpdateStatus(
        selectedRowKeys as number[],
        enabled
      );
      if (response.success) {
        message.success(`批量${enabled ? '启用' : '禁用'}成功`);
        setSelectedRowKeys([]);
        loadAccounts();
      }
    } catch (error) {
      console.error('Failed to batch update status:', error);
      message.error('批量操作失败');
    }
  };

  const handleBatchLogin = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要登录的账号');
      return;
    }

    const batchKey = 'batch-login';
    try {
      message.loading({ content: `正在批量登录 ${selectedRowKeys.length} 个账号...`, key: batchKey, duration: 0 });
      const response = await crownApi.batchLogin(selectedRowKeys as number[]);

      if (response.success) {
        const data = response.data as { successCount?: number; totalCount?: number };
        const successMsg = data?.successCount !== undefined
          ? `批量登录完成，成功 ${data.successCount}/${data.totalCount} 个账号`
          : response.message || '批量登录成功';
        message.success({ content: successMsg, key: batchKey, duration: 3 });
        setSelectedRowKeys([]);
        loadAccounts();
      } else {
        message.error({ content: `批量登录失败: ${response.error || '未知错误'}`, key: batchKey, duration: 3 });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '网络错误';
      message.error({ content: `批量登录失败: ${errorMsg}`, key: batchKey, duration: 3 });
      console.error('Failed to batch login:', error);
    }
  };

  const handleBatchLogout = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要登出的账号');
      return;
    }

    try {
      const response = await crownApi.batchLogout(selectedRowKeys as number[]);
      if (response.success) {
        message.success(response.message);
        setSelectedRowKeys([]);
        loadAccounts();
      } else {
        message.error(response.error || '批量登出失败');
      }
    } catch (error) {
      console.error('Failed to batch logout:', error);
      message.error('批量登出失败');
    }
  };

  const handleLoginAccount = async (account: CrownAccount) => {
    const loginKey = `login-${account.id}`;
    try {
      message.loading({ content: `正在登录账号 ${account.username}...`, key: loginKey, duration: 0 });
      // 使用纯 API 方式登录（推荐）
      const response = await crownApi.loginAccountWithApi(account.id);

      // 先销毁loading消息
      message.destroy(loginKey);

      if (response.success) {
        message.success(`账号 ${account.username} 登录成功`, 2);
        // 纯 API 登录已经在后端自动获取余额了，不需要再次调用
        loadAccounts();
      } else {
        const errorMsg = response.error || response.message || '未知错误';
        message.error(`登录失败: ${errorMsg}`, 3);
      }
    } catch (error: any) {
      // 先销毁loading消息
      message.destroy(loginKey);

      let errorMsg = '网络错误';
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        errorMsg = '登录超时，请检查网络或稍后重试';
      } else if (error?.response?.data?.error) {
        errorMsg = error.response.data.error;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      message.error(`登录失败: ${errorMsg}`, 3);
      console.error('Failed to login account:', error);
    }
  };

  const handleLogoutAccount = async (account: CrownAccount) => {
    try {
      const response = await crownApi.logoutAccount(account.id);
      if (response.success) {
        message.success(response.message || '登出成功');
        loadAccounts();
      } else {
        message.error(response.error || '登出失败');
      }
    } catch (error) {
      console.error('Failed to logout account:', error);
      message.error('登出失败');
    }
  };

  const handleFormSubmit = async () => {
    setFormModalVisible(false);
    loadAccounts();
    loadGroups();
  };

  const handleGroupCreated = (group: Group) => {
    setGroups(prev => {
      if (prev.some(existing => existing.id === group.id)) {
        return prev;
      }
      return [...prev, group];
    });
  };

  // 过滤账号数据
  const filteredAccounts = accounts.filter(account =>
    account.username.toLowerCase().includes(searchText.toLowerCase()) ||
    account.display_name.toLowerCase().includes(searchText.toLowerCase()) ||
    account.group_name?.toLowerCase().includes(searchText.toLowerCase())
  );


  return (
    <div>
      <Title level={2}>账号管理</Title>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="选择分组"
              style={{ width: '100%' }}
              allowClear
              value={selectedGroup}
              onChange={setSelectedGroup}
              options={[
                { label: '全部分组', value: undefined },
                ...groups.map(group => ({
                  label: group.name,
                  value: group.id,
                })),
              ]}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Search
              placeholder="搜索账号"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={12}>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateAccount}
              >
                新增账号
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadAccounts}
              >
                刷新
              </Button>
              {selectedRowKeys.length > 0 && (
                <>
                  <Divider type="vertical" />
                  <Button
                    type="primary"
                    ghost
                    onClick={() => handleBatchStatusUpdate(true)}
                  >
                    批量启用
                  </Button>
                  <Button
                    onClick={() => handleBatchStatusUpdate(false)}
                  >
                    批量禁用
                  </Button>
                  <Divider type="vertical" />
                  <Button
                    type="primary"
                    ghost
                    onClick={handleBatchLogin}
                  >
                    批量登录
                  </Button>
                  <Button
                    onClick={handleBatchLogout}
                  >
                    批量登出
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            <AppstoreOutlined />
            <span>账号卡片</span>
            <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666' }}>
              共 {filteredAccounts.length} 个账号
            </span>
          </Space>
        }
        loading={loading}
      >
        {filteredAccounts.length > 0 ? (
          <div className="account-card-grid">
            {filteredAccounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                pendingCredentials={initializeCredentials[account.id]}
                onEdit={handleEditAccount}
                onDelete={handleDeleteAccount}
                onToggleStatus={handleToggleAccountStatus}
                onRefresh={async (account) => {
                  const key = `refresh-${account.id}`;
                  message.loading({ content: `正在刷新余额 (${account.username})...`, key });
                  try {
                    const response = await crownApi.getAccountBalance(account.id);
                    const balanceData = (response as any)?.data || {};
                    if (response.success) {
                      if (balanceData.balance_source) {
                        console.debug(`余额来源: ${balanceData.balance_source}`);
                      }
                      message.success(`余额已刷新 (${account.username})`);
                      loadAccounts();
                    } else {
                      const reason = response.error || response.message || '刷新失败';
                      if (balanceData.credit) {
                        message.error(`刷新余额失败 (${account.username})：${reason}，仅取得额度 ${balanceData.credit}`);
                      } else {
                        message.error(`刷新余额失败 (${account.username})：${reason}`);
                      }
                    }
                  } catch (e) {
                    const reason = e instanceof Error ? e.message : '刷新失败';
                    message.error(`刷新余额失败 (${account.username})：${reason}`);
                  } finally {
                    message.destroy(key);
                  }
                }}
                onLogin={handleLoginAccount}
                onLogout={handleLogoutAccount}
                onInitialize={handleInitializeAccount}
                onToggleFetch={handleToggleFetch}
              />
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无账号数据"
            style={{ padding: '60px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateAccount}>
              立即创建
            </Button>
          </Empty>
        )}
      </Card>

      {/* 账号表单模态框 */}
      <AccountFormModal
        visible={formModalVisible}
        account={editingAccount}
        groups={groups}
        onCancel={() => setFormModalVisible(false)}
        onSubmit={handleFormSubmit}
        onGroupCreated={handleGroupCreated}
      />

      {/* 账号详情模态框 */}
      <AccountDetailModal
        visible={detailModalVisible}
        account={viewingAccount}
        onCancel={() => setDetailModalVisible(false)}
        onEdit={(account) => {
          setDetailModalVisible(false);
          handleEditAccount(account);
        }}
        pendingCredentials={viewingAccount ? initializeCredentials[viewingAccount.id] : undefined}
      />

      <AccountInitializeModal
        open={initializeModalVisible}
        account={initializingAccount}
        credentials={initializingAccount ? initializeCredentials[initializingAccount.id] : undefined}
        onCancel={() => {
          setInitializeModalVisible(false);
          setInitializingAccount(null);
        }}
        onSubmit={handleInitializeConfirm}
        onCredentialsChange={(values) => {
          if (!initializingAccount) return;
          handleInitializeCredentialsChange(initializingAccount.id, values);
        }}
        onRegenerate={(field) => {
          if (!initializingAccount) return;
          handleInitializeCredentialRegenerate(initializingAccount.id, field);
        }}
      />
    </div>
  );
};

export default AccountsPage;
