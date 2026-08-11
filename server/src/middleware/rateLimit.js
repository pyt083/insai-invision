/**
 * IP 限频中间件
 * 基于内存 Map<ip, timestamp[]> 实现
 * 每分钟最多 RATE_LIMIT_MAX 次请求，超出返回 429
 * 包含过期记录清理逻辑（每 5 分钟清理一次）
 */

const logger = require("../utils/logger");

// 从环境变量读取配置
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX, 10) || 5;
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000; // 默认 1 分钟
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟清理一次

// 内存存储: Map<ip, timestamp[]>
const ipRequests = new Map();

logger.info(`限频配置: 每IP每${WINDOW_MS / 1000}秒最多${MAX_REQUESTS}次请求`);

/**
 * 清理过期的请求记录
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  let cleaned = 0;

  for (const [ip, timestamps] of ipRequests.entries()) {
    // 过滤掉窗口外的过期时间戳
    const validTimestamps = timestamps.filter((ts) => now - ts < WINDOW_MS);

    if (validTimestamps.length === 0) {
      ipRequests.delete(ip);
      cleaned++;
    } else if (validTimestamps.length !== timestamps.length) {
      ipRequests.set(ip, validTimestamps);
    }
  }

  if (cleaned > 0) {
    logger.debug(`限频清理: 移除 ${cleaned} 个过期IP记录`);
  }
}

// 定时清理
setInterval(cleanupExpiredRecords, CLEANUP_INTERVAL_MS);

/**
 * 限频中间件函数
 */
function rateLimitMiddleware(req, res, next) {
  // 获取客户端 IP（处理代理情况）
  const ip =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";

  // 清理 X-Forwarded-For 中的多个 IP，取第一个
  const clientIp = String(ip).split(",")[0].trim();

  const now = Date.now();

  // 获取该 IP 的请求时间戳列表
  let timestamps = ipRequests.get(clientIp);

  if (!timestamps) {
    timestamps = [];
    ipRequests.set(clientIp, timestamps);
  }

  // 过滤掉窗口外的过期时间戳
  timestamps = timestamps.filter((ts) => now - ts < WINDOW_MS);

  // 检查是否超出限制
  if (timestamps.length >= MAX_REQUESTS) {
    logger.warn(`限频触发: IP ${clientIp} 在 ${WINDOW_MS / 1000}秒内请求 ${timestamps.length + 1} 次，超出限制 ${MAX_REQUESTS}`);
    return res.status(429).json({
      success: false,
      message: "提交过于频繁，请稍后再试"
    });
  }

  // 记录本次请求时间戳
  timestamps.push(now);
  ipRequests.set(clientIp, timestamps);

  next();
}

module.exports = rateLimitMiddleware;
