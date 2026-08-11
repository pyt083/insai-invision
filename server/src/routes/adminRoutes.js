/**
 * Admin 路由定义
 * 所有 admin API 需要通过 adminAuth 中间件认证
 */

const express = require("express");
const router = express.Router();

const adminAuth = require("../middleware/adminAuth");
const adminController = require("../controllers/adminController");

// 所有 admin 路由都需要认证
router.use(adminAuth);

/**
 * GET /api/admin/trial/list
 * 分页查询试用申请列表（支持搜索、筛选、排序）
 */
router.get("/trial/list", adminController.list);

/**
 * GET /api/admin/trial/stats
 * 统计概览数据（总数、今日、待处理、行业分布、7天趋势等）
 */
router.get("/trial/stats", adminController.stats);

/**
 * GET /api/admin/trial/export
 * 导出全部数据为 CSV
 */
router.get("/trial/export", adminController.exportCsv);

/**
 * GET /api/admin/trial/:id
 * 获取单条记录详情
 */
router.get("/trial/:id", adminController.detail);

/**
 * PUT /api/admin/trial/:id/status
 * 更新申请状态
 * Body: { "status": "pending|contacted|approved|rejected" }
 */
router.put("/trial/:id/status", adminController.updateStatus);

module.exports = router;
