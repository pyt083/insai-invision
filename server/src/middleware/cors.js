/**
 * CORS 中间件
 * 从 .env 读取 CORS_ORIGINS（逗号分隔），支持通配符匹配
 * 如 *.insai.cn 匹配 invision.insai.cn、insai.cn 等
 */

const logger = require("../utils/logger");

// 从环境变量读取允许的来源列表
const rawOrigins = process.env.CORS_ORIGINS || "*";
const allowedOrigins = rawOrigins
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

logger.info(`CORS 允许来源: ${allowedOrigins.join(", ")}`);

/**
 * 检查 origin 是否匹配允许列表中的某个模式
 * 支持通配符匹配，如 *.insai.cn 匹配 invision.insai.cn 和 insai.cn
 * @param {string} origin - 请求来源
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin) {
    return false;
  }

  // 如果允许列表包含 *，则允许所有来源
  if (allowedOrigins.includes("*")) {
    return true;
  }

  for (const pattern of allowedOrigins) {
    // 精确匹配
    if (pattern === origin) {
      return true;
    }

    // 通配符匹配: *.example.com
    if (pattern.startsWith("*.")) {
      const domain = pattern.slice(2); // example.com
      // 匹配 example.com 或 *.example.com
      if (origin === domain || origin.endsWith("." + domain)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * CORS 中间件函数
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // 设置 CORS 响应头
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400"); // 24h 缓存预检结果

  // 处理 OPTIONS 预检请求
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

module.exports = corsMiddleware;
