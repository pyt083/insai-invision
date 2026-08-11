/**
 * Express 应用入口
 * 加载中间件、注册路由、启动服务
 */

require("dotenv").config();

const express = require("express");
const corsMiddleware = require("./middleware/cors");
const trialRoutes = require("./routes/trialRoutes");
const logger = require("./utils/logger");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3900;

// ---- 中间件注册 ----
// JSON 解析
app.use(express.json({ limit: "256kb" }));

// URL 编码解析（兼容 form-data）
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// CORS 中间件
app.use(corsMiddleware);

// 请求日志
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// ---- 路由注册 ----
// 试用申请路由
app.use("/api/trial", trialRoutes);

// 健康检查
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "insai-trial-api",
    timestamp: new Date().toISOString()
  });
});

// 404 处理
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "接口不存在"
  });
});

// 全局错误处理
app.use((err, _req, res, _next) => {
  logger.error("未捕获错误: " + err.message);
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    message: "服务器内部错误，请稍后重试"
  });
});

// ---- 启动服务 ----
app.listen(PORT, () => {
  logger.info(`智影试用申请 API 服务已启动`);
  logger.info(`监听端口: ${PORT}`);
  logger.info(`环境: ${process.env.NODE_ENV || "development"}`);
  logger.info(`健康检查: http://localhost:${PORT}/health`);
});

module.exports = app;
