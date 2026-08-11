/**
 * PM2 进程管理配置
 * 启动命令: pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: "insai-trial-api",
      script: "src/app.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3900
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3900
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      max_memory_restart: "256M"
    }
  ]
};
