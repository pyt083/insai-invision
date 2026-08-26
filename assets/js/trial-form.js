/**
 * trial-form.js - 智影试用申请表单共享逻辑
 *
 * 功能:
 * - 表单数据收集与字段映射
 * - 前端校验（必填、手机号、邮箱）
 * - AJAX 提交到后端 API
 * - 成功/错误状态展示
 * - 按钮防抖与禁用
 * - 自动初始化所有 [data-trial-form] 表单
 *
 * 使用方式:
 * 在 HTML 页面中引入此脚本，表单添加 data-trial-form 和 data-source-page 属性即可自动绑定。
 */

(function () {
  "use strict";

  // ========== API 配置 ==========
  var TRIAL_API_CONFIG = {
    /**
     * 根据 hostname 判断环境，返回 API 基础地址
     * 开发环境: localhost / 127.0.0.1 → http://localhost:3900
     * 生产环境: 其他域名 → 空字符串（走 Nginx 代理相对路径）
     */
    get base() {
      var host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
        return "http://localhost:3900";
      }
      return "";
    },
    path: "/api/trial/submit",
    get url() {
      return this.base + this.path;
    }
  };

  // ========== 工具函数 ==========

  /**
   * 防抖函数
   * @param {Function} fn - 要防抖的函数
   * @param {number} delay - 延迟毫秒
   * @returns {Function}
   */
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var ctx = this;
      var args = arguments;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  /**
   * 去除字符串两端空格（安全版，处理 null/undefined）
   * @param {*} value
   * @returns {string}
   */
  function trim(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }

  /**
   * 去除字符串中所有空格（用于标准化枚举值）
   * @param {*} value
   * @returns {string}
   */
  function removeAllSpaces(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).replace(/\s+/g, "");
  }

  // ========== 表单数据收集 ==========

  /**
   * 收集表单数据并映射到 API 字段
   *
   * 字段映射:
 *   input[name="company"]                → company
 *   select[name="industry"]              → industry
 *   input[name="name"]                   → contact_name
 *   input[name="phone"]                  → contact_phone
 *   input[name="email"]                  → contact_email
 *   input[name="consultation_direction"] → consultation_direction
 *   input[name="wechat_id"]              → wechat_id
 *   select[name="preferred_contact_channel"] → preferred_contact_channel
 *   input[name="estimated_budget"]       → estimated_budget
 *   textarea[name="scenario"]            → business_scenario
 *   textarea[name="consultation_content"] → consultation_content
 *   checkbox[name="demand"] 选中值 → video_demand 数组（去空格标准化）
 *   checkbox[name="source"] 选中值 → referral_source 数组（去空格标准化）
 *   sourcePage 参数          → source_page
   *
   * @param {HTMLFormElement} formEl - 表单元素
   * @returns {Object} API 请求体对象
   */
  function collectFormData(formEl) {
    var data = {};

    // 单值字段
    data.company = trim(formEl.querySelector('[name="company"]') ? formEl.querySelector('[name="company"]').value : "");
    data.industry = trim(formEl.querySelector('[name="industry"]') ? formEl.querySelector('[name="industry"]').value : "");
    data.contact_name = trim(formEl.querySelector('[name="name"]') ? formEl.querySelector('[name="name"]').value : "");
    data.contact_phone = trim(formEl.querySelector('[name="phone"]') ? formEl.querySelector('[name="phone"]').value : "");
    data.contact_email = trim(formEl.querySelector('[name="email"]') ? formEl.querySelector('[name="email"]').value : "");

    // 咨询方向：radio 单选
    var consultationDirectionEl = formEl.querySelector('input[type="radio"][name="consultation_direction"]:checked');
    data.consultation_direction = consultationDirectionEl ? trim(consultationDirectionEl.value) : "";

    data.wechat_id = trim(formEl.querySelector('[name="wechat_id"]') ? formEl.querySelector('[name="wechat_id"]').value : "");
    data.preferred_contact_channel = trim(formEl.querySelector('[name="preferred_contact_channel"]') ? formEl.querySelector('[name="preferred_contact_channel"]').value : "");
    data.estimated_budget = trim(formEl.querySelector('[name="estimated_budget"]') ? formEl.querySelector('[name="estimated_budget"]').value : "");
    data.business_scenario = trim(formEl.querySelector('[name="scenario"]') ? formEl.querySelector('[name="scenario"]').value : "");
    data.consultation_content = trim(formEl.querySelector('[name="consultation_content"]') ? formEl.querySelector('[name="consultation_content"]').value : "");

    // 多选 checkbox: video_demand
    var demandCheckboxes = formEl.querySelectorAll('input[type="checkbox"][name="demand"]:checked');
    var videoDemand = [];
    for (var i = 0; i < demandCheckboxes.length; i++) {
      // 去空格标准化枚举值
      var demandValue = removeAllSpaces(demandCheckboxes[i].value);
      if (demandValue) {
        videoDemand.push(demandValue);
      }
    }
    data.video_demand = videoDemand;

    // 多选 checkbox: referral_source
    var sourceCheckboxes = formEl.querySelectorAll('input[type="checkbox"][name="source"]:checked');
    var referralSource = [];
    for (var j = 0; j < sourceCheckboxes.length; j++) {
      // 去空格标准化枚举值
      var sourceValue = removeAllSpaces(sourceCheckboxes[j].value);
      if (sourceValue) {
        referralSource.push(sourceValue);
      }
    }
    data.referral_source = referralSource;

    return data;
  }

  // ========== 前端校验 ==========

  /**
   * 前端表单校验
   * @param {HTMLFormElement} formEl - 表单元素
   * @returns {Object} { valid: boolean, errors: Array<{field, message}> }
   */
  function validateForm(formEl) {
    var errors = [];

    // 公司/品牌名称
    var company = formEl.querySelector('[name="company"]');
    if (company && !trim(company.value)) {
      errors.push({ field: "company", message: "请填写公司/品牌名称" });
      addFieldError(company);
    } else if (company) {
      removeFieldError(company);
    }

    // 所属行业
    var industry = formEl.querySelector('[name="industry"]');
    if (industry && !trim(industry.value)) {
      errors.push({ field: "industry", message: "请选择所属行业" });
      addFieldError(industry);
    } else if (industry) {
      removeFieldError(industry);
    }

    // 联系人姓名
    var name = formEl.querySelector('[name="name"]');
    if (name && !trim(name.value)) {
      errors.push({ field: "contact_name", message: "请填写联系人姓名" });
      addFieldError(name);
    } else if (name) {
      removeFieldError(name);
    }

    // 联系手机号
    var phone = formEl.querySelector('[name="phone"]');
    if (phone) {
      var phoneValue = trim(phone.value);
      if (!phoneValue) {
        errors.push({ field: "contact_phone", message: "请填写联系手机号" });
        addFieldError(phone);
      } else if (!/^1[3-9]\d{9}$/.test(phoneValue)) {
        errors.push({ field: "contact_phone", message: "请填写有效的手机号" });
        addFieldError(phone, "请填写有效的手机号");
      } else {
        removeFieldError(phone);
      }
    }

    // 联系邮箱（必填）
    var email = formEl.querySelector('[name="email"]');
    if (email) {
      var emailValue = trim(email.value);
      if (!emailValue) {
        errors.push({ field: "contact_email", message: "请填写联系邮箱" });
        addFieldError(email, "请填写联系邮箱");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        errors.push({ field: "contact_email", message: "邮箱格式不正确" });
        addFieldError(email, "邮箱格式不正确");
      } else {
        removeFieldError(email);
      }
    }

    // 咨询内容（必填）
    var consultationContent = formEl.querySelector('[name="consultation_content"]');
    if (consultationContent && !trim(consultationContent.value)) {
      errors.push({ field: "consultation_content", message: "请填写咨询内容" });
      addFieldError(consultationContent);
    } else if (consultationContent) {
      removeFieldError(consultationContent);
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 给字段添加错误样式
   * @param {HTMLElement} field - 输入元素
   * @param {string} [customMsg] - 自定义错误消息
   */
  function addFieldError(field, customMsg) {
    var group = field.closest(".form-group");
    if (group) {
      group.classList.add("error");
      if (customMsg) {
        var errorMsg = group.querySelector(".error-msg");
        if (errorMsg) {
          errorMsg.textContent = customMsg;
        }
      }
    }
  }

  /**
   * 移除字段错误样式
   * @param {HTMLElement} field - 输入元素
   */
  function removeFieldError(field) {
    var group = field.closest(".form-group");
    if (group) {
      group.classList.remove("error");
    }
  }

  /**
   * 清除所有字段错误样式
   * @param {HTMLFormElement} formEl
   */
  function clearAllErrors(formEl) {
    var errorGroups = formEl.querySelectorAll(".form-group.error");
    for (var i = 0; i < errorGroups.length; i++) {
      errorGroups[i].classList.remove("error");
    }
  }

  // ========== UI 状态管理 ==========

  /**
   * 显示成功状态：隐藏表单，显示成功消息区块
   * @param {HTMLFormElement} formEl
   */
  function showSuccess(formEl) {
    // 隐藏表单
    formEl.style.display = "none";

    // 查找成功消息区块
    var successEl = formEl.parentElement.querySelector("[data-trial-success]");
    if (successEl) {
      successEl.style.display = "block";
    }

    // 滚动到成功消息
    if (successEl) {
      successEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /**
   * 显示错误提示并恢复按钮
   * @param {HTMLFormElement} formEl
   * @param {string} message - 错误消息
   */
  function showError(formEl, message) {
    // 查找或创建错误提示区域
    var errorBanner = formEl.querySelector("[data-trial-error]");
    if (!errorBanner) {
      errorBanner = document.createElement("div");
      errorBanner.setAttribute("data-trial-error", "");
      errorBanner.style.cssText =
        "background:#FEF2F2;border:1px solid #FECACA;color:#DC2626;padding:12px 16px;border-radius:8px;font-size:14px;margin-bottom:16px;display:none;";
      formEl.insertBefore(errorBanner, formEl.firstChild);
    }

    errorBanner.textContent = message;
    errorBanner.style.display = "block";

    // 恢复提交按钮
    restoreButton(formEl);

    // 3 秒后自动隐藏错误提示
    setTimeout(function () {
      errorBanner.style.display = "none";
    }, 5000);
  }

  /**
   * 禁用提交按钮，显示"提交中..."
   * @param {HTMLFormElement} formEl
   */
  function disableButton(formEl) {
    var btn = formEl.querySelector("[data-trial-submit]");
    if (btn) {
      btn.setAttribute("data-original-text", btn.textContent);
      btn.disabled = true;
      btn.textContent = "提交中...";
      btn.style.opacity = "0.7";
      btn.style.cursor = "not-allowed";
    }
  }

  /**
   * 恢复提交按钮
   * @param {HTMLFormElement} formEl
   */
  function restoreButton(formEl) {
    var btn = formEl.querySelector("[data-trial-submit]");
    if (btn) {
      btn.disabled = false;
      var originalText = btn.getAttribute("data-original-text");
      if (originalText) {
        btn.textContent = originalText;
      }
      btn.style.opacity = "";
      btn.style.cursor = "";
    }
  }

  // ========== AJAX 提交 ==========

  /**
   * 提交试用申请表单
   * @param {HTMLFormElement} formEl - 表单元素
   * @param {string} sourcePage - 来源页面标识 ("product-intro" | "trial")
   */
  function submitTrialForm(formEl, sourcePage) {
    // 清除之前的错误状态
    clearAllErrors(formEl);
    var errorBanner = formEl.querySelector("[data-trial-error]");
    if (errorBanner) {
      errorBanner.style.display = "none";
    }

    // 前端校验
    var validation = validateForm(formEl);
    if (!validation.valid) {
      // 滚动到第一个错误字段
      var firstErrorGroup = formEl.querySelector(".form-group.error");
      if (firstErrorGroup) {
        firstErrorGroup.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // 收集表单数据
    var data = collectFormData(formEl);
    data.source_page = sourcePage;

    // 禁用按钮
    disableButton(formEl);

    // 发送 AJAX 请求
    fetch(TRIAL_API_CONFIG.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    })
      .then(function (response) {
        // 解析 JSON 响应
        return response.json().then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        var status = result.status;
        var body = result.body || {};

        switch (status) {
          case 200:
            // 成功
            showSuccess(formEl);
            break;

          case 400:
            // 参数错误 - 显示字段级错误
            if (body.errors && body.errors.length > 0) {
              for (var i = 0; i < body.errors.length; i++) {
                var err = body.errors[i];
                var fieldEl = null;
                // 字段名到 DOM name 的反向映射
                var fieldMap = {
                  company: "company",
                  industry: "industry",
                  contact_name: "name",
                  contact_phone: "phone",
                  contact_email: "email",
                  consultation_direction: "consultation_direction",
                  wechat_id: "wechat_id",
                  preferred_contact_channel: "preferred_contact_channel",
                  estimated_budget: "estimated_budget",
                  business_scenario: "scenario",
                  consultation_content: "consultation_content"
                };
                var domName = fieldMap[err.field] || err.field;
                fieldEl = formEl.querySelector('[name="' + domName + '"]');
                if (fieldEl) {
                  addFieldError(fieldEl, err.message);
                }
              }
              showError(formEl, body.message || "请检查表单填写是否正确");
            } else {
              showError(formEl, body.message || "请检查表单填写是否正确");
            }
            break;

          case 409:
            // 重复提交
            showError(formEl, "请勿重复提交，该手机号24小时内已提交过申请");
            break;

          case 429:
            // 频率限制
            showError(formEl, "提交过于频繁，请稍后再试");
            break;

          case 500:
            // 服务器错误
            showError(formEl, "服务器错误，请稍后重试");
            break;

          default:
            showError(formEl, body.message || "提交失败，请稍后重试");
        }
      })
      .catch(function (error) {
        // 网络错误
        console.error("Trial form submit error:", error);
        showError(formEl, "网络异常，请检查网络后重试");
      });
  }

  // ========== 自动初始化 ==========

  /**
   * 初始化所有 [data-trial-form] 表单
   * 在 DOMContentLoaded 时自动执行
   */
  function initAllForms() {
    var forms = document.querySelectorAll("form[data-trial-form]");
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        var sourcePage = form.getAttribute("data-source-page") || "trial";

        // 绑定 submit 事件
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          submitTrialForm(form, sourcePage);
        });

        // 输入时清除对应字段的错误状态
        var inputs = form.querySelectorAll("input, select, textarea");
        for (var j = 0; j < inputs.length; j++) {
          (function (input) {
            input.addEventListener("input", function () {
              removeFieldError(input);
            });
            input.addEventListener("change", function () {
              removeFieldError(input);
            });
          })(inputs[j]);
        }
      })(forms[i]);
    }
  }

  // DOM 加载完成后自动初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllForms);
  } else {
    initAllForms();
  }

  // 暴露到全局（供手动调用）
  window.TrialForm = {
    config: TRIAL_API_CONFIG,
    submit: submitTrialForm,
    validate: validateForm,
    collectData: collectFormData,
    debounce: debounce
  };
})();
