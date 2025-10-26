import React, { useEffect, useState } from 'react';
import { Modal, Transfer, message, Spin, Typography, Space, Tag } from 'antd';
import { UserOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { TransferProps } from 'antd';
import type { CrownAccount, ShareableUser, AccountShare } from '../../types';
import { accountShareApi } from '../../services/accountShareApi';

const { Text } = Typography;

interface AccountShareModalProps {
  visible: boolean;
  account: CrownAccount | null;
  onCancel: () => void;
  onSuccess: () => void;
}

interface TransferItem {
  key: string;
  title: string;
  description: string;
  disabled?: boolean;
}

const AccountShareModal: React.FC<AccountShareModalProps> = ({
  visible,
  account,
  onCancel,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ShareableUser[]>([]);
  const [currentShares, setCurrentShares] = useState<AccountShare[]>([]);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);

  useEffect(() => {
    if (visible && account) {
      loadData();
    }
  }, [visible, account]);

  const loadData = async () => {
    if (!account) return;

    setLoading(true);
    try {
      // 并行加载可用用户和当前共享列表
      const [usersRes, sharesRes] = await Promise.all([
        accountShareApi.getAvailableUsers(account.id),
        accountShareApi.getAccountShares(account.id),
      ]);

      if (usersRes.success) {
        setAvailableUsers(usersRes.users);
      }

      if (sharesRes.success) {
        setCurrentShares(sharesRes.shares);
        // 设置已选中的用户
        setTargetKeys(sharesRes.shares.map(share => share.shared_to_user_id.toString()));
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!account) return;

    setSubmitting(true);
    try {
      // 计算需要添加和删除的用户
      const currentUserIds = currentShares.map(share => share.shared_to_user_id);
      const newUserIds = targetKeys.map(key => parseInt(key));

      const toAdd = newUserIds.filter(id => !currentUserIds.includes(id));
      const toRemove = currentUserIds.filter(id => !newUserIds.includes(id));

      // 执行添加和删除操作
      const promises = [];
      if (toAdd.length > 0) {
        promises.push(accountShareApi.shareAccount(account.id, toAdd));
      }
      if (toRemove.length > 0) {
        promises.push(accountShareApi.unshareAccount(account.id, toRemove));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
        message.success('共享设置已更新');
        onSuccess();
      } else {
        message.info('没有变更');
      }

      onCancel();
    } catch (error) {
      console.error('更新共享设置失败:', error);
      message.error('更新共享设置失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange: TransferProps<TransferItem>['onChange'] = (nextTargetKeys) => {
    setTargetKeys(nextTargetKeys.map(key => String(key)));
  };

  // 构建穿梭框数据源
  const dataSource: TransferItem[] = [
    // 已共享的用户
    ...currentShares.map(share => ({
      key: share.shared_to_user_id.toString(),
      title: share.shared_to_username || `用户${share.shared_to_user_id}`,
      description: share.shared_to_email || '',
    })),
    // 可用的用户
    ...availableUsers.map(user => ({
      key: user.id.toString(),
      title: user.username,
      description: user.email,
    })),
  ];

  return (
    <Modal
      title={
        <Space>
          <ShareAltOutlined />
          <span>分享账号</span>
          {account && (
            <Tag color="blue">{account.username}</Tag>
          )}
        </Space>
      }
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={submitting}
      width={700}
      okText="确定"
      cancelText="取消"
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            选择要分享给的用户，被分享的用户可以使用此账号进行下注
          </Text>
        </div>

        <Transfer
          dataSource={dataSource}
          titles={['可选用户', '已分享']}
          targetKeys={targetKeys}
          onChange={handleChange}
          render={item => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserOutlined />
              <div>
                <div>{item.title}</div>
                {item.description && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.description}
                  </Text>
                )}
              </div>
            </div>
          )}
          listStyle={{
            width: 300,
            height: 400,
          }}
          showSearch
          filterOption={(inputValue, item) =>
            item.title.toLowerCase().includes(inputValue.toLowerCase()) ||
            item.description.toLowerCase().includes(inputValue.toLowerCase())
          }
        />

        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：共享后，对方可以在账号列表中看到此账号，并可以使用它进行下注
          </Text>
        </div>
      </Spin>
    </Modal>
  );
};

export default AccountShareModal;
