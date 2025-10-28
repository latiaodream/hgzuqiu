import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Row,
  Col,
  Tabs,
  Card,
  Space,
  message,
  Divider,
  Button,
  Tooltip,
  Radio,
  Alert,
} from 'antd';
import type { CrownAccount, Group, CrownAccountCreateRequest, InitType } from '../../types';
import { accountApi, groupApi } from '../../services/api';
import { ReloadOutlined, CheckCircleOutlined, KeyOutlined, SyncOutlined } from '@ant-design/icons';
import { generateAccountPassword, generateAccountUsername } from '../../utils/credentials';

const { Option } = Select;

const DEVICE_OPTIONS = [
  'iPhone 17',
  'iPhone 16',
  'iPhone 15',
  'iPhone 14',
  'iPhone 13',
  'iPhone 12',
  'iPhone 11',
  'iPhone Xs',
  'iPhone X',
  'iPhone 8',
  'iPhone 7',
  'iPhone 6s',
  'iPhone 6',
  'Android',
  'Desktop',
];

interface AccountFormModalProps {
  visible: boolean;
  account: CrownAccount | null;
  groups: Group[];
  onCancel: () => void;
  onSubmit: () => void;
  onGroupCreated?: (group: Group) => void;
}

const AccountFormModal: React.FC<AccountFormModalProps> = ({
  visible,
  account,
  groups,
  onCancel,
  onSubmit,
  onGroupCreated,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [localGroups, setLocalGroups] = useState<Group[]>(groups);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [initType, setInitType] = useState<InitType>('full');
  const [fetchingLimits, setFetchingLimits] = useState(false);

  const regenerateCredential = useCallback((field: 'username' | 'password') => {
    const value = field === 'username' ? generateAccountUsername() : generateAccountPassword();
    form.setFieldsValue({ [field]: value });
  }, [form]);

  const handleFetchLimits = useCallback(async () => {
    try {
      // 验证必填字段
      const username = form.getFieldValue('username');
      const password = form.getFieldValue('password');

      if (!username || !password) {
        message.warning('请先填写账号和密码');
        return;
      }

      setFetchingLimits(true);
      message.loading({ content: '正在登录皇冠获取限额信息...', key: 'fetchLimits', duration: 0 });

      // 如果是编辑模式且账号已存在，使用账号ID
      if (account?.id) {
        const response = await accountApi.fetchLimits(account.id);

        if (response.success && response.data) {
          form.setFieldsValue({
            football_prematch_limit: response.data.football.prematch,
            football_live_limit: response.data.football.live,
            basketball_prematch_limit: response.data.basketball.prematch,
            basketball_live_limit: response.data.basketball.live,
          });
          message.success({ content: '限额信息获取成功！', key: 'fetchLimits' });
        } else {
          message.error({ content: response.error || '获取限额信息失败', key: 'fetchLimits' });
        }
      } else {
        // 新增模式：需要先创建临时账号或使用其他方式
        message.warning({ content: '请先保存账号后再获取限额信息', key: 'fetchLimits' });
      }
    } catch (error) {
      console.error('获取限额信息失败:', error);
      message.error({ content: '获取限额信息失败', key: 'fetchLimits' });
    } finally {
      setFetchingLimits(false);
    }
  }, [form, account]);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  useEffect(() => {
    if (visible) {
      if (account) {
        // 编辑模式
        form.setFieldsValue({
          ...account,
          stop_profit_limit: account.stop_profit_limit ?? 0,
        });
        setProxyEnabled(account.proxy_enabled);
        setInitType(account.init_type || 'full');
      } else {
        // 新增模式
        form.resetFields();
        setProxyEnabled(false);
        setInitType('full');
        // 设置默认值（不包括账号和密码，由用户填写原始账号密码）
        form.setFieldsValue({
          init_type: 'full',
          game_type: '足球',
          source: '自有',
          currency: 'CNY',
          discount: 1.0,
          note: '高',
          stop_profit_limit: 0,
          device_type: 'iPhone 14',
          proxy_enabled: false,
          football_prematch_limit: 100000,
          football_live_limit: 100000,
          basketball_prematch_limit: 100000,
          basketball_live_limit: 100000,
        });
      }
    }
  }, [visible, account, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const requestData: CrownAccountCreateRequest = {
        ...values,
        proxy_enabled: proxyEnabled,
      };

      // 根据初始化类型处理账号字段
      const initType = values.init_type || 'none';

      // username 和 password 始终是原始账号和密码
      requestData.original_username = values.username;

      if (initType === 'none') {
        // 不需要初始化：不需要生成新账号和密码
        requestData.initialized_username = undefined;
      } else if (initType === 'password_only') {
        // 仅修改密码：不需要生成新账号，但需要生成新密码
        requestData.initialized_username = undefined;
      } else if (initType === 'full') {
        // 完整初始化：需要生成新账号和新密码
        // initialized_username 由后端自动生成
        requestData.initialized_username = undefined;
      }

      // 如果未启用代理，清空代理相关字段
      if (!proxyEnabled) {
        requestData.proxy_type = undefined;
        requestData.proxy_host = undefined;
        requestData.proxy_port = undefined;
        requestData.proxy_username = undefined;
        requestData.proxy_password = undefined;
      }

      let response;
      if (account) {
        // 编辑模式
        response = await accountApi.updateAccount(account.id, requestData);
      } else {
        // 新增模式
        response = await accountApi.createAccount(requestData);
      }

      if (response.success) {
        message.success(account ? '账号更新成功' : '账号创建成功');

        // 如果是新增模式，自动获取限额
        if (!account && response.data?.id) {
          try {
            message.loading({ content: '正在自动获取限额信息...', key: 'autoFetchLimits', duration: 0 });
            const limitsResponse = await accountApi.fetchLimits(response.data.id);

            if (limitsResponse.success) {
              message.success({ content: '限额信息已自动获取并保存', key: 'autoFetchLimits' });
            } else {
              message.warning({
                content: `账号创建成功，但限额获取失败: ${limitsResponse.error || '未知错误'}`,
                key: 'autoFetchLimits',
                duration: 5
              });
            }
          } catch (error) {
            console.error('自动获取限额失败:', error);
            message.warning({
              content: '账号创建成功，但限额获取失败，请稍后手动获取',
              key: 'autoFetchLimits',
              duration: 5
            });
          }
        }

        onSubmit();
      }
    } catch (error) {
      console.error('Failed to save account:', error);
      message.error('保存账号失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setProxyEnabled(false);
    onCancel();
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) {
      message.warning('请输入分组名称');
      return;
    }

    try {
      setCreatingGroup(true);
      const response = await groupApi.createGroup({ name });
      if (response.success && response.data) {
        const createdGroup = response.data;
        setLocalGroups(prev => (
          prev.some(group => group.id === createdGroup.id)
            ? prev
            : [...prev, createdGroup]
        ));
        form.setFieldsValue({ group_id: createdGroup.id });
        onGroupCreated?.(createdGroup);
        setNewGroupName('');
        message.success('分组创建成功');
      } else {
        message.error(response.error || '创建分组失败');
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      message.error('创建分组失败');
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <Modal
      title={account ? '编辑账号' : '新增账号'}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={800}
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changedValues, allValues) => {
          if ('proxy_enabled' in changedValues) {
            setProxyEnabled(allValues.proxy_enabled);
          }

          // 用户选择初始化类型
          if ('init_type' in changedValues) {
            setInitType(changedValues.init_type);
          }
        }}
      >
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: 'basic',
              label: '基本信息',
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="group_id"
                        label="所属分组"
                        rules={[{ required: true, message: '请选择分组' }]}
                      >
                        <Select
                          placeholder="选择分组"
                          dropdownRender={(menu) => (
                            <>
                              {menu}
                              <Divider style={{ margin: '8px 0' }} />
                              <Space style={{ padding: '0 8px 4px' }}>
                                <Input
                                  placeholder="新分组名称"
                                  value={newGroupName}
                                  onChange={(e) => setNewGroupName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleCreateGroup();
                                    }
                                  }}
                                />
                                <Button
                                  type="link"
                                  onClick={handleCreateGroup}
                                  loading={creatingGroup}
                                >
                                  新增分组
                                </Button>
                              </Space>
                            </>
                          )}
                        >
                          {localGroups.map(group => (
                            <Option key={group.id} value={group.id}>
                              {group.name}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="username"
                        label="原始账号"
                        tooltip="皇冠账号的原始用户名"
                        rules={[
                          { required: true, message: '请输入原始账号' },
                          { min: 3, message: '账号至少3个字符' },
                        ]}
                      >
                        <Input placeholder="请输入原始账号" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="password"
                        label="原始密码"
                        tooltip="皇冠账号的原始密码"
                        rules={[{ required: true, message: '请输入原始密码' }]}
                      >
                        <Input
                          placeholder="请输入原始密码"
                          type="password"
                          autoComplete="new-password"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="passcode"
                        label="简易密码"
                        tooltip="可选，四位简易登录密码"
                      >
                        <Input placeholder="可选，四位简易登录密码" maxLength={4} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item
                        name="display_name"
                        label="显示名称"
                        tooltip="可选，用于在系统中显示的名称"
                      >
                        <Input placeholder="可选，用于显示的名称" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider orientation="left" style={{ fontSize: '14px', fontWeight: 500 }}>
                    初始化设置
                  </Divider>

                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item
                        name="init_type"
                        label="初始化类型"
                        tooltip="选择账号的初始化方式"
                      >
                        <Radio.Group>
                          <Space direction="vertical" size="middle">
                            <Radio value="none">
                              <Space>
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                <span style={{ fontWeight: 500 }}>不需要初始化</span>
                              </Space>
                              <div style={{ fontSize: '12px', color: '#999', marginLeft: 24, marginTop: 4 }}>
                                直接使用原始账号和密码登录
                              </div>
                            </Radio>
                            <Radio value="password_only">
                              <Space>
                                <KeyOutlined style={{ color: '#1890ff' }} />
                                <span style={{ fontWeight: 500 }}>仅修改密码</span>
                              </Space>
                              <div style={{ fontSize: '12px', color: '#999', marginLeft: 24, marginTop: 4 }}>
                                保持账号不变，系统自动生成新密码
                              </div>
                            </Radio>
                            <Radio value="full">
                              <Space>
                                <SyncOutlined style={{ color: '#faad14' }} />
                                <span style={{ fontWeight: 500 }}>完整初始化</span>
                              </Space>
                              <div style={{ fontSize: '12px', color: '#999', marginLeft: 24, marginTop: 4 }}>
                                系统自动生成新账号和新密码
                              </div>
                            </Radio>
                          </Space>
                        </Radio.Group>
                      </Form.Item>
                    </Col>
                  </Row>

                  {initType === 'none' && (
                    <Alert
                      message="不需要初始化"
                      description="系统将直接使用您填写的原始账号和密码登录，不做任何修改。"
                      type="success"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  {initType === 'password_only' && (
                    <Alert
                      message="仅修改密码"
                      description="系统将使用原始账号和密码登录后，自动生成并修改为新密码。账号保持不变。"
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  {initType === 'full' && (
                    <Alert
                      message="完整初始化"
                      description="系统将使用原始账号和密码登录后，自动生成新账号和新密码并完成修改。"
                      type="warning"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Divider orientation="left" style={{ fontSize: '14px', fontWeight: 500 }}>
                    其他信息
                  </Divider>

                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="game_type"
                        label="游戏类型"
                      >
                        <Select>
                          <Option value="足球">足球</Option>
                          <Option value="篮球">篮球</Option>
                          <Option value="综合">综合</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="source"
                        label="来源"
                      >
                        <Select>
                          <Option value="自有">自有</Option>
                          <Option value="代理">代理</Option>
                          <Option value="合作">合作</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="currency"
                        label="货币"
                      >
                        <Select>
                          <Option value="CNY">CNY</Option>
                          <Option value="USD">USD</Option>
                          <Option value="EUR">EUR</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="discount"
                        label="折扣 (0-1)"
                        rules={[{
                          required: true,
                          message: '请输入折扣，例如 0.85',
                        }, {
                          validator: (_, value) => {
                            if (value === undefined || value === null) {
                              return Promise.resolve();
                            }
                            const numeric = Number(value);
                            if (Number.isNaN(numeric) || numeric <= 0 || numeric > 1) {
                              return Promise.reject(new Error('折扣需大于 0 且小于等于 1'));
                            }
                            return Promise.resolve();
                          },
                        }]}
                        extra="皇冠下注金额 = 平台下注金额 ÷ 折扣。例如折扣 0.80，平台 100 → 皇冠 125"
                      >
                        <InputNumber
                          min={0.01}
                          max={1}
                          step={0.01}
                          precision={2}
                          placeholder="0.80"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="note"
                        label="备注"
                      >
                        <Select>
                          <Option value="高">高</Option>
                          <Option value="中">中</Option>
                          <Option value="低">低</Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="device_type"
                        label="设备类型"
                      >
                        <Select placeholder="选择设备类型">
                          {DEVICE_OPTIONS.map(device => (
                            <Option key={device} value={device}>
                              {device}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'proxy',
              label: '代理设置',
              children: (
                <>
                  <Form.Item name="proxy_enabled" label="启用代理" valuePropName="checked">
                    <Switch />
                  </Form.Item>

                  {proxyEnabled && (
                    <>
                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="proxy_type"
                            label="代理类型"
                            rules={[{ required: true, message: '请选择代理类型' }]}
                          >
                            <Select>
                              <Option value="HTTP">HTTP</Option>
                              <Option value="HTTPS">HTTPS</Option>
                              <Option value="SOCKS5">SOCKS5</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="proxy_host"
                            label="代理地址"
                            rules={[{ required: true, message: '请输入代理地址' }]}
                          >
                            <Input placeholder="127.0.0.1" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="proxy_port"
                            label="代理端口"
                            rules={[{ required: true, message: '请输入代理端口' }]}
                          >
                            <InputNumber
                              min={1}
                              max={65535}
                              placeholder="8080"
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item
                            name="proxy_username"
                            label="代理用户名"
                          >
                            <Input placeholder="可选" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item
                            name="proxy_password"
                            label="代理密码"
                          >
                            <Input.Password placeholder="可选" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  )}
                </>
              ),
            },
            {
              key: 'limits',
              label: '限额设置',
              children: (
                <>
                  <Alert
                    message="限额说明"
                    description="可以手动输入限额，或点击下方按钮从皇冠网站自动获取当前账号的限额信息"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    action={
                      <Button
                        type="primary"
                        size="small"
                        icon={<SyncOutlined spin={fetchingLimits} />}
                        onClick={handleFetchLimits}
                        loading={fetchingLimits}
                        disabled={!account?.id}
                      >
                        {account?.id ? '获取限额' : '保存后可用'}
                      </Button>
                    }
                  />

                  <Card title="风控设置" size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="stop_profit_limit"
                          label="止盈金额"
                          rules={[
                            { required: true, message: '请输入止盈金额' },
                            {
                              validator: async (_, value) => {
                                if (value === undefined || value === null) {
                                  return;
                                }
                                if (Number(value) < 0) {
                                  throw new Error('止盈金额不能为负数');
                                }
                              },
                            },
                          ]}
                          extra="达到该金额后系统会停止自动下注"
                        >
                          <InputNumber
                            min={0}
                            step={100}
                            precision={2}
                            placeholder="0"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="足球限额" size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="football_prematch_limit"
                          label="赛前限额"
                        >
                          <InputNumber
                            min={0}
                            placeholder="100000"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="football_live_limit"
                          label="滚球限额"
                        >
                          <InputNumber
                            min={0}
                            placeholder="100000"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="篮球限额" size="small">
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="basketball_prematch_limit"
                          label="赛前限额"
                        >
                          <InputNumber
                            min={0}
                            placeholder="100000"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          name="basketball_live_limit"
                          label="滚球限额"
                        >
                          <InputNumber
                            min={0}
                            placeholder="100000"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
};

export default AccountFormModal;
