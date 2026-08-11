# PRD — 营赛智影官网试用申请表单统一与数据入库

> **文档版本**: v1.0  
> **日期**: 2026-08-11  
> **作者**: 许清楚（产品经理）  
> **语言**: 简体中文  

---

## 一、项目信息

| 项目 | 内容 |
|------|------|
| **项目名称** | `insai-trial-form` |
| **技术栈** | 前端：纯静态 HTML/CSS/JS（保持现有技术栈）；后端：Node.js + Express（新增）；数据库：MySQL 8.0+ |
| **部署方式** | 前端：GitLab Pages / EdgeOne CDN（静态托管）；后端：独立 Node.js 服务，部署于 116.204.78.96 |
| **数据库名** | `homepage`（新建） |
| **数据表名** | `trial_applications`（新建） |

### 原始需求复述

营赛智影官网现有两个试用申请入口：

1. **`product-intro/index.html`** 页面右下角悬浮"试用"按钮，点击后弹出迷你弹窗表单，当前仅 3 个字段（公司/品牌名称、联系人姓名、联系手机号），提交后仅前端显示成功，**无数据持久化**。
2. **`trial/index.html`** 完整页面表单，字段齐全（8 个字段），提交后仅前端显示成功，**同样无数据持久化**。

需求目标：
- 将弹窗迷你表单统一为与 `trial/index.html` 完全一致的字段、校验、交互。
- 两个表单提交后，均将全部数据写入 MySQL 数据库 `homepage` 中的 `trial_applications` 表。

---

## 二、产品定义

### 2.1 产品目标

| 编号 | 目标 | 衡量指标 |
|------|------|----------|
| G1 | **统一表单体验**：两个入口的表单字段、校验规则、交互行为完全一致，消除信息收集差异 | 弹窗表单字段数 = 完整页面表单字段数（8 个）；校验规则 100% 对齐 |
| G2 | **数据可靠入库**：所有试用申请数据持久化存储到 MySQL，支持后续运营跟进 | 提交成功率 ≥ 99%；数据零丢失；支持按时间/手机号/行业查询 |
| G3 | **降低用户填写成本**：在弹窗场景下保持良好的填写体验，避免因字段增多导致转化率下降 | 弹窗表单完成率不低于当前水平的 80% |

### 2.2 用户故事

1. **作为潜在客户**，我希望在产品介绍页看到试用入口时，能直接在弹窗中填写完整信息提交申请，而不必跳转到另一个页面，这样我可以更快完成申请。

2. **作为潜在客户**，我希望无论从哪个入口提交试用申请，填写的信息字段和要求是一样的，这样我不会感到困惑。

3. **作为运营人员**，我希望所有试用申请数据都自动存入数据库，这样我可以随时查询、导出和跟进，而不需要手动整理。

4. **作为运营人员**，我希望通过数据字段（行业、视频制作需求量、了解渠道）对潜在客户进行分层筛选，这样我可以优先跟进高价值客户。

5. **作为系统管理员**，我希望表单提交有基本的防刷和校验机制，这样我可以避免收到垃圾数据或恶意提交。

---

## 三、技术规范

### 3.1 当前系统现状分析

| 维度 | 现状 | 问题 |
|------|------|------|
| 前端架构 | 纯静态 HTML/CSS/JS，GitLab Pages 部署 | 无后端服务，无法处理数据持久化 |
| 弹窗表单 | 3 个字段（公司、姓名、手机号），`submitTrialMini()` 仅前端展示成功 | 字段不完整；无数据提交；无后端 API |
| 完整页面表单 | 8 个字段，有客户端校验（必填 + 手机号正则），提交仅前端展示成功 | 无数据提交；无后端 API |
| 数据库 | 116.204.78.96 上有 5 个库（invision/invision_atlas/ailab_film/ailab_image/aigv），无 `homepage` 库 | 需新建 `homepage` 库和 `trial_applications` 表 |
| 后端服务 | 无 | 需新建 Node.js API 服务 |

### 3.2 需求池

#### P0 — 必须有（Must Have）

| 编号 | 需求 | 详细说明 |
|------|------|----------|
| P0-1 | **弹窗表单字段统一** | 将 `product-intro/index.html` 悬浮试用弹窗的表单从 3 个字段扩展为与 `trial/index.html` 完全一致的 8 个字段：①公司/品牌名称（必填）②所属行业（必填，下拉）③联系人姓名（必填）④联系手机号（必填）⑤联系邮箱（选填）⑥业务场景 textarea（选填）⑦视频制作需求（选填，多选 checkbox）⑧了解渠道（选填，多选 checkbox） |
| P0-2 | **弹窗表单校验统一** | 弹窗表单的校验规则与 `trial/index.html` 完全一致：必填字段校验（公司、行业、姓名、手机号）；手机号正则校验 `/^1[3-9]\d{9}$/`；错误提示样式和行为一致（红色边框 + 错误信息；输入时清除错误） |
| P0-3 | **后端 API — 提交接口** | 新建后端 API `POST /api/trial/submit`，接收表单全部字段，写入 MySQL `homepage.trial_applications` 表。返回 JSON `{ success: true/false, message: string }` |
| P0-4 | **数据库表设计** | 在 MySQL 116.204.78.96 上新建 `homepage` 数据库和 `trial_applications` 表（详见 3.3 节表结构设计） |
| P0-5 | **两个表单接入 API** | `trial/index.html` 和 `product-intro/index.html` 弹窗表单的提交逻辑改为：前端校验通过后，通过 `fetch()` 调用 `POST /api/trial/submit`，根据返回结果展示成功/失败提示 |
| P0-6 | **成功/失败反馈** | 提交成功：展示现有成功提示（"感谢申请！我们将在 1 个工作日内联系您"）；提交失败：展示错误提示（"提交失败，请稍后重试或联系客服"），保留用户已填数据不丢失 |
| P0-7 | **API 输入校验** | 后端对所有入参进行校验：必填字段非空；手机号格式；邮箱格式（如填写）；行业枚举值合法。校验失败返回 400 + 错误详情 |
| P0-8 | **SQL 注入防护** | 后端使用参数化查询（Prepared Statements），禁止字符串拼接 SQL |

#### P1 — 应该有（Should Have）

| 编号 | 需求 | 详细说明 |
|------|------|----------|
| P1-1 | **弹窗尺寸自适应** | 弹窗表单字段增多后，弹窗需支持滚动（`max-height: 80vh; overflow-y: auto`），宽度适配（桌面端 `max-width: 520px`，移动端 `width: 92vw`），确保所有字段可见可操作 |
| P1-2 | **来源标识字段** | 数据库表增加 `source_page` 字段（`product-intro` / `trial`），记录申请来源页面，便于运营分析转化路径 |
| P1-3 | **提交防重复** | 同一手机号在 24 小时内重复提交时，后端返回提示"您已提交过申请，我们将尽快与您联系"，避免重复数据 |
| P1-4 | **IP 记录与限频** | 后端记录提交者 IP 地址（`source_ip` 字段）；同一 IP 每分钟最多提交 5 次，超出返回 429 |
| P1-5 | **User-Agent 记录** | 数据库表增加 `user_agent` 字段，记录提交时的浏览器 UA，便于排查异常提交 |
| P1-6 | **API CORS 配置** | 后端配置 CORS，允许官网域名（如 `*.yingsaidata.com`、`*.insai.cn`、GitLab Pages 域名）跨域访问 |
| P1-7 | **HTTPS** | 后端 API 服务必须启用 HTTPS（通过 Nginx 反向代理 + Let's Encrypt 证书） |

#### P2 — 可以有（Nice to Have）

| 编号 | 需求 | 详细说明 |
|------|------|----------|
| P2-1 | **短信通知** | 新申请入库后，自动触发短信通知指定运营人员手机号（可对接阿里云短信服务） |
| P2-2 | **企业微信通知** | 新申请入库后，通过企业微信 Webhook 推送通知到运营群 |
| P2-3 | **管理后台查看** | 提供简单的管理页面（或 API），运营人员可登录查看、筛选、导出试用申请列表（CSV） |
| P2-4 | **数据统计仪表盘** | 按日/周/月统计申请量、行业分布、渠道分布、需求量分布，可视化展示 |
| P2-5 | **弹窗表单分步填写** | 弹窗表单字段较多，可考虑分两步：第一步填核心信息（公司+行业+姓名+手机），第二步填选填信息（邮箱+场景+需求+渠道），降低首屏填写压力 |

---

### 3.3 数据库表结构设计

> 参考 `D:/东信工作/数据库/MySQL完整数据字典.md` 中的规范：使用 `bigint` 主键、`varchar` 存储时间（ISO 8601 格式）、`utf8mb4` 字符集。

**数据库**: `homepage`  
**表名**: `trial_applications`

```sql
CREATE DATABASE IF NOT EXISTS `homepage`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE TABLE `homepage`.`trial_applications` (
  `id`                BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '主键',
  `company`           VARCHAR(128) NOT NULL                 COMMENT '公司/品牌名称',
  `industry`          VARCHAR(64)  NOT NULL                 COMMENT '所属行业（电商/游戏/金融/教育/本地生活/美妆个护/3C数码/服装服饰/医疗健康/汽车/其他）',
  `contact_name`      VARCHAR(64)  NOT NULL                 COMMENT '联系人姓名',
  `contact_phone`     VARCHAR(20)  NOT NULL                 COMMENT '联系手机号',
  `contact_email`     VARCHAR(128) DEFAULT NULL             COMMENT '联系邮箱（选填）',
  `business_scenario` TEXT         DEFAULT NULL             COMMENT '希望通过AI视频解决的业务场景（选填）',
  `video_demand`      VARCHAR(255) DEFAULT NULL             COMMENT '视频制作需求（多选，逗号分隔：每天1-20条,每天20-50条,每天50条以上,暂时不确定）',
  `referral_source`   VARCHAR(255) DEFAULT NULL             COMMENT '了解渠道（多选，逗号分隔：朋友推荐,抖音,微信,小红书,百度,AI问答,其他）',
  `source_page`       VARCHAR(32)  DEFAULT NULL             COMMENT '申请来源页面（product-intro / trial）',
  `source_ip`         VARCHAR(64)  DEFAULT NULL             COMMENT '提交者IP地址',
  `user_agent`        VARCHAR(512) DEFAULT NULL             COMMENT '提交时浏览器UA',
  `status`            VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '处理状态（pending/contacted/converted/rejected）',
  `created_at`        VARCHAR(64)  NOT NULL                 COMMENT '提交时间（ISO 8601: 2026-08-11T12:00:00+08:00）',
  `updated_at`        VARCHAR(64)  DEFAULT NULL             COMMENT '更新时间',
  PRIMARY KEY (`id`),
  INDEX `idx_phone` (`contact_phone`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_industry` (`industry`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='试用申请表';
```

**设计说明**：
- `video_demand` 和 `referral_source` 为多选字段，前端将选中项以逗号分隔拼接后传给后端存储（如 `"每天1-20条,每天50条以上"`）。
- `status` 字段默认 `pending`，供运营后续更新处理状态。
- `created_at` / `updated_at` 使用 `varchar(64)` 存储时间，格式为 ISO 8601，与现有数据库规范一致。
- 索引设计：手机号索引（去重查询）、创建时间索引（按时间筛选）、行业索引（分行业统计）、状态索引（按状态筛选）。

---

### 3.4 UI / 表单说明

#### 3.4.1 弹窗表单（`product-intro/index.html`）

**当前状态**：弹窗 `max-width: 400px`，3 个字段，纯前端提交。

**目标状态**：
- 弹窗宽度调整为 `max-width: 520px`（桌面端），移动端 `width: 92vw`。
- 弹窗内容区设置 `max-height: 80vh; overflow-y: auto`，支持滚动。
- 表单字段与 `trial/index.html` 完全一致（8 个字段），字段顺序、label 文案、placeholder、必填标记、选填标记均保持一致。
- 校验逻辑：复用 `trial/index.html` 的校验代码（必填校验 + 手机号正则），错误提示样式对齐（红色边框 + error-msg 文字）。
- 提交逻辑：校验通过后 `fetch('POST /api/trial/submit')`，成功显示成功提示，失败显示错误提示并保留数据。
- 成功提示：与当前一致（"感谢申请！我们将在 1 个工作日内联系您"）。

**弹窗表单字段清单**（与 trial 页面完全一致）：

| 序号 | 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| 1 | 公司/品牌名称 | text input | ✅ | placeholder: "请输入您的公司或品牌名称" |
| 2 | 所属行业 | select 下拉 | ✅ | 11 个选项：电商/游戏/金融/教育/本地生活/美妆个护/3C数码/服装服饰/医疗健康/汽车/其他 |
| 3 | 联系人姓名 | text input | ✅ | placeholder: "请输入您的真实姓名" |
| 4 | 联系手机号 | tel input | ✅ | placeholder: "请输入手机号"；校验 `/^1[3-9]\d{9}$/` |
| 5 | 联系邮箱 | email input | ❌ | placeholder: "请输入邮箱地址" |
| 6 | 业务场景 | textarea | ❌ | placeholder: "例如：批量生成电商带货短视频 / 快速产出游戏买量素材 / 制作AI短剧等"；rows=3 |
| 7 | 视频制作需求 | checkbox 多选 | ❌ | 4 个选项：每天1-20条/每天20-50条/每天50条以上/暂时不确定 |
| 8 | 了解渠道 | checkbox 多选 | ❌ | 7 个选项：朋友推荐/抖音/微信/小红书/百度/AI问答/其他 |

#### 3.4.2 完整页面表单（`trial/index.html`）

**当前状态**：8 个字段，有客户端校验，纯前端提交。

**目标状态**：
- 字段、校验、UI 保持不变。
- 提交逻辑改为：校验通过后 `fetch('POST /api/trial/submit')`，成功显示成功提示，失败显示错误提示并保留数据。

#### 3.4.3 后端 API 设计

```
POST /api/trial/submit
Content-Type: application/json

Request Body:
{
  "company": "深圳某某科技有限公司",
  "industry": "电商",
  "contact_name": "张三",
  "contact_phone": "13800138000",
  "contact_email": "zhangsan@example.com",     // 选填，可为空
  "business_scenario": "批量生成电商带货短视频",  // 选填，可为空
  "video_demand": ["每天1-20条", "每天50条以上"], // 选填，数组，可为空
  "referral_source": ["朋友推荐", "抖音"],       // 选填，数组，可为空
  "source_page": "product-intro"                // 或 "trial"
}

Response (200):
{
  "success": true,
  "message": "申请提交成功"
}

Response (400):
{
  "success": false,
  "message": "手机号格式不正确",
  "errors": [
    { "field": "contact_phone", "message": "请填写有效的手机号" }
  ]
}

Response (429):
{
  "success": false,
  "message": "提交过于频繁，请稍后再试"
}
```

---

### 3.5 待确认问题

| 编号 | 问题 | 影响范围 | 建议 |
|------|------|----------|------|
| Q1 | **弹窗交互方式**：字段从 3 个增加到 8 个后，弹窗是保持弹窗内滚动展示完整表单，还是改为点击"试用"后跳转到 `trial/index.html` 页面？ | 前端交互设计 | 建议保持弹窗内滚动方案（`max-height: 80vh; overflow-y: auto`），减少页面跳转，降低用户流失。如后续数据表明转化率下降，再考虑分步填写（P2-5）。 |
| Q2 | **手机号去重策略**：同一手机号重复提交时，是直接拒绝（返回提示），还是更新已有记录，还是允许重复创建？ | 后端逻辑 / 数据库设计 | 建议 24 小时内拒绝重复提交（P1-3），超过 24 小时允许重新提交（视为用户重新申请）。 |
| Q3 | **短信通知**：是否需要在新申请入库后自动发送短信通知运营人员？如需要，使用哪个短信服务商？ | 后端逻辑 / 运营流程 | 建议作为 P2 功能，先跑通数据入库主流程，后续按需接入。可优先考虑企业微信 Webhook 通知（P2-2），成本更低。 |
| Q4 | **后端技术栈选择**：当前官网为纯静态站点，无后端服务。新增的后端 API 使用什么技术栈？建议 Node.js + Express（轻量、前端团队易上手）。 | 后端架构 | 建议 Node.js + Express，部署于 116.204.78.96 服务器，通过 Nginx 反向代理对外提供 `https://api.yingsaidata.com` 或类似域名。 |
| Q5 | **API 域名与部署**：后端 API 的访问域名是什么？是否复用现有域名（如 `invision.yingsaidata.com/api/`）还是新建子域名？ | 部署 / CORS 配置 | 需与运维确认域名规划和 Nginx 配置。 |
| Q6 | **数据库用户权限**：`homepage` 数据库是否需要新建独立的 MySQL 用户，还是复用现有用户（如 `aigv`）？ | 数据库安全 | 建议新建独立用户 `homepage`，仅授权 `homepage` 库的读写权限，遵循最小权限原则。 |
| Q7 | **管理后台需求**：运营人员是否需要一个可视化的管理后台来查看和导出申请数据？还是直接通过 SQL 查询？ | 产品范围 | 建议先用 SQL 查询 + 导出 CSV 满足基本需求，管理后台作为 P2 功能后续迭代。 |
| Q8 | **弹窗表单移动端适配**：当前弹窗在移动端的展示效果如何？字段增多后是否需要特殊适配？ | 前端适配 | 需在移动端实测弹窗滚动、checkbox 点击区域、键盘遮挡等体验问题。 |
| Q9 | **数据保留策略**：试用申请数据在数据库中保留多久？是否需要定期归档或清理？ | 数据库运维 | 建议永久保留（数据量不大），如需清理可按 `created_at` 超过 2 年的记录归档。 |
| Q10 | **表单提交按钮防抖**：是否需要在前端对提交按钮做防抖处理（提交后禁用按钮直到返回结果），防止用户多次点击？ | 前端交互 | 建议增加防抖，提交后立即禁用按钮并显示"提交中..."，返回后恢复。 |

---

## 四、附录

### 4.1 现有文件路径

| 文件 | 路径 | 说明 |
|------|------|------|
| 产品介绍页 | `d:/东信工作/智影商业版/网站/zhenyu/zhenyu/product-intro/index.html` | 含悬浮试用弹窗（迷你表单），第 1692-1737 行 |
| 试用申请页 | `d:/东信工作/智影商业版/网站/zhenyu/zhenyu/trial/index.html` | 完整表单页面，第 435-634 行 |
| 数据库规范 | `D:/东信工作/数据库/MySQL完整数据字典.md` | MySQL 数据库完整数据字典 |

### 4.2 现有数据库连接信息

| 项目 | 值 |
|------|-----|
| 服务器 | 116.204.78.96:3306（SSH 隧道 → localhost:3307） |
| MySQL 版本 | 8.0+ |
| 连接方式 | `ssh -f -N -L 3307:127.0.0.1:3306 www@116.204.78.96` |
| 现有库 | invision / invision_atlas / ailab_film / ailab_image / aigv |
| 新建库 | `homepage`（本次需求新增） |

### 4.3 里程碑建议

| 阶段 | 内容 | 预估工期 |
|------|------|----------|
| 阶段 1 | 数据库建库建表 + 后端 API 开发（P0-3, P0-4, P0-7, P0-8） | 1-2 天 |
| 阶段 2 | 弹窗表单字段统一 + 校验统一（P0-1, P0-2） | 0.5-1 天 |
| 阶段 3 | 两个表单接入 API + 成功/失败反馈（P0-5, P0-6） | 0.5-1 天 |
| 阶段 4 | 弹窗尺寸自适应 + 来源标识 + 防重复 + 限频 + CORS + HTTPS（P1 全部） | 1-2 天 |
| 阶段 5 | 测试 + 部署上线 | 1 天 |
| **合计** | | **4-7 天** |
