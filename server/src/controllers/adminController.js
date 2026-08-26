/**
 * Admin 控制器
 * 处理试用申请数据的查询、统计、导出、状态管理
 */

const { query } = require("../config/database");
const logger = require("../utils/logger");

/**
 * GET /api/admin/trial/list
 * 分页查询试用申请列表
 *
 * Query params:
 *   page     - 页码，默认 1
 *   pageSize - 每页条数，默认 20
 *   search   - 搜索关键词（公司名/联系人/手机号）
 *   industry - 行业筛选
 *   status   - 状态筛选
 *   startDate - 开始日期 (YYYY-MM-DD)
 *   endDate   - 结束日期 (YYYY-MM-DD)
 *   sort     - 排序字段，默认 created_at
 *   order    - 排序方向，默认 DESC
 */
async function list(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const search = req.query.search?.trim() || "";
    const industry = req.query.industry?.trim() || "";
    const status = req.query.status?.trim() || "";
    const startDate = req.query.startDate?.trim() || "";
    const endDate = req.query.endDate?.trim() || "";
    const sortField = ["id", "company", "industry", "contact_name", "contact_phone", "contact_email", "consultation_direction",
      "preferred_contact_channel", "created_at", "status"]
      .includes(req.query.sort) ? req.query.sort : "created_at";
    const sortOrder = req.query.order?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    // 构建 WHERE 条件
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(company LIKE ? OR contact_name LIKE ? OR contact_phone LIKE ? OR contact_email LIKE ? OR wechat_id LIKE ? OR consultation_content LIKE ?)");
      const kw = `%${search}%`;
      params.push(kw, kw, kw, kw, kw, kw);
    }

    if (industry) {
      conditions.push("industry = ?");
      params.push(industry);
    }

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    if (startDate) {
      conditions.push("created_at >= ?");
      params.push(startDate + "T00:00:00");
    }

    if (endDate) {
      conditions.push("created_at <= ?");
      params.push(endDate + "T23:59:59");
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM trial_applications ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;

    // 查询数据
    const dataSql = `SELECT * FROM trial_applications ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    const dataParams = [...params, pageSize, offset];
    const rows = await query(dataSql, dataParams);

    // 格式化数据
    const formattedRows = rows.map(row => ({
      ...row,
      created_at_formatted: formatDateTime(row.created_at),
      video_demand_list: row.video_demand ? row.video_demand.split(",") : [],
      referral_source_list: row.referral_source ? row.referral_source.split(",") : []
    }));

    return res.json({
      success: true,
      data: formattedRows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    logger.error("Admin 查询列表失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "查询失败: " + error.message
    });
  }
}

/**
 * GET /api/admin/trial/stats
 * 统计概览数据
 */
async function stats(req, res) {
  try {
    // 总数
    const totalResult = await query("SELECT COUNT(*) as count FROM trial_applications");
    const total = totalResult[0]?.count || 0;

    // 今日新增
    const today = new Date().toISOString().split("T")[0];
    const todayResult = await query(
      "SELECT COUNT(*) as count FROM trial_applications WHERE created_at >= ?",
      [today + "T00:00:00"]
    );
    const todayCount = todayResult[0]?.count || 0;

    // 待处理
    const pendingResult = await query(
      "SELECT COUNT(*) as count FROM trial_applications WHERE status = ?",
      ["pending"]
    );
    const pendingCount = pendingResult[0]?.count || 0;

    // 已处理
    const processedResult = await query(
      "SELECT COUNT(*) as count FROM trial_applications WHERE status != ?",
      ["pending"]
    );
    const processedCount = processedResult[0]?.count || 0;

    // 按行业统计
    const industryStats = await query(
      "SELECT industry, COUNT(*) as count FROM trial_applications GROUP BY industry ORDER BY count DESC"
    );

    // 按状态统计
    const statusStats = await query(
      "SELECT status, COUNT(*) as count FROM trial_applications GROUP BY status ORDER BY count DESC"
    );

    // 最近7天趋势
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const trendStats = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM trial_applications
       WHERE created_at >= ?
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [sevenDaysAgo + "T00:00:00"]
    );

    // 按来源页面统计
    const sourceStats = await query(
      "SELECT source_page, COUNT(*) as count FROM trial_applications GROUP BY source_page ORDER BY count DESC"
    );

    return res.json({
      success: true,
      data: {
        total,
        today: todayCount,
        pending: pendingCount,
        processed: processedCount,
        byIndustry: industryStats,
        byStatus: statusStats,
        bySource: sourceStats,
        trend7days: trendStats
      }
    });
  } catch (error) {
    logger.error("Admin 统计查询失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "统计查询失败: " + error.message
    });
  }
}

/**
 * GET /api/admin/trial/export
 * 导出 CSV
 */
async function exportCsv(req, res) {
  try {
    const rows = await query("SELECT * FROM trial_applications ORDER BY created_at DESC");

    const headers = [
      "ID", "公司/品牌", "行业", "联系人", "手机号", "邮箱",
      "咨询方向", "微信号", "希望联系渠道", "预计预算",
      "业务场景", "咨询内容", "视频需求", "了解渠道", "来源页面",
      "IP", "状态", "提交时间"
    ];

    const csvLines = [headers.join(",")];

    for (const row of rows) {
      const line = [
        row.id,
        escapeCsv(row.company),
        escapeCsv(row.industry),
        escapeCsv(row.contact_name),
        escapeCsv(row.contact_phone),
        escapeCsv(row.contact_email || ""),
        escapeCsv(row.consultation_direction || ""),
        escapeCsv(row.wechat_id || ""),
        escapeCsv(row.preferred_contact_channel || ""),
        escapeCsv(row.estimated_budget || ""),
        escapeCsv(row.business_scenario || ""),
        escapeCsv(row.consultation_content || ""),
        escapeCsv(row.video_demand || ""),
        escapeCsv(row.referral_source || ""),
        escapeCsv(row.source_page || ""),
        escapeCsv(row.source_ip || ""),
        escapeCsv(row.status),
        escapeCsv(row.created_at)
      ].join(",");
      csvLines.push(line);
    }

    const csv = "\uFEFF" + csvLines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=trial_applications.csv");
    return res.send(csv);
  } catch (error) {
    logger.error("Admin 导出失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "导出失败: " + error.message
    });
  }
}

/**
 * PUT /api/admin/trial/:id/status
 * 更新申请状态
 */
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "contacted", "approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `状态必须是: ${validStatuses.join(", ")}`
      });
    }

    const result = await query(
      "UPDATE trial_applications SET status = ?, updated_at = ? WHERE id = ?",
      [status, new Date().toISOString(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "记录不存在"
      });
    }

    logger.info(`Admin 更新状态: id=${id}, status=${status}`);

    return res.json({
      success: true,
      message: "状态更新成功"
    });
  } catch (error) {
    logger.error("Admin 更新状态失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "更新失败: " + error.message
    });
  }
}

/**
 * GET /api/admin/trial/:id
 * 获取单条记录详情
 */
async function detail(req, res) {
  try {
    const { id } = req.params;
    const rows = await query("SELECT * FROM trial_applications WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "记录不存在"
      });
    }

    const row = rows[0];
    row.created_at_formatted = formatDateTime(row.created_at);
    row.updated_at_formatted = row.updated_at ? formatDateTime(row.updated_at) : null;
    row.video_demand_list = row.video_demand ? row.video_demand.split(",") : [];
    row.referral_source_list = row.referral_source ? row.referral_source.split(",") : [];

    return res.json({
      success: true,
      data: row
    });
  } catch (error) {
    logger.error("Admin 查询详情失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "查询失败: " + error.message
    });
  }
}

/**
 * DELETE /api/admin/trial/:id
 * 删除申请记录（需管理员删除密码）
 */
async function remove(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const DELETE_PASSWORD = process.env.ADMIN_DELETE_PASSWORD || "admin123456";
    if (!password || password !== DELETE_PASSWORD) {
      return res.status(403).json({
        success: false,
        message: "删除密码错误，无权删除"
      });
    }

    const result = await query("DELETE FROM trial_applications WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "记录不存在"
      });
    }

    logger.info(`Admin 删除申请: id=${id}`);

    return res.json({
      success: true,
      message: "删除成功"
    });
  } catch (error) {
    logger.error("Admin 删除失败: " + error.message);
    return res.status(500).json({
      success: false,
      message: "删除失败: " + error.message
    });
  }
}

// ---- 辅助函数 ----

function formatDateTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return isoStr;
  }
}

function escapeCsv(str) {
  if (str == null) return "";
  const s = String(str);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

module.exports = {
  list,
  stats,
  exportCsv,
  updateStatus,
  detail,
  remove
};
