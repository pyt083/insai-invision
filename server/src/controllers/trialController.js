/**
 * 试用申请控制器
 * 处理表单提交核心业务逻辑
 */

const { pool, query } = require("../config/database");
const logger = require("../utils/logger");

/**
 * 从请求体收集表单数据
 * 多选数组字段 join(',') 转为逗号分隔字符串存储
 * @param {Object} body - req.body
 * @param {Object} req - Express request 对象（用于获取 IP 和 UA）
 * @returns {Object} 整理后的数据对象
 */
function collectFormData(body, req) {
  const now = new Date().toISOString();

  // 多选数组转逗号分隔字符串
  const videoDemand = Array.isArray(body.video_demand)
    ? body.video_demand.join(",")
    : body.video_demand || null;

  const referralSource = Array.isArray(body.referral_source)
    ? body.referral_source.join(",")
    : body.referral_source || null;

  return {
    company: body.company || "",
    industry: body.industry || "",
    contact_name: body.contact_name || "",
    contact_phone: body.contact_phone || "",
    contact_email: body.contact_email || null,
    business_scenario: body.business_scenario || null,
    video_demand: videoDemand,
    referral_source: referralSource,
    source_page: body.source_page || null,
    source_ip: req.ip || req.connection.remoteAddress || null,
    user_agent: req.headers["user-agent"] || null,
    status: "pending",
    created_at: now,
    updated_at: null
  };
}

/**
 * 检查 24h 内是否有同手机号的重复申请
 * @param {string} phone - 手机号
 * @returns {Promise<boolean>} true 表示存在重复
 */
async function checkDuplicate(phone) {
  // 计算 24 小前的时间（ISO 8601）
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const sql =
    "SELECT COUNT(*) as cnt FROM trial_applications WHERE contact_phone = ? AND created_at > ?";
  const rows = await query(sql, [phone, twentyFourHoursAgo]);

  return rows[0] && rows[0].cnt > 0;
}

/**
 * 保存申请记录到数据库
 * @param {Object} data - 整理后的表单数据
 * @returns {Promise<number>} 插入记录的 ID
 */
async function saveApplication(data) {
  const sql = `
    INSERT INTO trial_applications
      (company, industry, contact_name, contact_phone, contact_email,
       business_scenario, video_demand, referral_source, source_page,
       source_ip, user_agent, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.company,
    data.industry,
    data.contact_name,
    data.contact_phone,
    data.contact_email,
    data.business_scenario,
    data.video_demand,
    data.referral_source,
    data.source_page,
    data.source_ip,
    data.user_agent,
    data.status,
    data.created_at,
    data.updated_at
  ];

  const result = await query(sql, params);
  return result.insertId;
}

/**
 * 提交试用申请
 * POST /api/trial/submit
 *
 * 流程:
 * 1. 收集表单数据
 * 2. 查询 24h 内同手机号记录
 * 3. 若重复返回 409
 * 4. 否则 INSERT 记录
 * 5. 成功返回 200
 */
async function submit(req, res) {
  try {
    // 1. 收集表单数据
    const data = collectFormData(req.body, req);

    logger.info(
      `收到试用申请: company=${data.company}, phone=${data.contact_phone}, source=${data.source_page}`
    );

    // 2. 检查 24h 内重复提交
    const isDuplicate = await checkDuplicate(data.contact_phone);

    if (isDuplicate) {
      logger.info(`重复提交拦截: phone=${data.contact_phone}`);
      return res.status(409).json({
        success: false,
        message: "该手机号24小时内已提交过申请，请勿重复提交"
      });
    }

    // 3. 保存到数据库
    const insertId = await saveApplication(data);

    logger.info(`申请保存成功: id=${insertId}, phone=${data.contact_phone}`);

    // 4. 返回成功
    return res.status(200).json({
      success: true,
      message: "申请提交成功"
    });
  } catch (error) {
    logger.error("试用申请提交失败: " + error.message);
    logger.error(error.stack);

    return res.status(500).json({
      success: false,
      message: "服务器内部错误，请稍后重试"
    });
  }
}

module.exports = {
  submit,
  collectFormData,
  checkDuplicate,
  saveApplication
};
