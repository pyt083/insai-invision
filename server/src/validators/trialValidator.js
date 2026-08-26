/**
 * 试用申请表单校验规则
 * 使用 express-validator 定义校验链
 */

const { body, validationResult } = require("express-validator");

// 行业枚举值
const INDUSTRY_VALUES = [
  "电商",
  "游戏",
  "金融",
  "教育",
  "本地生活",
  "美妆个护",
  "3C数码",
  "服装服饰",
  "医疗健康",
  "汽车",
  "其他"
];

// 视频制作需求枚举值
const VIDEO_DEMAND_VALUES = [
  "每天1-20条",
  "每天20-50条",
  "每天50条以上",
  "暂时不确定"
];

// 了解渠道枚举值
const REFERRAL_SOURCE_VALUES = [
  "朋友推荐",
  "抖音",
  "微信",
  "小红书",
  "百度",
  "AI问答",
  "其他"
];

// 来源页面枚举值
const SOURCE_PAGE_VALUES = ["product-intro", "trial"];

// 咨询方向枚举值
const CONSULTATION_DIRECTION_VALUES = [
  "产品采购",
  "定制方案",
  "API / 技术接入",
  "商务合作",
  "其他"
];

// 希望联系渠道枚举值
const PREFERRED_CONTACT_CHANNEL_VALUES = ["电话", "邮箱", "微信"];

/**
 * 校验规则链数组
 * 用于 POST /api/trial/submit 路由
 */
const trialValidationRules = [
  // 公司/品牌名称
  body("company")
    .notEmpty()
    .withMessage("公司/品牌名称不能为空")
    .isLength({ min: 1, max: 128 })
    .withMessage("公司/品牌名称长度为1-128个字符")
    .trim(),

  // 所属行业
  body("industry")
    .notEmpty()
    .withMessage("所属行业不能为空")
    .isIn(INDUSTRY_VALUES)
    .withMessage(`所属行业必须是以下值之一: ${INDUSTRY_VALUES.join(", ")}`)
    .trim(),

  // 联系人姓名
  body("contact_name")
    .notEmpty()
    .withMessage("联系人姓名不能为空")
    .isLength({ min: 1, max: 64 })
    .withMessage("联系人姓名长度为1-64个字符")
    .trim(),

  // 联系手机号
  body("contact_phone")
    .notEmpty()
    .withMessage("联系手机号不能为空")
    .matches(/^1[3-9]\d{9}$/)
    .withMessage("手机号格式不正确")
    .trim(),

  // 联系邮箱（必填）
  body("contact_email")
    .notEmpty()
    .withMessage("联系邮箱不能为空")
    .isEmail()
    .withMessage("邮箱格式不正确")
    .isLength({ max: 128 })
    .withMessage("邮箱长度不能超过128个字符")
    .normalizeEmail()
    .trim(),

  // 咨询方向（可选）
  body("consultation_direction")
    .optional({ checkFalsy: true })
    .isIn(CONSULTATION_DIRECTION_VALUES)
    .withMessage(`咨询方向必须是以下值之一: ${CONSULTATION_DIRECTION_VALUES.join(", ")}`)
    .trim(),

  // 微信号（可选）
  body("wechat_id")
    .optional({ checkFalsy: true })
    .isLength({ max: 64 })
    .withMessage("微信号长度不能超过64个字符")
    .trim(),

  // 希望联系渠道（可选）
  body("preferred_contact_channel")
    .optional({ checkFalsy: true })
    .isIn(PREFERRED_CONTACT_CHANNEL_VALUES)
    .withMessage(`希望联系渠道必须是以下值之一: ${PREFERRED_CONTACT_CHANNEL_VALUES.join(", ")}`)
    .trim(),

  // 预计预算（可选）
  body("estimated_budget")
    .optional({ checkFalsy: true })
    .isLength({ max: 128 })
    .withMessage("预计预算长度不能超过128个字符")
    .trim(),

  // 业务场景（可选）
  body("business_scenario")
    .optional({ checkFalsy: true })
    .isLength({ max: 2000 })
    .withMessage("业务场景描述不能超过2000个字符")
    .trim(),

  // 咨询内容（必填）
  body("consultation_content")
    .notEmpty()
    .withMessage("咨询内容不能为空")
    .isLength({ max: 4000 })
    .withMessage("咨询内容不能超过4000个字符")
    .trim(),

  // 视频制作需求（可选，数组）
  body("video_demand")
    .optional({ checkFalsy: true })
    .isArray()
    .withMessage("视频制作需求必须是数组")
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      for (const item of value) {
        if (!VIDEO_DEMAND_VALUES.includes(item)) {
          throw new Error(`视频制作需求包含无效值: ${item}，有效值: ${VIDEO_DEMAND_VALUES.join(", ")}`);
        }
      }
      return true;
    }),

  // 了解渠道（可选，数组）
  body("referral_source")
    .optional({ checkFalsy: true })
    .isArray()
    .withMessage("了解渠道必须是数组")
    .custom((value) => {
      if (!Array.isArray(value)) return true;
      for (const item of value) {
        if (!REFERRAL_SOURCE_VALUES.includes(item)) {
          throw new Error(`了解渠道包含无效值: ${item}，有效值: ${REFERRAL_SOURCE_VALUES.join(", ")}`);
        }
      }
      return true;
    }),

  // 来源页面
  body("source_page")
    .notEmpty()
    .withMessage("来源页面不能为空")
    .isIn(SOURCE_PAGE_VALUES)
    .withMessage(`来源页面必须是以下值之一: ${SOURCE_PAGE_VALUES.join(", ")}`)
    .trim()
];

/**
 * 收集校验错误，返回 400 + errors 数组
 * 如果有校验错误，直接返回响应；否则调用 next()
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorList = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg
    }));

    // 取第一个错误作为主消息
    const firstMessage = errorList[0] ? errorList[0].message : "参数校验失败";

    return res.status(400).json({
      success: false,
      message: firstMessage,
      errors: errorList
    });
  }

  next();
}

module.exports = {
  trialValidationRules,
  handleValidationErrors,
  INDUSTRY_VALUES,
  VIDEO_DEMAND_VALUES,
  REFERRAL_SOURCE_VALUES,
  SOURCE_PAGE_VALUES,
  CONSULTATION_DIRECTION_VALUES,
  PREFERRED_CONTACT_CHANNEL_VALUES
};
