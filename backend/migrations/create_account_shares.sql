-- 创建账号共享表
CREATE TABLE IF NOT EXISTS account_shares (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES crown_accounts(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, shared_to_user_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_account_shares_account_id ON account_shares(account_id);
CREATE INDEX IF NOT EXISTS idx_account_shares_owner_user_id ON account_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_shares_shared_to_user_id ON account_shares(shared_to_user_id);

-- 添加注释
COMMENT ON TABLE account_shares IS '账号共享关系表';
COMMENT ON COLUMN account_shares.account_id IS '被共享的账号ID';
COMMENT ON COLUMN account_shares.owner_user_id IS '账号所有者用户ID';
COMMENT ON COLUMN account_shares.shared_to_user_id IS '接收共享的用户ID';

