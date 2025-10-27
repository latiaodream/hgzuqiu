-- 添加 score 列到 bets 表
-- 用于存储比赛的比分信息（例如：1-1, 2-0 等）
-- 日期：2025-10-27

ALTER TABLE bets ADD COLUMN IF NOT EXISTS score VARCHAR(50);

COMMENT ON COLUMN bets.score IS '比赛比分（例如：1-1, 2-0）';

