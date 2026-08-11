/**
 * 试用申请路由定义
 * POST /api/trial/submit
 */

const express = require("express");
const router = express.Router();

const rateLimitMiddleware = require("../middleware/rateLimit");
const { trialValidationRules, handleValidationErrors } = require("../validators/trialValidator");
const trialController = require("../controllers/trialController");

/**
 * POST /api/trial/submit
 * 提交试用申请
 *
 * 中间件链:
 * 1. rateLimitMiddleware - IP 限频（仅对 submit 路由生效，不影响 /health 等）
 * 2. trialValidationRules - express-validator 参数校验
 * 3. handleValidationErrors - 收集校验错误，有错误则返回 400
 * 4. trialController.submit - 业务逻辑处理
 */
router.post("/submit", rateLimitMiddleware, trialValidationRules, handleValidationErrors, trialController.submit);

module.exports = router;
