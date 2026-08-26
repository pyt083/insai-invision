-- 试用申请表删除字段迁移脚本
-- 执行时间: 2026-08-26
-- 用途: 从 trial_applications 表移除不再收集的字段
--        微信号、希望联系渠道、预计预算、业务场景

USE `invision`;

ALTER TABLE `trial_applications`
  DROP COLUMN `wechat_id`,
  DROP COLUMN `preferred_contact_channel`,
  DROP COLUMN `estimated_budget`,
  DROP COLUMN `business_scenario`;
