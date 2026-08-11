/**
 * 数据库初始化脚本
 * 执行建库 + 建表 SQL
 * 运行命令: npm run db:init
 *
 * 注意: 此脚本使用 .env 中的 DB_USER 连接。
 * 如果该用户没有 CREATE DATABASE 权限，脚本会打印提示让运维先执行建库 SQL。
 */

require("dotenv").config();
const mysql = require("mysql2/promise");

const logger = require("./logger");

// 建库 SQL
const CREATE_DATABASE_SQL = `CREATE DATABASE IF NOT EXISTS \`homepage\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;`;

// 建表 SQL
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`homepage\`.\`trial_applications\` (
  \`id\`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  \`company\`           VARCHAR(128) NOT NULL COMMENT '公司/品牌名称',
  \`industry\`          VARCHAR(64)  NOT NULL COMMENT '所属行业',
  \`contact_name\`      VARCHAR(64)  NOT NULL COMMENT '联系人姓名',
  \`contact_phone\`     VARCHAR(20)  NOT NULL COMMENT '联系手机号',
  \`contact_email\`     VARCHAR(128) DEFAULT NULL COMMENT '联系邮箱',
  \`business_scenario\` TEXT         DEFAULT NULL COMMENT '业务场景',
  \`video_demand\`      VARCHAR(255) DEFAULT NULL COMMENT '视频制作需求（逗号分隔）',
  \`referral_source\`   VARCHAR(255) DEFAULT NULL COMMENT '了解渠道（逗号分隔）',
  \`source_page\`       VARCHAR(32)  DEFAULT NULL COMMENT '来源页面',
  \`source_ip\`         VARCHAR(64)  DEFAULT NULL COMMENT '提交者IP',
  \`user_agent\`        VARCHAR(512) DEFAULT NULL COMMENT '浏览器UA',
  \`status\`            VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  \`created_at\`        VARCHAR(64)  NOT NULL COMMENT '提交时间ISO 8601',
  \`updated_at\`        VARCHAR(64)  DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (\`id\`),
  INDEX \`idx_phone\` (\`contact_phone\`),
  INDEX \`idx_created_at\` (\`created_at\`),
  INDEX \`idx_industry\` (\`industry\`),
  INDEX \`idx_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试用申请表';
`;

/**
 * 打印 SQL 供运维参考
 */
function printSqlForManualRun() {
  logger.info("===== 建库建表 SQL（供运维手动执行）=====");
  console.log("");
  console.log(CREATE_DATABASE_SQL);
  console.log("");
  console.log(CREATE_TABLE_SQL.trim());
  console.log("");
  logger.info("===== SQL 结束 =====");
  console.log("");
}

/**
 * 主初始化函数
 */
async function main() {
  logger.info("开始数据库初始化...");
  logger.info("");

  const dbHost = process.env.DB_HOST || "127.0.0.1";
  const dbPort = parseInt(process.env.DB_PORT, 10) || 3306;
  const dbUser = process.env.DB_USER || "homepage";
  const dbPassword = process.env.DB_PASSWORD || "";
  const dbName = process.env.DB_NAME || "homepage";

  logger.info(`数据库地址: ${dbHost}:${dbPort}`);
  logger.info(`数据库用户: ${dbUser}`);
  logger.info(`数据库名称: ${dbName}`);
  logger.info("");

  // 先不带 database 名连接，尝试创建数据库
  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      charset: "utf8mb4"
    });

    // 尝试创建数据库
    logger.info("正在创建数据库...");
    await connection.query(CREATE_DATABASE_SQL);
    logger.info("数据库创建成功（或已存在）");
    logger.info("");

    // 创建表
    logger.info("正在创建 trial_applications 表...");
    await connection.query(`USE \`${dbName}\`;`);
    await connection.query(CREATE_TABLE_SQL);
    logger.info("表创建成功（或已存在）");
    logger.info("");

    // 验证表结构
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trial_applications';`,
      [dbName]
    );

    if (tables.length > 0) {
      logger.info("验证: trial_applications 表已存在");
    } else {
      logger.error("验证失败: trial_applications 表未找到");
    }

    logger.info("");
    logger.info("数据库初始化完成！");
    logger.info("");

    // 打印表结构供参考
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'trial_applications'
       ORDER BY ORDINAL_POSITION;`,
      [dbName]
    );

    logger.info("表结构:");
    console.log("");
    console.log("字段名              | 类型          | 可空  | 默认值        | 注释");
    console.log("--------------------|---------------|-------|---------------|------");
    for (const col of columns) {
      const name = (col.COLUMN_NAME || "").padEnd(18);
      const type = (col.DATA_TYPE || "").padEnd(13);
      const nullable = (col.IS_NULLABLE || "").padEnd(5);
      const def = String(col.COLUMN_DEFAULT || "NULL").padEnd(13);
      const comment = col.COLUMN_COMMENT || "";
      console.log(`${name} | ${type} | ${nullable} | ${def} | ${comment}`);
    }
    console.log("");

    await connection.end();
    process.exit(0);
  } catch (error) {
    logger.error("数据库初始化失败: " + error.message);
    logger.error("");

    if (error.code === "ER_DB_CREATE_DENIED" || error.code === "ER_ACCESS_DENIED_ERROR") {
      logger.warn("当前数据库用户没有 CREATE DATABASE 权限。");
      logger.warn("请运维使用 root 或管理员账户手动执行以下 SQL：");
      logger.warn("");
      printSqlForManualRun();
      logger.warn("执行完成后，再重新运行 npm run db:init 验证表结构。");
    } else if (error.code === "ECONNREFUSED") {
      logger.error("无法连接数据库服务器，请检查：");
      logger.error(`  1. MySQL 服务是否运行在 ${dbHost}:${dbPort}`);
      logger.error("  2. SSH 隧道是否已建立（如使用隧道转发）");
      logger.error("  3. .env 中的 DB_HOST 和 DB_PORT 是否正确");
    } else {
      logger.error("错误详情: " + error.stack);
    }

    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // 忽略关闭连接的错误
      }
    }

    process.exit(1);
  }
}

// 执行初始化
main();
