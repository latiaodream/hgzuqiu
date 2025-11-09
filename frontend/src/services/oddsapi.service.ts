import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface OddsApiEvent {
    id: number;
    home: string;
    away: string;
    date: string;
    sport_name: string;
    sport_slug: string;
    league_name: string;
    league_slug: string;
    status: string;
    home_score: number;
    away_score: number;
    odds?: OddsApiOdds[];
}

export interface OddsApiOdds {
    market_name: string;
    ml_home?: number;
    ml_draw?: number;
    ml_away?: number;
    spread_hdp?: number;
    spread_home?: number;
    spread_away?: number;
    totals_hdp?: number;
    totals_over?: number;
    totals_under?: number;
    updated_at: string;
}

export interface OddsApiLeague {
    league_name: string;
    league_slug: string;
    event_count: number;
}

export interface OddsApiStats {
    total_events: number;
    pending_events: number;
    live_events: number;
    settled_events: number;
    total_leagues: number;
    total_sports: number;
    total_odds: number;
    events_with_odds: number;
}

class OddsApiService {
    /**
     * 获取赛事列表
     */
    async getEvents(params?: {
        sport?: string;
        league?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ success: boolean; data: OddsApiEvent[]; total: number }> {
        const response = await axios.get(`${API_BASE_URL}/oddsapi/events`, {
            params,
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        });
        return response.data;
    }

    /**
     * 获取单个赛事详情
     */
    async getEvent(id: number): Promise<{ success: boolean; data: OddsApiEvent }> {
        const response = await axios.get(`${API_BASE_URL}/oddsapi/events/${id}`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        });
        return response.data;
    }

    /**
     * 获取联赛列表
     */
    async getLeagues(sport: string = 'football'): Promise<{ success: boolean; data: OddsApiLeague[] }> {
        const response = await axios.get(`${API_BASE_URL}/oddsapi/leagues`, {
            params: { sport },
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        });
        return response.data;
    }

    /**
     * 手动触发数据同步
     */
    async syncData(sport: string = 'football'): Promise<{ success: boolean; message: string }> {
        const response = await axios.post(
            `${API_BASE_URL}/oddsapi/sync`,
            { sport },
            {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            }
        );
        return response.data;
    }

    /**
     * 获取统计信息
     */
    async getStats(): Promise<{ success: boolean; data: OddsApiStats }> {
        const response = await axios.get(`${API_BASE_URL}/oddsapi/stats`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        });
        return response.data;
    }
}

export default new OddsApiService();

