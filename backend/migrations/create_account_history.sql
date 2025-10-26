-- 创建账户历史数据表
CREATE TABLE IF NOT EXISTS account_history (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES crown_accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_of_week VARCHAR(10),
    bet_amount DECIMAL(10, 2) DEFAULT 0,
    valid_amount DECIMAL(10, 2) DEFAULT 0,
    win_loss DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_account_date UNIQUE(account_id, date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_account_history_account_date ON account_history(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_account_history_date ON account_history(date DESC);

-- 添加注释
COMMENT ON TABLE account_history IS '账户历史数据表';
COMMENT ON COLUMN account_history.account_id IS '账号ID';
COMMENT ON COLUMN account_history.date IS '日期';
COMMENT ON COLUMN account_history.day_of_week IS '星期几';
COMMENT ON COLUMN account_history.bet_amount IS '投注金额';
COMMENT ON COLUMN account_history.valid_amount IS '有效金额';
COMMENT ON COLUMN account_history.win_loss IS '赢/输金额';

