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
  Modal,
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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      const response = await crownApi.initializeAccount(initializingAccount.id, { username, password });

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

  // 单个账号登录（API 方式）
  const handleLoginAccount = async (account: CrownAccount) => {
    const key = `login-${account.id}`;
    try {
      message.loading({ content: `正在登录账号 ${account.username}...`, key, duration: 0 });
      const response = await crownApi.loginAccount(account.id);
      if (response.success) {
        message.success({ content: `账号 ${account.username} 登录成功`, key, duration: 2 });
        await loadAccounts();
      } else {
        message.error({ content: response.error || '登录失败', key, duration: 3 });
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.error || '登录失败', key, duration: 3 });
    }
  };

  // 单个账号登出
  const handleLogoutAccount = async (account: CrownAccount) => {
    const key = `logout-${account.id}`;
    try {
      message.loading({ content: `正在登出账号 ${account.username}...`, key, duration: 0 });
      const response = await crownApi.logoutAccount(account.id);
      if (response.success) {
        message.success({ content: `账号 ${account.username} 已登出`, key, duration: 2 });
        await loadAccounts();
      } else {
        message.error({ content: response.error || '登出失败', key, duration: 3 });
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.error || '登出失败', key, duration: 3 });
    }
  };

  // 单个账号刷新余额
  const handleRefreshBalance = async (account: CrownAccount) => {
    const key = `refresh-${account.id}`;
    try {
      message.loading({ content: `正在刷新账号 ${account.username} 的余额...`, key, duration: 0 });
      const response = await crownApi.getAccountBalance(account.id);
      if (response.success) {
        message.success({ content: `账号 ${account.username} 余额刷新成功`, key, duration: 2 });
        await loadAccounts();
      } else {
        message.error({ content: response.error || '刷新余额失败', key, duration: 3 });
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.error || '刷新余额失败', key, duration: 3 });
    }
  };

  // 查账 - 查询账号下注历史记录（最近7天）
  const handleCheckHistory = async (account: CrownAccount) => {
    const key = `check-history-${account.id}`;
    try {
      message.loading({ content: `正在获取账号 ${account.username} 的下注记录（最近7天）...`, key, duration: 0 });

      // 计算一周前的日期
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      // 格式化日期为 YYYY-MM-DD
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const response = await crownApi.getHistory(account.id, {
        gtype: 'ALL',
        isAll: 'N',
        startdate: formatDate(startDate),
        enddate: formatDate(endDate),
        filter: 'Y'
      });

      if (response.success) {
        const data = response.data;

        // 解析返回的数据
        let wagers: any[] = [];
        let totalAmount = 0;

        if (data && typeof data === 'object') {
          // 如果返回的是数组
          if (Array.isArray(data)) {
            wagers = data;
          }
          // 如果返回的是对象，尝试提取 wagers 字段
          else if (data.wagers && Array.isArray(data.wagers)) {
            wagers = data.wagers;
          }
          // 如果有其他字段包含下注记录
          else {
            // 尝试从对象中提取所有可能的下注记录
            Object.keys(data).forEach(key => {
              if (Array.isArray(data[key])) {
                wagers = [...wagers, ...data[key]];
              }
            });
          }

          // 计算总金额
          wagers.forEach((wager: any) => {
            if (wager.gold || wager.amount || wager.bet_amount) {
              totalAmount += parseFloat(wager.gold || wager.amount || wager.bet_amount || 0);
            }
          });
        }

        message.success({ content: `成功获取账号 ${account.username} 的下注记录`, key, duration: 2 });

        // 显示查账结果
        Modal.info({
          title: `账号 ${account.username} 的下注记录（最近7天）`,
          width: 800,
          content: (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <Text strong>查询时间：</Text>
                <Text>{formatDate(startDate)} 至 {formatDate(endDate)}</Text>
                <br />
                <Text strong>下注笔数：</Text>
                <Text>{wagers.length} 笔</Text>
                <Divider type="vertical" />
                <Text strong>下注总额：</Text>
                <Text>{totalAmount.toLocaleString()}</Text>
              </div>
              {wagers.length > 0 ? (
                <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                  {wagers.map((wager: any, index: number) => (
                    <div key={index} style={{
                      padding: '12px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      backgroundColor: '#fafafa'
                    }}>
                      <pre style={{ fontSize: '12px', margin: 0 }}>
                        {JSON.stringify(wager, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description="最近7天暂无下注记录" />
              )}
            </div>
          ),
        });
      } else {
        message.error({ content: response.error || '获取下注记录失败', key, duration: 3 });
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.error || '获取下注记录失败', key, duration: 3 });
    }
  };

  // 初始化账号
  const handleInitializeAccount = (account: CrownAccount) => {
    setInitializingAccount(account);
    setInitializeModalVisible(true);
  };



  const handleRefreshAllBalances = async () => {
    const onlineAccounts = accounts.filter(account => account.is_online);

    if (onlineAccounts.length === 0) {
      message.warning('没有在线的账号可以刷新余额');
      return;
    }

    const batchKey = 'refresh-all-balances';
    message.loading({
      content: `正在刷新 ${onlineAccounts.length} 个在线账号的余额...`,
      key: batchKey,
      duration: 0
    });

    let successCount = 0;
    let partialCount = 0; // 只获取到额度的账号
    let failCount = 0;
    const failedAccounts: string[] = [];

    try {
      // 并发刷新所有在线账号的余额
      const results = await Promise.allSettled(
        onlineAccounts.map(account => crownApi.getAccountBalance(account.id))
      );

      results.forEach((result, index) => {
        const account = onlineAccounts[index];
        if (result.status === 'fulfilled') {
          const response = result.value;
          const balanceData = (response as any)?.data || {};

          // 参考登录后的余额同步逻辑
          if (response.success) {
            successCount++;
            if (balanceData.balance_source) {
              console.debug(`账号 ${account.username} 余额来源: ${balanceData.balance_source}`);
            }
          } else {
            // 即使 success 为 false，如果有 credit 数据也算部分成功
            if (balanceData.credit) {
              partialCount++;
              console.warn(`账号 ${account.username} 仅取得额度: ${balanceData.credit}`);
            } else {
              failCount++;
              failedAccounts.push(account.username);
              const reason = response.error || response.message || '未知错误';
              console.warn(`刷新账号 ${account.username} 余额失败: ${reason}`);
            }
          }
        } else {
          failCount++;
          failedAccounts.push(account.username);
          console.warn(`刷新账号 ${account.username} 余额失败:`, result.reason);
        }
      });

      // 刷新完成后重新加载账号列表
      await loadAccounts();

      // 根据结果显示不同的提示
      if (failCount === 0 && partialCount === 0) {
        message.success({
          content: `余额刷新完成！成功 ${successCount} 个账号`,
          key: batchKey,
          duration: 3
        });
      } else if (failCount === 0 && partialCount > 0) {
        message.warning({
          content: `余额刷新完成！成功 ${successCount} 个，${partialCount} 个仅获取到额度`,
          key: batchKey,
          duration: 4
        });
      } else {
        const msg = `余额刷新完成！成功 ${successCount} 个${partialCount > 0 ? `，${partialCount} 个仅获取到额度` : ''}，失败 ${failCount} 个`;
        message.warning({
          content: msg,
          key: batchKey,
          duration: 4
        });
      }
    } catch (error) {
      console.error('Failed to refresh balances:', error);
      message.error({
        content: '批量刷新余额失败',
        key: batchKey,
        duration: 3
      });
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
    <div style={{ padding: isMobile ? 0 : '24px' }}>
      <Title level={isMobile ? 4 : 2} style={{ padding: isMobile ? '12px' : 0 }}>账号管理</Title>

      <Card style={isMobile ? { marginBottom: 1, borderRadius: 0 } : { marginBottom: 16 }}>
        <Row gutter={isMobile ? [0, 8] : [16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="选择分组"
              style={{ width: '100%' }}
              allowClear
              value={selectedGroup}
              onChange={setSelectedGroup}
              size={isMobile ? 'small' : 'middle'}
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
              size={isMobile ? 'small' : 'middle'}
            />
          </Col>
          <Col xs={24} sm={8} md={12}>
            <Space wrap size={isMobile ? 4 : 8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateAccount}
                size={isMobile ? 'small' : 'middle'}
              >
                {isMobile ? '新增' : '新增账号'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefreshAllBalances}
                loading={loading}
                size={isMobile ? 'small' : 'middle'}
              >
                {isMobile ? '刷新' : '刷新余额'}
              </Button>
              {selectedRowKeys.length > 0 && (
                <>
                  {!isMobile && <Divider type="vertical" />}
                  <Button
                    type="primary"
                    ghost
                    onClick={() => handleBatchStatusUpdate(true)}
                    size={isMobile ? 'small' : 'middle'}
                  >
                    {isMobile ? '启用' : '批量启用'}
                  </Button>
                  <Button
                    onClick={() => handleBatchStatusUpdate(false)}
                    size={isMobile ? 'small' : 'middle'}
                  >
                    {isMobile ? '禁用' : '批量禁用'}
                  </Button>
                  {!isMobile && <Divider type="vertical" />}
                  <Button
                    type="primary"
                    ghost
                    onClick={handleBatchLogin}
                    size={isMobile ? 'small' : 'middle'}
                  >
                    {isMobile ? '登录' : '批量登录'}
                  </Button>
                  <Button
                    onClick={handleBatchLogout}
                    size={isMobile ? 'small' : 'middle'}
                  >
                    {isMobile ? '登出' : '批量登出'}
                  </Button>
                </>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space size={isMobile ? 4 : 8}>
            <AppstoreOutlined />
            <span style={{ fontSize: isMobile ? '14px' : '16px' }}>账号卡片</span>
            <span style={{ fontSize: isMobile ? '12px' : '14px', fontWeight: 'normal', color: '#666' }}>
              共 {filteredAccounts.length} 个
            </span>
          </Space>
        }
        loading={loading}
        style={isMobile ? { margin: 0, borderRadius: 0 } : {}}
        bodyStyle={isMobile ? { padding: 0 } : {}}
      >
        {filteredAccounts.length > 0 ? (
          <div className="account-card-grid">
            {filteredAccounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={handleEditAccount}
                onDelete={handleDeleteAccount}
                onToggleStatus={handleToggleAccountStatus}
                onLogin={handleLoginAccount}
                onLogout={handleLogoutAccount}
                onRefresh={handleRefreshBalance}
                onCheckHistory={handleCheckHistory}
                onInitialize={handleInitializeAccount}
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
