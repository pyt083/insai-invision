-- 试用申请表新增字段迁移脚本
-- 执行时间: 2026-08-26
-- 用途: 为 trial_applications 表增加咨询方向、微信号、希望联系渠道、预计预算、咨询内容字段
-- 并将联系邮箱从可空改为非空（已有数据如为空，需先补充或确认）
--
-- 注意：请根据实际数据库名称调整 USE 语句。当前生产环境使用 `invision`，开发环境示例使用 `homepage`。

USE `invision`;
-- USE `homepage`;

-- 新增咨询方向
ALTER TABLE `trial_applications`
  ADD COLUMN `consultation_direction` VARCHAR(64) DEFAULT NULL COMMENT '咨询方向' AFTER `contact_email`;

-- 新增微信号
ALTER TABLE `trial_applications`
  ADD COLUMN `wechat_id` VARCHAR(64) DEFAULT NULL COMMENT '微信号' AFTER `consultation_direction`;

-- 新增希望联系渠道
ALTER TABLE `trial_applications`
  ADD COLUMN `preferred_contact_channel` VARCHAR(32) DEFAULT NULL COMMENT '希望联系渠道' AFTER `wechat_id`;

-- 新增预计预算
ALTER TABLE `trial_applications`
  ADD COLUMN `estimated_budget` VARCHAR(128) DEFAULT NULL COMMENT '预计预算' AFTER `preferred_contact_channel`;

-- 新增咨询内容
ALTER TABLE `trial_applications`
  ADD COLUMN `consultation_content` TEXT DEFAULT NULL COMMENT '咨询内容' AFTER `business_scenario`;

-- 将联系邮箱改为非空（仅对新增数据生效；旧数据保持原值）
-- 注意：如果表中已有 contact_email 为 NULL 的记录，以下语句会失败。
-- 如需兼容，可先用 UPDATE trial_applications SET contact_email = '' WHERE contact_email IS NULL; 填充空值。
ALTER TABLE `trial_applications`
  MODIFY COLUMN `contact_email` VARCHAR(128) NOT NULL COMMENT '联系邮箱';

-- 可选：为常用查询字段添加索引
ALTER TABLE `trial_applications`
  ADD INDEX `idx_consultation_direction` (`consultation_direction`),
  ADD INDEX `idx_preferred_contact_channel` (`preferred_contact_channel`);
