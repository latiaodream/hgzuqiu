-- 启用 pg_trgm 扩展以支持模糊匹配和相似度计算
-- 用于通过球队名称模糊匹配查找皇冠比赛

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 为 crown_matches 表创建 GIN 索引以加速模糊查询
CREATE INDEX IF NOT EXISTS idx_crown_matches_home_trgm ON crown_matches USING gin (crown_home gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crown_matches_away_trgm ON crown_matches USING gin (crown_away gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crown_matches_league_trgm ON crown_matches USING gin (crown_league gin_trgm_ops);

-- 为时间范围查询创建索引
CREATE INDEX IF NOT EXISTS idx_crown_matches_match_time ON crown_matches (match_time);

