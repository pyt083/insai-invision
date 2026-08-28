/**
 * 百度商业 API 订阅推送 callback 路由
 *
 * 路由：
 *   GET  /api/baidu/callback   百度后台点「回调验证」时的回调查验
 *   POST /api/baidu/callback   百度推送的事件 payload
 *
 * 不挂 IP 限频（百度服务器 IP 不固定，限频会拦截真实事件）
 * 不挂业务校验中间件（事件格式未对齐，先全量接收）
 *
 * body 解析由 app.js 全局中间件统一负责（express.json + express.urlencoded）
 * 这里只覆盖一种额外的 content-type：text/plain（百度偶尔发纯文本）
 */

const express = require("express");
const router = express.Router();

const baiduCallbackController = require("../controllers/baiduCallbackController");

// 兜底：百度若发送 text/plain 或 application/xml
router.use(
  express.text({
    type: ["text/plain", "application/xml"],
    limit: "1mb"
  })
);

router.get("/", baiduCallbackController.handleVerify);
router.post("/", baiduCallbackController.handleEvent);

module.exports = router;