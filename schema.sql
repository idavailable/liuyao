-- 六爻卦例库 D1 数据库初始化
-- 执行：npx wrangler d1 execute liuyao-db --file=schema.sql

CREATE TABLE IF NOT EXISTS casts (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  datetime   TEXT,
  pillars    TEXT,
  question   TEXT,
  hex        TEXT,
  tosses     TEXT,   -- JSON：摇卦记录
  pan_text   TEXT,   -- 排盘文本
  messages   TEXT    -- JSON：AI 断卦与进阶探讨对话历史
);

CREATE INDEX IF NOT EXISTS idx_casts_created ON casts(created_at DESC);
