import React, { useState, useEffect } from 'react';
import { Table, Card, Statistic, Row, Col, Select, Button, message, Tag, Space, Modal, DatePicker } from 'antd';
import { ReloadOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { crownMatchApi } from '../services/api';
import dayjs, { Dayjs } from 'dayjs';

const { Option } = Select;

const CrownMatchesPage: React.FC = () => {
  const [matches, setMatches] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  });
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs()); // 默认今天

  // 加载赛事数据
  const loadMatches = async (page: number = 1, pageSize: number = 50) => {
    try {
      setLoading(true);

      const params: any = {
        page,
        pageSize,
        startDate: selectedDate.format('YYYY-MM-DD'),
        endDate: selectedDate.format('YYYY-MM-DD'),
      };

      // 根据筛选类型设置参数
      if (filterType === 'fully-matched') {
        params.leagueMatched = true;
        params.homeMatched = true;
        params.awayMatched = true;
      } else if (filterType === 'unmatched') {
        // 至少有一个未匹配
        // 这个需要在后端支持，暂时不设置参数
      }

      const response = await crownMatchApi.getMatches(params);

      if (response.success && response.data) {
        setMatches(response.data.matches);
        setPagination({
          current: page,
          pageSize,
          total: response.data.total,
        });
      }
    } catch (error: any) {
      message.error('加载赛事数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await crownMatchApi.getStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error: any) {
      console.error('加载统计数据失败:', error);
    }
  };

  // 删除过期赛事
  const handleDeleteOld = () => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除 7 天前的过期赛事吗？',
      onOk: async () => {
        try {
          const response = await crownMatchApi.deleteOldMatches(7);
          if (response.success) {
            message.success(response.message || '删除成功');
            loadMatches(1, pagination.pageSize);
            loadStats();
          }
        } catch (error: any) {
          message.error('删除失败');
        }
      },
    });
  };

  useEffect(() => {
    loadMatches(1, pagination.pageSize);
    loadStats();
  }, [filterType, selectedDate]);

  const handleTableChange = (newPagination: any) => {
    loadMatches(newPagination.current, newPagination.pageSize);
  };

  const columns = [
    {
      title: '比赛时间',
      dataIndex: 'match_time',
      key: 'match_time',
      width: 180,
      render: (time: string) => time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '联赛',
      dataIndex: 'crown_league',
      key: 'crown_league',
      width: 200,
      render: (text: string, record: any) => (
        <Space>
          <span>{text}</span>
          {record.league_matched ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已匹配</Tag>
          ) : (
            <Tag color="error" icon={<CloseCircleOutlined />}>未匹配</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '主队',
      dataIndex: 'crown_home',
      key: 'crown_home',
      width: 180,
      render: (text: string, record: any) => (
        <Space>
          <span>{text}</span>
          {record.home_matched ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已匹配</Tag>
          ) : (
            <Tag color="error" icon={<CloseCircleOutlined />}>未匹配</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '客队',
      dataIndex: 'crown_away',
      key: 'crown_away',
      width: 180,
      render: (text: string, record: any) => (
        <Space>
          <span>{text}</span>
          {record.away_matched ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已匹配</Tag>
          ) : (
            <Tag color="error" icon={<CloseCircleOutlined />}>未匹配</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '匹配方法',
      key: 'match_methods',
      width: 200,
      render: (_: any, record: any) => (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {record.league_match_method && <div>联赛: {record.league_match_method}</div>}
          {record.home_match_method && <div>主队: {record.home_match_method}</div>}
          {record.away_match_method && <div>客队: {record.away_match_method}</div>}
        </div>
      ),
    },
    {
      title: '皇冠 GID',
      dataIndex: 'crown_gid',
      key: 'crown_gid',
      width: 120,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h1>赛事记录</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        皇冠赛事数据及匹配状态（包含今日赛事和早盘赛事，可按日期查询）
      </p>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总比赛数"
                value={stats.total_matches}
                suffix="场"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="联赛匹配率"
                value={stats.league_match_rate.toFixed(1)}
                suffix="%"
                valueStyle={{ color: stats.league_match_rate >= 80 ? '#3f8600' : '#cf1322' }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                {stats.league_matched} / {stats.total_matches}
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="球队匹配率"
                value={((stats.home_match_rate + stats.away_match_rate) / 2).toFixed(1)}
                suffix="%"
                valueStyle={{ color: ((stats.home_match_rate + stats.away_match_rate) / 2) >= 80 ? '#3f8600' : '#cf1322' }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                主队: {stats.home_matched} / 客队: {stats.away_matched}
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="完全匹配率"
                value={stats.full_match_rate.toFixed(1)}
                suffix="%"
                valueStyle={{ color: stats.full_match_rate >= 80 ? '#3f8600' : '#cf1322' }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                {stats.fully_matched} / {stats.total_matches}
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* 操作栏 */}
      <Card style={{ marginBottom: '16px' }}>
        <Space wrap>
          <DatePicker
            value={selectedDate}
            onChange={(date) => {
              if (date) {
                setSelectedDate(date);
              }
            }}
            format="YYYY-MM-DD"
            placeholder="选择日期"
            style={{ width: 200 }}
            allowClear={false}
          />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 200 }}
          >
            <Option value="all">全部赛事</Option>
            <Option value="fully-matched">完全匹配</Option>
            <Option value="unmatched">有未匹配项</Option>
          </Select>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadMatches(1, pagination.pageSize);
              loadStats();
            }}
          >
            刷新
          </Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={handleDeleteOld}
          >
            删除过期赛事
          </Button>
        </Space>
      </Card>

      {/* 赛事列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={matches}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <p style={{ fontSize: '16px', color: '#999', marginBottom: '8px' }}>
                  {selectedDate.format('YYYY-MM-DD')} 暂无赛事数据
                </p>
                <p style={{ fontSize: '14px', color: '#ccc' }}>
                  请运行 <code>npm run aliases:import-crown</code> 导入皇冠数据
                </p>
              </div>
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default CrownMatchesPage;

