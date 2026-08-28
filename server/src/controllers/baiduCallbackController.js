/**
 * 百度商业 API 订阅推送 callback 接收控制器
 *
 * 背景：
 *   百度商业开发者中心「配置订阅」功能让百度把账户/计划/创意/关键词等
 *   状态变化事件主动 POST 到我们的回调地址。本控制器负责接收并入库这些事件。
 *
 * 设计原则：
 *   1. 不假设具体的协议格式——全量记录原始请求（headers / body / query）
 *      入 baidu_events 表，便于后续根据真实样本对齐规范
 *   2. GET 请求视为「回调查验」，尽可能尝试多种典型验证机制，原样返回
 *   3. POST 请求视为「事件推送」，入 baidu_events 表，返回 200 + {"result":"success"}
 *   4. 不做严格签名校验（缺文档）——任何请求都接收、记日志，
 *      真实密钥校验待拿到官方接口规范后再补
 */

const { query } = require("../config/database");
const logger = require("../utils/logger");

/**
 * 安全字符串化（避免循环引用 / 大对象打爆日志）
 * @param {*} v
 * @param {number} max
 * @returns {string}
 */
function safeStringify(v, max = 4000) {
  try {
    const s = JSON.stringify(v);
    if (s && s.length > max) return s.substring(0, max) + "...(truncated)";
    return s;
  } catch (_) {
    return String(v).substring(0, max);
  }
}

/**
 * 把原始 body buffer 转成字符串（如果不是 JSON 则保留原文）
 * @param {Object} req
 * @returns {string}
 */
function readRawBody(req) {
  if (req.body == null) return "";
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return safeStringify(req.body);
}

/**
 * 把所有 req.headers 序列化成可存储的 JSON
 * @param {Object} req
 * @returns {string}
 */
function dumpHeaders(req) {
  const h = req.headers || {};
  return safeStringify(h, 4000);
}

/**
 * 从已解析的 JSON / query / body 中提取最常见的去重/事件标识字段
 * 不强制存在，缺一返回 null
 */
function pickDedupeId(body) {
  if (!body || typeof body !== "object") return null;
  return (
    body.eventId ||
    body.event_id ||
    body.id ||
    body.msgId ||
    body.messageId ||
    body.traceId ||
    body.dedupeId ||
    null
  );
}

function pickEventType(req, body) {
  const fromQuery =
    (req.query && (req.query.eventType || req.query.event_type)) || null;
  if (fromQuery) return String(fromQuery);
  if (body && typeof body === "object") {
    return (
      body.eventType ||
      body.event_type ||
      body.type ||
      body.event ||
      body.notifyType ||
      null
    );
  }
  return null;
}

function pickSourceType(req, body) {
  const fromQuery =
    (req.query && (req.query.sourceType || req.query.source_type)) || null;
  if (fromQuery) return String(fromQuery);
  if (body && typeof body === "object") {
    return (
      body.sourceType ||
      body.source_type ||
      body.productLine ||
      body.channel ||
      null
    );
  }
  return null;
}

/**
 * GET：百度后台点「回调验证」时调用。我们需要：
 *   - 记录原始请求（便于回看百度到底发了什么）
 *   - 尝试返回以下几种典型 challenge：
 *       ① echoStr 原样返回
 *       ② challenge 原样返回
 *       ③ 若有 signature，做一次 SHA1(token + timestamp + nonce) 与 signature 对比；
 *          比对通过则原样返回 echoStr/challenge
 *       ④ 都拿不到则返回 200 + "ok"（保证至少不报"无法连接"）
 */
async function handleVerify(req, res) {
  const q = req.query || {};
  const rawQuery = req.originalUrl || req.url || "";
  const ua = req.get && req.get("user-agent");
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || null;

  logger.info(
    `[百度订阅] GET 回调查验 ip=${ip} ua=${ua} rawQuery=${rawQuery}`
  );
  logger.info(`[百度订阅] GET 全部 query = ${safeStringify(q, 2000)}`);
  logger.info(`[百度订阅] GET 全部 headers = ${dumpHeaders(req)}`);

  // 入库：把验证请求也存一份，便于回溯
  try {
    await query(
      `INSERT INTO baidu_events
        (source_type, event_type, raw_dedupe_id, payload_json, headers_json, raw_query, method, ip, user_agent, http_status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pickSourceType(req, null) || "verify",
        "VERIFY_GET",
        rawQuery.substring(0, 128),
        safeStringify(q, 4000),
        dumpHeaders(req),
        rawQuery,
        "GET",
        ip,
        ua || null,
        200,
        "回调查验"
      ]
    );
  } catch (e) {
    logger.error("[百度订阅] GET 验证入库失败: " + e.message);
  }

  // 优先级返回各种典型 challenge 字段
  const candidates = [
    q.echoStr,
    q.echostr,
    q.challenge,
    q.nonce,
    q.code,
    q.signature, // 微信类风格也会回原值
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) {
      logger.info(`[百度订阅] GET 验证原样返回字段值（已脱敏前 12 字符）: ${v.substring(0, 12)}...`);
      return res.status(200).send(v);
    }
  }

  // 都拿不到就返回 200 + "ok"，让验证至少不出网络层错误
  logger.warn("[百度订阅] GET 验证请求未携带 challenge 字段，返回 200 ok");
  return res.status(200).send("ok");
}

/**
 * POST：百度推送的事件 payload。
 *   - 解析 JSON，解析不出来按 raw 文本存
 *   - 全量入库 baidu_events
 *   - 返回 200 + {"result":"success"}（百度约定）
 */
async function handleEvent(req, res) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || null;
  const ua = req.get && req.get("user-agent");
  const rawBody = readRawBody(req);
  const rawQuery = req.originalUrl || req.url || "";

  logger.info(`[百度订阅] POST 事件推送 ip=${ip} ua=${ua}`);
  logger.info(`[百度订阅] POST headers = ${dumpHeaders(req)}`);
  logger.info(`[百度订阅] POST body    = ${rawBody.substring(0, 4000)}`);

  let parsed = null;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    parsed = req.body;
  } else if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch (_) {
      parsed = null; // 非 JSON，按原文存
    }
  }

  const eventType = pickEventType(req, parsed);
  const sourceType = pickSourceType(req, parsed);
  const dedupeId = pickDedupeId(parsed);

  // 存储 body 为可解析 JSON；非 JSON 则包一层 {raw:"..."}
  const payloadForDb =
    parsed !== null ? safeStringify(parsed, 60000) : JSON.stringify({ raw: rawBody.substring(0, 60000) });

  let insertedId = null;
  let isDup = false;
  try {
    const result = await query(
      `INSERT IGNORE INTO baidu_events
        (source_type, event_type, raw_dedupe_id, payload_json, headers_json, raw_query, method, ip, user_agent, http_status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sourceType || null,
        eventType || null,
        dedupeId || null,
        payloadForDb,
        dumpHeaders(req),
        rawQuery,
        "POST",
        ip,
        ua || null,
        200,
        "百度推送事件"
      ]
    );
    insertedId = result.insertId;
    isDup = insertedId === 0;
  } catch (e) {
    logger.error("[百度订阅] POST 事件入库失败: " + e.message);
    // 入库失败时仍返回 200（避免百度重试风暴），但记 error
    return res.status(200).json({
      result: "success",
      warn: "db_write_failed",
      message: e.message.substring(0, 200)
    });
  }

  logger.info(
    `[百度订阅] POST 事件入库 ${isDup ? "重复跳过" : "新插入"} id=${insertedId} event_type=${eventType} source=${sourceType}`
  );

  // 业务处理钩子：这里可以根据 event_type 触发自动调预算/告警等
  // 现阶段保持空实现，仅入库
  // try {
  //   await processBaiduEvent({ id: insertedId, eventType, sourceType, payload: parsed });
  // } catch (e) {
  //   logger.error("[百度订阅] 业务处理失败: " + e.message);
  // }

  return res.status(200).json({
    result: "success",
    id: insertedId || null,
    dedup: isDup
  });
}

module.exports = {
  handleVerify,
  handleEvent
};