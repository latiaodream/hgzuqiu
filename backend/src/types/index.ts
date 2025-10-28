// 基础响应类型
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

// 用户角色类型
export type UserRole = 'admin' | 'agent' | 'staff';

// 用户相关类型
export interface User {
    id: number;
    username: string;
    email: string;
    role: UserRole;
    parent_id?: number;
    agent_id?: number;
    created_at: string;
    updated_at: string;
}

export interface UserCreateRequest {
    username: string;
    email: string;
    password: string;
    role?: UserRole;
    parent_id?: number;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    user: User;
    token: string;
}

// 分组相关类型
export interface Group {
    id: number;
    user_id: number;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
}

export interface GroupCreateRequest {
    name: string;
    description?: string;
}

// 初始化类型
export type InitType = 'none' | 'password_only' | 'full';

// 皇冠账号相关类型
export interface CrownAccount {
    id: number;
    user_id: number;
    group_id: number;
    agent_id?: number;
    username: string;
    password: string;
    passcode?: string;
    display_name?: string;
    original_username?: string;        // 原始账号（首次登录时的账号）
    initialized_username?: string;     // 修改后的账号（初始化后使用的账号）
    init_type: InitType;               // 初始化类型：none-不初始化, password_only-仅改密码, full-完整初始化
    platform: string;
    game_type: string;
    source: string;
    share_count: number;
    currency: string;
    discount: number;
    note?: string;
    balance: number;
    stop_profit_limit: number;
    device_type?: string;
    user_agent?: string;
    proxy_enabled: boolean;
    proxy_type?: string;
    proxy_host?: string;
    proxy_port?: number;
    proxy_username?: string;
    proxy_password?: string;
    football_prematch_limit: number;
    football_live_limit: number;
    basketball_prematch_limit: number;
    basketball_live_limit: number;
    is_enabled: boolean;
    is_online: boolean;
    last_login_at?: string;
    status: 'active' | 'disabled' | 'error';
    error_message?: string;
    created_at: string;
    updated_at: string;
}

export interface CrownAccountCreateRequest {
    group_id: number;
    username: string;
    password: string;
    passcode?: string;
    display_name?: string;
    original_username?: string;
    initialized_username?: string;
    init_type?: InitType;
    game_type?: string;
    source?: string;
    currency?: string;
    discount?: number;
    stop_profit_limit?: number;
    note?: string;
    device_type?: string;
    proxy_enabled?: boolean;
    proxy_type?: string;
    proxy_host?: string;
    proxy_port?: number;
    proxy_username?: string;
    proxy_password?: string;
    football_prematch_limit?: number;
    football_live_limit?: number;
    basketball_prematch_limit?: number;
    basketball_live_limit?: number;
}

export interface AccountSelectionEntry {
    account: {
        id: number;
        group_id: number;
        group_name?: string;
        username: string;
        display_name?: string;
        original_username?: string;
        initialized_username?: string;
        currency?: string;
        discount?: number;
        stop_profit_limit: number;
        line_key: string;
        is_online: boolean;
    };
    stats: {
        daily_effective_amount: number;
        daily_profit: number;
        weekly_profit: number;
        loss_bucket: number;
    };
    flags: {
        stop_profit_reached: boolean;
        line_conflicted: boolean;
        offline?: boolean;
    };
}

export interface AccountSelectionResponse {
    generated_at: string;
    daily_boundary: string;
    weekly_boundary: string;
    match_id?: number;
    total_accounts: number;
    eligible_accounts: AccountSelectionEntry[];
    excluded_accounts: AccountSelectionEntry[];
}

// 比赛相关类型
export interface Match {
    id: number;
    match_id: string;
    league_name: string;
    home_team: string;
    away_team: string;
    match_time: string;
    status: 'scheduled' | 'live' | 'finished' | 'cancelled';
    current_score?: string;
    match_period?: string;
    markets?: any;
    last_synced_at?: string;
    odds_home_win?: number;
    odds_draw?: number;
    odds_away_win?: number;
    odds_handicap?: number;
    odds_over?: number;
    odds_under?: number;
    odds_home_win_half?: number;
    odds_draw_half?: number;
    odds_away_win_half?: number;
    odds_handicap_half?: number;
    odds_over_half?: number;
    odds_under_half?: number;
    created_at: string;
    updated_at: string;
}

// 下注相关类型
export interface Bet {
    id: number;
    user_id: number;
    account_id: number;
    match_id: number;
    bet_type: string;
    bet_option: string;
    bet_amount: number;
    odds: number;
    min_odds?: number;
    official_odds?: number;
    single_limit?: number;
    interval_seconds: number;
    quantity: number;
    status: 'pending' | 'confirmed' | 'cancelled' | 'settled';
    result?: 'win' | 'lose' | 'draw' | 'cancelled';
    payout: number;
    profit_loss: number;
    official_bet_id?: string;
    confirmed_at?: string;
    settled_at?: string;
    created_at: string;
    updated_at: string;
}

export interface BetCreateRequest {
    account_ids: number[]; // 支持多账号下注
    match_id?: number;
    bet_type: string;
    bet_option: string;
    bet_amount: number;
    odds: number;
    min_odds?: number;
    single_limit?: number;
    interval_seconds?: number;
    quantity?: number;
    crown_match_id?: string;
    league_name?: string;
    home_team?: string;
    away_team?: string;
    match_time?: string;
    match_status?: string;
    current_score?: string;
    match_period?: string;
}

// 金币流水相关类型
export interface CoinTransaction {
    id: number;
    user_id: number;
    account_id?: number;
    bet_id?: number;
    transaction_id: string;
    transaction_type: string;
    description: string;
    amount: number;
    balance_before: number;
    balance_after: number;
    created_at: string;
}

// 请求认证类型
export interface AuthRequest extends Request {
    user?: User;
}
