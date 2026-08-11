/**
 * 简易日志工具
 * 输出到 stdout/stderr，PM2 自动捕获到日志文件
 */

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * 获取时间戳前缀
 * @returns {string}
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * 格式化日志消息
 * @param {string} level - 日志级别
 * @param {string} message - 日志内容
 * @returns {string}
 */
function format(level, message) {
  return `[${timestamp()}] [${level}] ${message}`;
}

module.exports = {
  info(message) {
    console.log(format("INFO", message));
  },
  warn(message) {
    console.warn(format("WARN", message));
  },
  error(message) {
    console.error(format("ERROR", message));
  },
  debug(message) {
    if (NODE_ENV === "development") {
      console.log(format("DEBUG", message));
    }
  }
};
