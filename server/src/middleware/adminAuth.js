/**
 * Admin 认证中间件
 * 通过 Authorization: Bearer <token> 验证请求
 * token 从环境变量 ADMIN_TOKEN 读取
 */

const logger = require("../utils/logger");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "insai_admin_2026";

/**
 * 验证 admin 请求的 token
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "未提供认证信息"
    });
  }

  // 支持 "Bearer <token>" 格式
  const parts = authHeader.split(" ");
  let token;

  if (parts.length === 2 && parts[0] === "Bearer") {
    token = parts[1];
  } else {
    token = authHeader; // 直接传 token
  }

  if (token !== ADMIN_TOKEN) {
    logger.warn(`Admin 认证失败: IP=${req.ip}, token=${token.substring(0, 8)}...`);
    return res.status(403).json({
      success: false,
      message: "认证失败，无权访问"
    });
  }

  next();
}

module.exports = adminAuth;
