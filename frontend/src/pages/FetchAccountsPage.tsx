import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Space,
  Tag,
  Button,
  Row,
  Col,
  Card,
  List,
  message,
  Select,
  Empty,
  Spin,
} from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { CrownAccount, Group } from '../types';
import { accountApi, crownApi, groupApi } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

type GroupFilter = number | 'all';

const FetchAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<CrownAccount[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const response = await groupApi.getGroups();
      if (response.success && response.data) {
        setGroups(response.data);
      }
    } catch (error) {
      console.warn('加载分组列表失败:', error);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const [accountResponse, statusResponse] = await Promise.all([
        accountApi.getAccounts(),
        crownApi.getStatus().catch((error) => {
          console.warn('加载自动化状态失败:', error);
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
      } else {
        message.error(accountResponse.error || '加载账号列表失败');
      }
    } catch (error) {
      console.error('加载账号列表失败:', error);
      message.error('加载账号列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
    loadAccounts();
  }, [loadGroups, loadAccounts]);

  const fetchAccounts = useMemo(() => (
    accounts.filter((account) => account.use_for_fetch)
  ), [accounts]);

  const availableAccounts = useMemo(() => (
    accounts.filter((account) => !account.use_for_fetch)
  ), [accounts]);

  const filteredFetchAccounts = useMemo(() => (
    groupFilter === 'all'
      ? fetchAccounts
      : fetchAccounts.filter((account) => account.group_id === groupFilter)
  ), [fetchAccounts, groupFilter]);

  const filteredAvailableAccounts = useMemo(() => (
    groupFilter === 'all'
      ? availableAccounts
      : availableAccounts.filter((account) => account.group_id === groupFilter)
  ), [availableAccounts, groupFilter]);

  const renderAccountMeta = (account: CrownAccount) => (
    <Space size={8} wrap>
      <Text strong>{account.username}</Text>
      {account.group_name && (
        <Tag>{account.group_name}</Tag>
      )}
      <Tag color={account.is_online ? 'green' : 'default'}>
        {account.is_online ? '在线' : '离线'}
      </Tag>
      <Tag color={account.proxy_enabled ? 'blue' : undefined}>
        {account.proxy_enabled ? '代理' : '直连'}
      </Tag>
    </Space>
  );

  const handleToggleFetch = async (account: CrownAccount, useForFetch: boolean) => {
    try {
      setUpdatingId(account.id);
      const response = await crownApi.setFetchConfig(account.id, useForFetch);
      if (response.success) {
        message.success(response.message || (useForFetch ? '已加入抓取账号' : '已移出抓取账号'));
        setAccounts((prev) => prev.map((item) => (
          item.id === account.id ? { ...item, use_for_fetch: useForFetch } : item
        )));
      } else {
        message.error(response.error || '更新配置失败');
      }
    } catch (error) {
      console.error('更新抓取配置失败:', error);
      message.error('更新配置失败');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space align="center" size={16} wrap>
          <Title level={3} style={{ margin: 0 }}>赛事抓取账号</Title>
          <Tag color="geekblue">当前已启用 {fetchAccounts.length} 个账号</Tag>
          <Button icon={<ReloadOutlined />} onClick={loadAccounts}>刷新</Button>
          <Select
            value={groupFilter}
            style={{ width: 200 }}
            onChange={(value) => setGroupFilter(value as GroupFilter)}
            allowClear={false}
          >
            <Option value="all">全部分组</Option>
            {groups.map((group) => (
              <Option key={group.id} value={group.id}>{group.name}</Option>
            ))}
          </Select>
        </Space>

        <Spin spinning={loading} tip="正在加载账号信息...">
          <Row gutter={24}>
            <Col xs={24} lg={12}>
              <Card
                title="已启用的抓取账号"
                extra={<Text type="secondary">优先使用这些账号执行赛事抓取</Text>}
                bodyStyle={{ paddingTop: 12 }}
              >
                <List
                  dataSource={filteredFetchAccounts}
                  locale={{ emptyText: <Empty description="还没有启用抓取账号" /> }}
                  renderItem={(account) => (
                    <List.Item
                      actions={[
                        <Button
                          key="remove"
                          type="link"
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={() => handleToggleFetch(account, false)}
                          loading={updatingId === account.id}
                        >
                          移出
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={renderAccountMeta(account)}
                        description={(
                          <Space size={12} wrap>
                            <Text type="secondary">余额: {account.balance ?? '-'}</Text>
                            <Text type="secondary">分组: {account.group_name || '未分组'}</Text>
                          </Space>
                        )}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title="可添加的账号"
                extra={<Text type="secondary">切换为抓取账号后会被自动复用</Text>}
                bodyStyle={{ paddingTop: 12 }}
              >
                <List
                  dataSource={filteredAvailableAccounts}
                  locale={{ emptyText: <Empty description="没有可用账号" /> }}
                  renderItem={(account) => (
                    <List.Item
                      actions={[
                        <Button
                          key="add"
                          type="link"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleToggleFetch(account, true)}
                          loading={updatingId === account.id}
                        >
                          加入抓取
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={renderAccountMeta(account)}
                        description={(
                          <Space size={12} wrap>
                            <Text type="secondary">上次登录: {account.updated_at ? new Date(account.updated_at).toLocaleString() : '-'}</Text>
                            <Text type="secondary">分组: {account.group_name || '未分组'}</Text>
                          </Space>
                        )}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </Spin>
      </Space>
    </div>
  );
};

export default FetchAccountsPage;
