/**
 * 百度营销 - 线索 API（oCPC 转化追踪服务端上报）
 *
 * 上报链路:
 *   浏览器 → /api/trial/submit → Express 写入 MySQL
 *                          ↓
 *                  baiduConvert.reportTrialFormSubmit(req)
 *                          ↓
 *                POST https://ocpc.baidu.com/ocpcapi/api/uploadConvertData
 *
 * 文档: https://dev2.baidu.com/content?sceneType=0&pageId=101211&nodeId=658
 *
 * 设计要点:
 *   1. 与主线业务解耦：失败仅记日志，不影响 HTTP 响应
 *   2. 自带 3 秒超时 + 单次请求（业务侧可在外层做重试）
 *   3. 仅在请求中检测到百度点击标识 bd_vid 时上报，避免自然流量污染转化数据
 *   4. token 通过环境变量 BAIDU_CONVERT_TOKEN 注入（不要硬编码）
 */

const https = require("https");
const logger = require("./logger");

// 百度线索 API 端点（固定）
const BAIDU_CONVERT_URL = "https://ocpc.baidu.com/ocpcapi/api/uploadConvertData";

// 从环境变量读取 token，单一来源
const BAIDU_CONVERT_TOKEN = process.env.BAIDU_CONVERT_TOKEN || "";

// 新版字段：newType（取代旧版 convertType）。编码表见：
// https://dev2.baidu.com/content?sceneType=0&pageId=101207&nodeId=655
const NEW_TYPE = {
  CONSULT_CLICK: 1,            // 咨询按钮点击
  PHONE_CLICK: 2,              // 电话按钮点击
  FORM_SUBMIT_SUCCESS: 3,      // 表单提交成功 ★ 主用
  FORM_BUTTON_CLICK: 5,        // 表单按钮点击
  DOWNLOAD_CLICK: 6,
  BUY_CLICK: 7,
  KEY_PAGE_VIEW: 20,           // 关键页面浏览
  REGISTER: 25,                // 注册
  USER_DEFINED: 27,            // 客户自定义
  LOGIN: 49,                   // 登录（注册激活后登录）
  CONTACT_PHONE_CONNECT: 73,   // 回访-电话接通
  INFO_CONFIRM: 74,            // 回访-信息确认
  INTENT_DISCOVERED: 75,       // 回访-发现意向 ★ 主用
  HIGH_POTENTIAL: 76,          // 回访-高潜成交
  CLOSED_DEAL: 77              // 回访-成单客户
};

/**
 * 上报单条转化数据到百度营销后台
 * @param {Object} opts
 * @param {string} opts.logidUrl  - 含 bd_vid 的落地页 URL
 * @param {number} opts.newType   - 转化类型编码
 * @param {number} [opts.convertTime] - Unix 秒级时间戳，不传则取当前时间
 * @param {number} [opts.isConvert=1] - 1=转化, 0=未转化
 * @param {string} [opts.outerEventId] - 用户自定义行为 ID，用于转化去重
 *   （文档：接入方式+行为类型 newType+广告 id bd_vid+outerEventId 一致时去重生效）
 * @returns {Promise<boolean>}
 */
function reportConvert({ logidUrl, newType, convertTime, isConvert = 1, outerEventId }) {
  if (!BAIDU_CONVERT_TOKEN) {
    logger.warn("BAIDU_CONVERT_TOKEN 未配置，跳过百度线索 API 上报");
    return Promise.resolve(false);
  }
  if (!logidUrl || !newType) {
    logger.warn("reportConvert 缺少必填参数，跳过上报");
    return Promise.resolve(false);
  }

  const item = {
    logidUrl,
    newType,
    convertTime: convertTime || Math.floor(Date.now() / 1000),
    isConvert
  };
  // outerEventId 用于去重：同一记录重复上报时百度不重复计转化
  if (outerEventId) {
    item.outerEventId = String(outerEventId);
  }

  const payload = {
    token: BAIDU_CONVERT_TOKEN,
    conversionTypes: [item]
  };

  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    let settled = false;
    const settle = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const req = https.request(
      {
        hostname: "ocpc.baidu.com",
        port: 443,
        path: "/ocpcapi/api/uploadConvertData",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 3000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          try {
            const data = JSON.parse(text);
            const status = data && data.header && data.header.status;
            if (status === 0 || status === 1) {
              logger.info(
                `百度线索 API 上报成功 newType=${newType} logidUrl=${String(logidUrl).substring(0, 300)} status=${status}`
              );
              settle(true);
            } else {
              logger.warn(
                `百度线索 API 上报失败 newType=${newType} logidUrl=${String(logidUrl).substring(0, 300)} status=${status} resp=${text.substring(0, 200)}`
              );
              settle(false);
            }
          } catch (e) {
            logger.error(`百度线索 API 响应解析失败: ${e.message} raw=${text.substring(0, 200)}`);
            settle(false);
          }
        });
      }
    );

    req.on("error", (err) => {
      logger.error(`百度线索 API 请求失败 newType=${newType}: ${err.message}`);
      settle(false);
    });
    req.on("timeout", () => {
      logger.error(`百度线索 API 请求超时 newType=${newType}`);
      try {
        req.destroy();
      } catch (_) {}
      settle(false);
    });

    req.write(body);
    req.end();
  });
}

/**
 * 从 URL 字符串中提取 bd_vid（百度广告 clickid）
 * @param {string} url
 * @returns {string|null}
 */
function extractBdVidFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const vid = u.searchParams.get("bd_vid");
    if (vid) return vid;
  } catch (_) {
    // URL 解析失败，回退到正则
  }
  const m = String(url).match(/[?&]bd_vid=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch (_) {
      return m[1];
    }
  }
  return null;
}

/**
 * 从 Express req 对象中提取 bd_vid（百度广告 clickid）。
 * 1) 优先 req.body.landing_url（前端透传的完整落地页 URL，从中解析）
 * 2) 其次 req.body.bd_vid（POST 表单的 hidden field）
 * 3) 再次 req.query.bd_vid（URL ?bd_vid=xxx）
 * 4) 最后 referer 头中的 query 字符串
 * @param {Object} req
 * @returns {string|null}
 */
function extractBdVid(req) {
  if (!req) return null;

  // 0) landing_url 字段（前端透传的完整落地页 URL，含 bd_vid，优先度最高）
  if (req.body && typeof req.body.landing_url === "string" && req.body.landing_url.trim()) {
    const vid = extractBdVidFromUrl(req.body.landing_url);
    if (vid) return vid;
  }
  // 1) body 字段（POST 表单 hidden field，trial form 提交时最常见）
  if (req.body && typeof req.body.bd_vid === "string" && req.body.bd_vid.trim()) {
    return req.body.bd_vid.trim();
  }
  // 2) query 字段（URL ?bd_vid=xxx）
  if (req.query && typeof req.query.bd_vid === "string" && req.query.bd_vid.trim()) {
    return req.query.bd_vid.trim();
  }
  // 3) referer 头中的 query 字符串
  const headers = req.headers || {};
  const ref =
    (req.get && (req.get("referer") || req.get("referrer"))) ||
    headers.referer ||
    headers.referrer;
  if (!ref) return null;

  const vid = extractBdVidFromUrl(ref);
  return vid || null;
}

/**
 * 推断落地页 URL（用于上报到百度的 logidUrl）
 * 优先使用前端透传的用户真实落地页 URL（landing_url），保证与百度点击落地页一致；
 * 缺失时按请求重建（host + path + bd_vid）。
 * @param {Object} req
 * @param {string} [path="/trial/"] 可显式指定，如 /trial/、/product-intro/
 */
function buildLogidUrl(req, path = "/trial/") {
  // 1) 前端透传的完整落地页 URL（含 bd_vid，最准确）
  const landingUrl =
    req && req.body && typeof req.body.landing_url === "string" ? req.body.landing_url.trim() : "";
  if (landingUrl && /^https?:\/\//i.test(landingUrl)) {
    if (extractBdVidFromUrl(landingUrl)) {
      return landingUrl;
    }
    // landing_url 存在但不含 bd_vid：尝试从其他途径提取 bd_vid 后补上
    const bdVid = extractBdVid(req);
    if (bdVid) {
      const sep = landingUrl.includes("?") ? "&" : "?";
      return `${landingUrl}${sep}bd_vid=${encodeURIComponent(bdVid)}`;
    }
    return landingUrl;
  }

  // 2) 回退：按请求重建（host 走代理头，协议优先 x-forwarded-proto，兜底 https）
  const headers = req && req.headers;
  const host = (req && req.get && req.get("host")) || (headers && headers.host) || "invision.insai.cn";
  const xfProto =
    (req && req.get && req.get("x-forwarded-proto")) || (headers && headers["x-forwarded-proto"]);
  const protocol = xfProto ? xfProto.split(",")[0].trim() : "https";
  const bdVid = extractBdVid(req);
  const base = `${protocol}://${host}${path}`;
  return bdVid ? `${base}?bd_vid=${encodeURIComponent(bdVid)}` : base;
}

/**
 * 试用表单提交成功后调用：上报 newType=3（表单提交成功）
 * 无 bd_vid 时静默不上报（自然流量），仅记日志。
 * 调用方应使用 .catch / 不 await，避免阻塞响应。
 * @param {Object} req
 * @param {Object} [record] - 刚写入的 trial_applications 记录（至少含 id，用于 outerEventId 去重）
 */
function reportTrialFormSubmit(req, record) {
  const bdVid = extractBdVid(req);
  if (!bdVid) {
    logger.info("未检测到 bd_vid，跳过百度线索 API 上报（自然流量，不上报转化）");
    return Promise.resolve(false);
  }
  const logidUrl = buildLogidUrl(req, "/trial/");
  const recId = record && record.id;
  return reportConvert({
    logidUrl,
    newType: NEW_TYPE.FORM_SUBMIT_SUCCESS,
    outerEventId: recId ? `trial_${recId}` : undefined
  });
}

/**
 * 销售标记"回访-发现意向"时调用：上报 newType=75
 * 优先使用数据库记录中的落地页 URL（landing_url，含 bd_vid）——因为后台操作员的
 * 请求本身不带用户点击的 bd_vid，必须依赖提交时落库的 landing_url。
 * @param {Object} req - admin 请求对象（兜底用，含 query/referer）
 * @param {Object} [record] - trial_applications 记录（含 landing_url / bd_vid）
 * @returns {Promise<boolean>}
 */
function reportIntentDiscovered(req, record) {
  const rec = record || {};
  const recLanding =
    typeof rec.landing_url === "string" && rec.landing_url.trim() ? rec.landing_url.trim() : "";
  const recBdVid =
    typeof rec.bd_vid === "string" && rec.bd_vid.trim() ? rec.bd_vid.trim() : "";

  let logidUrl = "";
  if (/^https?:\/\//i.test(recLanding)) {
    logidUrl = recLanding;
  } else {
    logidUrl = buildLogidUrl(req, "/trial/");
  }

  const bdVid = extractBdVidFromUrl(logidUrl) || recBdVid || extractBdVid(req);
  if (!bdVid) {
    logger.warn("报告意向但未检测到 bd_vid，跳过上报（建议在百度统计页面核对来源链接）");
    return Promise.resolve(false);
  }
  if (!/[?&]bd_vid=/.test(logidUrl)) {
    const sep = logidUrl.includes("?") ? "&" : "?";
    logidUrl = `${logidUrl}${sep}bd_vid=${encodeURIComponent(bdVid)}`;
  }
  return reportConvert({
    logidUrl,
    newType: NEW_TYPE.INTENT_DISCOVERED,
    // 用记录 id 去重：同一申请重复标记意向时不重复计转化
    outerEventId: rec.id ? `intent_${rec.id}` : undefined
  });
}

/**
 * 健康检查：当前是否已配置 token
 */
function isConfigured() {
  return Boolean(BAIDU_CONVERT_TOKEN);
}

module.exports = {
  BAIDU_CONVERT_URL,
  NEW_TYPE,
  reportConvert,
  extractBdVid,
  extractBdVidFromUrl,
  buildLogidUrl,
  reportTrialFormSubmit,
  reportIntentDiscovered,
  isConfigured
};
