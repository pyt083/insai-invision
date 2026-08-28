-- 试用申请表新增字段迁移脚本
-- 执行时间: 2026-08-27
-- 用途: 为 trial_applications 表增加 landing_url 字段
-- 背景: 百度营销 oCPC 转化追踪需要把用户真实落地页 URL（含 bd_vid 点击标识）落库，
--       供提交时上报 newType=3、后台标记意向时上报 newType=75 做归因。
--
-- 注意：请根据实际数据库名称调整 USE 语句。当前生产环境使用 `invision`。

USE `invision`;
-- USE `homepage`;

-- 新增落地页 URL（含 bd_vid）
ALTER TABLE `trial_applications`
  ADD COLUMN `landing_url` VARCHAR(1024) DEFAULT NULL COMMENT '百度广告落地页URL(含bd_vid)' AFTER `source_page`;

-- 可选：为 bd_vid 归因查询建索引（landing_url 为长文本，前缀索引便于 LIKE 匹配）
ALTER TABLE `trial_applications`
  ADD INDEX `idx_landing_url` (`landing_url`(255));
