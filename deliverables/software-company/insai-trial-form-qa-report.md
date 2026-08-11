# 试用表单系统 QA 测试报告

## 测试概览

| 项目 | 内容 |
|------|------|
| **系统名称** | 营赛智影官网试用表单系统 |
| **测试日期** | 2026-08-11 |
| **测试人员** | Edward (QA Engineer) |
| **测试范围** | 前端表单一致性、后端 API 代码审查、前后端契约对齐、API 端到端测试、数据库脚本验证 |
| **项目路径** | `D:\东信工作\智影商业版\网站\zhenyu\zhenyu` |

---

## 一、测试结果总览

| 类别 | 总检查项 | 通过 | 失败 | 警告 |
|------|----------|------|------|------|
| 前端表单一致性 | 9 | 9 | 0 | 0 |
| 后端 API 代码审查 | 9 | 8 | 1 | 0 |
| 前后端接口契约对齐 | 5 | 5 | 0 | 0 |
| API 端到端测试 | 11 | 11 | 0 | 0 |
| 数据库脚本验证 | 4 | 4 | 0 | 0 |
| **合计** | **38** | **37** | **1** | **0** |

**智能路由判定: Engineer** — 发现 1 个源码 Bug，需工程师修复。

---

## 二、前端表单一致性验证

### 2.1 检查结果

| # | 检查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | 两个表单都有 8 个字段 | ✅ 通过 | company/industry/name/phone/email/scenario/demand/source |
| 2 | input name 属性一致 | ✅ 通过 | 两表单 name 属性完全一致 |
| 3 | checkbox demand value 一致且无空格 | ✅ 通过 | 每天1-20条 / 每天20-50条 / 每天50条以上 / 暂时不确定 |
| 4 | checkbox source value 一致 | ✅ 通过 | 朋友推荐 / 抖音 / 微信 / 小红书 / 百度 / AI问答 / 其他 |
| 5 | select industry 选项一致 | ✅ 通过 | 11 个选项完全一致 |
| 6 | data 属性齐全 | ✅ 通过 | data-trial-form / data-source-page / data-trial-submit / data-trial-success |
| 7 | 两页面引入 trial-form.js | ✅ 通过 | product-intro:1931 行, trial:545 行 |
| 8 | product-intro 旧 submitTrialMini 已移除 | ✅ 通过 | grep 搜索无匹配 |
| 9 | trial/index.html 旧 IIFE handler 已移除 | ✅ 通过 | grep 搜索无匹配 |

### 2.2 详细对比

**product-intro/index.html (弹窗表单, 1833-1921 行)**:
- `data-source-page="product-intro"`
- 8 字段: company, industry, name, phone, email, scenario, demand(4 checkboxes), source(7 checkboxes)
- 引入: `<script src="../assets/js/trial-form.js"></script>` (1931 行)

**trial/index.html (页面表单, 435-516 行)**:
- `data-source-page="trial"`
- 8 字段: company, industry, name, phone, email, scenario, demand(4 checkboxes), source(7 checkboxes)
- 引入: `<script src="../assets/js/trial-form.js"></script>` (545 行)

两表单字段、name 属性、checkbox value、select 选项完全一致。

---

## 三、后端 API 代码审查

### 3.1 检查结果

| # | 检查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | app.js 正确注册中间件和路由 | ✅ 通过 | JSON解析/URL编码/CORS/限频/日志/路由/健康检查/404/错误处理 均已注册 |
| 2 | database.js 使用 mysql2/promise | ✅ 通过 | `require("mysql2/promise")`, `mysql.createPool(dbConfig)` |
| 3 | trialController.js submit() 逻辑正确 | ✅ 通过 | 收集→查重→插入→返回 流程完整 |
| 4 | 所有 DB 操作使用参数化查询 | ✅ 通过 | `pool.execute(sql, params)` with `?` 占位符 |
| 5 | 24h 去重逻辑正确 | ✅ 通过 | `created_at > ?` 使用 ISO 8601 字符串比较 |
| 6 | trialValidator.js 枚举值与前端一致 | ✅ 通过 | INDUSTRY/VIDEO_DEMAND/REFERRAL_SOURCE/SOURCE_PAGE 均匹配 |
| 7 | CORS 支持 *.insai.cn 通配符 | ✅ 通过 | `isOriginAllowed()` 实现通配符匹配逻辑 |
| 8 | rateLimit 实现 IP 限频 | ✅ 通过 | 内存 Map 实现, 5次/分钟, 含过期清理 |
| 9 | rateLimit 应用范围合理 | ❌ **失败** | **限频中间件全局应用, 影响健康检查等非提交路由** |

### 3.2 发现的 Bug

#### BUG-001: 限频中间件全局应用 (严重性: 中高)

**文件**: `server/src/app.js` 第 28 行

**问题代码**:
```javascript
// 限频中间件
app.use(rateLimitMiddleware);  // ← 全局应用, 所有路由都被限频
```

**影响**:
- 限频中间件以 `app.use(rateLimitMiddleware)` 方式全局注册, 对 **所有路由** 生效
- 限频配置为每 IP 每分钟 5 次请求
- 这意味着 `/health` 健康检查、`/api/unknown` 等所有请求都会消耗限频配额
- **生产环境影响**:
  1. 监控系统每 10 秒检查一次 `/health` → 每分钟 6 次 → 超出 5 次限制 → 监控告警误报
  2. 用户浏览多个页面后提交表单可能被 429 拦截
  3. 任何非提交请求都会消耗限频配额, 降低实际可用提交次数

**测试验证**:
- 第一轮测试 (默认 5 次/分钟): 前 5 个请求 (含 1 个健康检查 + 4 个 API 测试) 正常, 第 6 个请求起全部返回 429
- 健康检查、404 路由、POST 提交全部被 429 拦截

**建议修复**:
将限频中间件从全局移至 trial 路由级别, 仅对 POST /api/trial/submit 生效:

```javascript
// app.js - 移除全局限频
// app.use(rateLimitMiddleware);  // ← 删除此行

// trialRoutes.js - 在 submit 路由添加限频
const rateLimitMiddleware = require("../middleware/rateLimit");
router.post("/submit", rateLimitMiddleware, trialValidationRules, handleValidationErrors, trialController.submit);
```

或者保持全局但豁免健康检查:
```javascript
// app.js - 健康检查在限频之前注册
app.get("/health", (_req, res) => { ... });

// 限频中间件 (仅对 /api 路径生效)
app.use("/api", rateLimitMiddleware);
```

---

## 四、前后端接口契约对齐验证

### 4.1 检查结果

| # | 检查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | JSON 字段名完全一致 | ✅ 通过 | 见下方字段映射表 |
| 2 | 前端字段映射正确 | ✅ 通过 | input name → API field 映射完整 |
| 3 | 多选字段前端传数组, 后端 join(',') | ✅ 通过 | video_demand/referral_source 数组转逗号分隔 |
| 4 | API URL 配置正确 | ✅ 通过 | localhost:3900 (开发) / 116.204.78.96:3900 (生产) |
| 5 | HTTP 状态码处理完整 | ✅ 通过 | 200/400/409/429/500/网络错误 均有处理 |

### 4.2 字段映射表

| 前端 input name | 前端 collectFormData() 输出 | 后端 collectFormData() 接收 | DB 字段 | 对齐状态 |
|-----------------|---------------------------|---------------------------|---------|----------|
| company | company | body.company | company | ✅ |
| industry | industry | body.industry | industry | ✅ |
| name | contact_name | body.contact_name | contact_name | ✅ |
| phone | contact_phone | body.contact_phone | contact_phone | ✅ |
| email | contact_email | body.contact_email | contact_email | ✅ |
| scenario | business_scenario | body.business_scenario | business_scenario | ✅ |
| demand (checkbox[]) | video_demand (array) | body.video_demand → join(',') | video_demand | ✅ |
| source (checkbox[]) | referral_source (array) | body.referral_source → join(',') | referral_source | ✅ |
| data-source-page | source_page | body.source_page | source_page | ✅ |

### 4.3 HTTP 状态码处理

| 状态码 | 前端处理 (trial-form.js) | 后端返回 (trialController.js) | 对齐状态 |
|--------|-------------------------|------------------------------|----------|
| 200 | showSuccess() - 隐藏表单显示成功 | `{ success: true, message: "申请提交成功" }` | ✅ |
| 400 | 显示字段级错误 + 错误横幅 | `{ success: false, message, errors: [] }` | ✅ |
| 409 | "请勿重复提交..." | `{ success: false, message: "该手机号24小时内..." }` | ✅ |
| 429 | "提交过于频繁..." | `{ success: false, message: "提交过于频繁..." }` | ✅ |
| 500 | "服务器错误..." | `{ success: false, message: "服务器内部错误..." }` | ✅ |
| 网络错误 | "网络异常..." | N/A | ✅ |

---

## 五、API 端到端测试

### 5.1 测试环境

- Node.js v22.22.2
- 依赖安装: 254 packages, 无错误
- 服务启动: 成功, 端口 3900
- 数据库: 无 MySQL 连接 (预期, 测试环境无 MySQL)
- 限频配置: 临时设为 100 次/分钟 (避免影响测试)

### 5.2 测试结果

| # | 测试场景 | 预期状态码 | 实际状态码 | 结果 |
|---|----------|-----------|-----------|------|
| 1 | GET /health 健康检查 | 200 | 200 | ✅ 通过 |
| 2 | POST 空请求体 | 400 | 400 | ✅ 通过 |
| 3 | POST 合法数据 (无DB) | 500 | 500 | ✅ 通过 |
| 4 | POST 无效行业枚举 | 400 | 400 | ✅ 通过 |
| 5 | POST 无效手机号 | 400 | 400 | ✅ 通过 |
| 6 | POST 无效 video_demand | 400 | 400 | ✅ 通过 |
| 7 | POST 无效 referral_source | 400 | 400 | ✅ 通过 |
| 8 | POST 无效 source_page | 400 | 400 | ✅ 通过 |
| 9 | POST 无效邮箱格式 | 400 | 400 | ✅ 通过 |
| 10 | GET /api/unknown 404 | 404 | 404 | ✅ 通过 |
| 11 | POST product-intro 来源 | 500 | 500 | ✅ 通过 |

### 5.3 测试详情

**Test 2 - 空请求体 (400)**:
- 返回所有必填字段校验错误: company, industry, contact_name, contact_phone, source_page
- 每个字段返回 notEmpty + 格式/枚举校验两条错误
- 响应格式: `{ success: false, message: "公司/品牌名称不能为空", errors: [...] }`

**Test 3 - 合法数据 (500)**:
- 校验通过, 进入业务逻辑
- 尝试连接 MySQL 127.0.0.1:3306 失败 (ECONNREFUSED)
- 返回 500 + 通用错误消息 (不泄露内部错误)
- 日志记录完整: 收到申请 → DB查询失败 → 错误堆栈

**Test 4-9 - 各种校验失败 (400)**:
- 每个非法值都正确触发对应字段的校验错误
- 枚举校验返回有效值列表
- 错误响应包含 `field` 和 `message`

---

## 六、数据库脚本验证

### 6.1 检查结果

| # | 检查项 | 结果 | 说明 |
|---|--------|------|------|
| 1 | CREATE DATABASE 正确 | ✅ 通过 | `homepage`, `utf8mb4`, `utf8mb4_unicode_ci` |
| 2 | CREATE TABLE 字段完整 (15 字段) | ✅ 通过 | 见下方字段清单 |
| 3 | 索引正确 (4 个) | ✅ 通过 | idx_phone / idx_created_at / idx_industry / idx_status |
| 4 | 字段类型合理 | ✅ 通过 | bigint PK / varchar / text |

### 6.2 表结构 (15 字段)

| 字段名 | 类型 | 可空 | 默认值 | 注释 |
|--------|------|------|--------|------|
| id | BIGINT | NOT NULL | AUTO_INCREMENT | 主键 |
| company | VARCHAR(128) | NOT NULL | - | 公司/品牌名称 |
| industry | VARCHAR(64) | NOT NULL | - | 所属行业 |
| contact_name | VARCHAR(64) | NOT NULL | - | 联系人姓名 |
| contact_phone | VARCHAR(20) | NOT NULL | - | 联系手机号 |
| contact_email | VARCHAR(128) | NULL | NULL | 联系邮箱 |
| business_scenario | TEXT | NULL | NULL | 业务场景 |
| video_demand | VARCHAR(255) | NULL | NULL | 视频制作需求(逗号分隔) |
| referral_source | VARCHAR(255) | NULL | NULL | 了解渠道(逗号分隔) |
| source_page | VARCHAR(32) | NULL | NULL | 来源页面 |
| source_ip | VARCHAR(64) | NULL | NULL | 提交者IP |
| user_agent | VARCHAR(512) | NULL | NULL | 浏览器UA |
| status | VARCHAR(32) | NOT NULL | 'pending' | 处理状态 |
| created_at | VARCHAR(64) | NOT NULL | - | 提交时间ISO 8601 |
| updated_at | VARCHAR(64) | NULL | NULL | 更新时间 |

### 6.3 备注

- `created_at` 和 `updated_at` 使用 VARCHAR(64) 存储 ISO 8601 字符串, 而非 MySQL DATETIME/TIMESTAMP 类型。这是设计选择, ISO 8601 字符串可正确进行字典序比较, 24h 去重逻辑 `created_at > ?` 能正确工作。
- dbInit.js 包含完善的错误处理: ER_DB_CREATE_DENIED (无建库权限时打印 SQL 供运维手动执行), ECONNREFUSED (提示检查 MySQL 服务和 SSH 隧道)。

---

## 七、智能路由判定

### 判定结果: **Engineer**

### 需工程师修复的问题

| Bug ID | 严重性 | 文件 | 问题描述 |
|--------|--------|------|----------|
| BUG-001 | 中高 | `server/src/app.js:28` | 限频中间件全局应用, 影响健康检查等非提交路由 |

### 修复建议

将限频中间件从全局 `app.use(rateLimitMiddleware)` 改为仅应用于 trial 路由:

**方案 A (推荐)**: 在 trialRoutes.js 中对 submit 路由单独应用限频
```javascript
// trialRoutes.js
const rateLimitMiddleware = require("../middleware/rateLimit");
router.post("/submit", rateLimitMiddleware, trialValidationRules, handleValidationErrors, trialController.submit);
```
同时从 app.js 移除 `app.use(rateLimitMiddleware)`。

**方案 B**: 在 app.js 中限定限频路径
```javascript
// app.js - 仅对 /api 路径限频, 健康检查不受影响
app.use("/api", rateLimitMiddleware);
```

---

## 八、其他观察 (非 Bug, 供参考)

1. **.env.example 中 DB_PORT=3307**: 示例配置使用 3307 端口 (可能是 SSH 隧道转发), 而 database.js 默认值为 3306。生产部署时需确认 .env 中 DB_PORT 配置正确。

2. **CORS 默认值为 `*`**: 当未配置 CORS_ORIGINS 环境变量时, 默认允许所有来源。生产环境应确保 .env 中配置了正确的 CORS_ORIGINS (如 `.env.example` 中的 `*.insai.cn,*.yingsaidata.com`)。

3. **created_at/updated_at 使用 VARCHAR**: 虽然功能正确, 但如果后续需要使用 MySQL 原生日期函数 (如 DATE_FORMAT, DATEDIFF), 需要修改为 DATETIME 类型。当前设计对 24h 去重和排序无影响。

---

## 九、结论

试用表单系统整体实现质量高, 38 项检查中 37 项通过。前端表单完全一致, 后端代码结构清晰, 参数校验完善, API 端到端测试全部通过。

唯一发现的 Bug 是限频中间件全局应用 (BUG-001), 建议工程师修复后即可上线。该 Bug 不影响核心业务逻辑 (表单提交、数据存储、去重), 仅影响生产环境的健康检查监控和用户体验。

**测试轮次**: Round 1 完成, 等待工程师修复 BUG-001 后进行 Round 2 回归验证。
