import React, { useState, useEffect } from 'react';
import { Table, Card, DatePicker, Space, message } from 'antd';
import { isportsMatchApi } from '../services/api';
import dayjs, { Dayjs } from 'dayjs';

const ISportsMatchesPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());

  // 加载赛事数据
  const loadMatches = async () => {
    try {
      setLoading(true);
      const date = selectedDate.format('YYYY-MM-DD');
      const response = await isportsMatchApi.getMatches({ date });
      
      if (response.success && response.data) {
        setMatches(response.data.matches);
      } else {
        message.error(response.message || '加载失败');
      }
    } catch (error: any) {
      console.error('加载 iSports 赛事失败:', error);
      message.error(error.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 日期变化时重新加载
  useEffect(() => {
    loadMatches();
  }, [selectedDate]);

  // 表格列定义
  const columns = [
    {
      title: '比赛ID',
      dataIndex: 'matchId',
      key: 'matchId',
      width: 120,
    },
    {
      title: '联赛',
      dataIndex: 'leagueName',
      key: 'leagueName',
      width: 200,
    },
    {
      title: '主队',
      dataIndex: 'homeName',
      key: 'homeName',
      width: 150,
    },
    {
      title: '客队',
      dataIndex: 'awayName',
      key: 'awayName',
      width: 150,
    },
    {
      title: '比赛时间',
      dataIndex: 'matchTime',
      key: 'matchTime',
      width: 180,
      render: (time: number) => {
        return dayjs(time * 1000).format('YYYY-MM-DD HH:mm:ss');
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => {
        const statusMap: Record<number, string> = {
          0: '未开始',
          1: '进行中',
          2: '已结束',
          3: '延期',
          4: '取消',
          5: '中断',
        };
        return statusMap[status] || `状态${status}`;
      },
    },
    {
      title: '比分',
      key: 'score',
      width: 100,
      render: (_: any, record: any) => {
        if (record.status === 0) {
          return '-';
        }
        return `${record.homeScore || 0} : ${record.awayScore || 0}`;
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h1>iSports 足球赛事记录</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        iSports 足球赛事数据（可按日期查询）
      </p>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            format="YYYY-MM-DD"
            placeholder="选择日期"
          />
          <span style={{ color: '#666' }}>
            共 {matches.length} 场比赛
          </span>
        </Space>

        <Table
          columns={columns}
          dataSource={matches}
          rowKey="matchId"
          loading={loading}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 场比赛`,
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <p>{selectedDate.format('YYYY-MM-DD')} 暂无赛事数据</p>
              </div>
            ),
          }}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
};

export default ISportsMatchesPage;

