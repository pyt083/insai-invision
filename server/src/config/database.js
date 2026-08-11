/**
 * MySQL 连接池配置
 * 使用 mysql2/promise 创建连接池，支持参数化查询
 */

const mysql = require("mysql2/promise");
const logger = require("../utils/logger");

// 从环境变量读取配置，提供默认值
const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || "homepage",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "homepage",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "+00:00"
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

/**
 * 便捷查询方法 - 自动使用参数化查询
 * @param {string} sql - SQL 语句（使用 ? 占位符）
 * @param {Array} params - 参数数组
 * @returns {Promise<Array>} 查询结果
 */
async function query(sql, params) {
  try {
    const [rows] = await pool.execute(sql, params || []);
    return rows;
  } catch (error) {
    logger.error("数据库查询失败: " + error.message);
    logger.error("SQL: " + sql);
    logger.error("Params: " + JSON.stringify(params));
    throw error;
  }
}

/**
 * 测试数据库连接
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info("数据库连接测试成功");
    return true;
  } catch (error) {
    logger.error("数据库连接测试失败: " + error.message);
    return false;
  }
}

module.exports = {
  pool,
  query,
  testConnection
};
