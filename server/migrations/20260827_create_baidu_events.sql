-- =============================================================
-- 百度商业 API 订阅推送事件表（百度 → 我们）
-- 用途：全量记录百度推送过来的原始事件（创意状态变化、关键词状态变化、
--       账户预算撞线、计划预算撞线、操作动作、账户状态变化 等）
-- 表设计原则：
--   1. payload_json / headers_json 全文存档，便于后续规范变化时回溯分析
--   2. event_type / source_type 索引化便于按类型筛选
--   3. processed 标志用于标记"已处理"事件（自动调预算/告警等）
--   4. 幂等：百度可能会重推，unique key 用 (event_type, raw_dedupe_id) 防重复入库
-- 创建时间：2026-08-27
-- =============================================================

CREATE TABLE IF NOT EXISTS baidu_events (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT         COMMENT '主键',
  source_type     VARCHAR(32)   DEFAULT NULL                    COMMENT '来源大类：search/info_flow/ecommerce',
  event_type      VARCHAR(64)   DEFAULT NULL                    COMMENT '事件类型编码（依百度回调字段原样存）',
  raw_dedupe_id   VARCHAR(128)  DEFAULT NULL                    COMMENT '百度推送的去重ID（若有），用于唯一约束',
  payload_json    LONGTEXT                                    COMMENT '百度 POST body 完整原文',
  headers_json    LONGTEXT                                    COMMENT '请求头完整快照（JSON 序列化）',
  raw_query       TEXT                                        COMMENT 'URL query string 原文',
  method          VARCHAR(8)    DEFAULT NULL                    COMMENT 'HTTP 方法：GET/POST',
  ip              VARCHAR(64)   DEFAULT NULL                    COMMENT '来源 IP',
  user_agent      VARCHAR(512)  DEFAULT NULL                    COMMENT 'User-Agent',
  http_status     SMALLINT      DEFAULT NULL                    COMMENT '我们响应给百度的 HTTP 状态码',
  processed       TINYINT(1)    NOT NULL DEFAULT 0              COMMENT '是否已被业务消费：0=未处理 1=已处理',
  note            VARCHAR(500)  DEFAULT NULL                    COMMENT '备注（人工/自动）',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '入库时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_event_dedupe (event_type, raw_dedupe_id),
  KEY idx_event_type (event_type),
  KEY idx_source_type (source_type),
  KEY idx_processed (processed),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='百度商业 API 订阅推送事件表';