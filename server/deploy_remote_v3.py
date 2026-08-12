#!/usr/bin/env python3
"""SSH deploy script v3 - use existing MySQL user + local PM2"""
import paramiko
import sys
import time

HOST = "116.204.78.96"
USER = "www"
PASSWORD = "Mqa2FWOF@A2QfPX"

def run_cmd(ssh, cmd, timeout=120):
    """Run command and stream output"""
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(f"[stderr] {err.rstrip()}")
    print(f"[exit: {exit_code}]")
    return exit_code, out, err

def main():
    # MySQL credentials (try invision first, then aigv)
    mysql_candidates = [
        ("invision", "Invision@123456"),
        ("aigv", "aigv@123456"),
        ("ailab_film", "AilabFilm_2026!Mysql#Local9"),
    ]

    print("=" * 50)
    print("  SSH 部署 v3 — 使用现有 MySQL 用户 + 本地 PM2")
    print("=" * 50)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
        print("SSH 连接成功\n")
    except Exception as e:
        print(f"SSH 连接失败: {e}")
        sys.exit(1)

    # ===== Step 1: 验证 npm 依赖 =====
    print("=" * 50)
    print("[1/5] 验证 npm 依赖")
    print("=" * 50)
    run_cmd(ssh, "cd /data/server/insai-invision/server && node -e \"require('dotenv'); require('express'); require('mysql2'); require('express-validator'); require('cors'); console.log('All deps OK')\"")

    # ===== Step 2: MySQL 建库建表 =====
    print("\n" + "=" * 50)
    print("[2/5] MySQL 连接 + 建库建表")
    print("=" * 50)

    # 尝试连接 MySQL
    db_user = None
    db_pass = None

    for user, pwd in mysql_candidates:
        print(f"\n尝试 MySQL 用户: {user} ...")
        exit_code, out, err = run_cmd(ssh, f"mysql -u {user} -p'{pwd}' -e \"SELECT 'OK' as status\" 2>&1")
        if exit_code == 0 and "OK" in out:
            db_user = user
            db_pass = pwd
            print(f"  -> {user} 用户连接成功!")
            break

    if db_user is None:
        print("所有已知 MySQL 用户都无法连接!")
        sys.exit(1)

    # 尝试创建 homepage 数据库
    print(f"\n尝试创建 homepage 数据库 (用 {db_user} 用户)...")
    exit_code, out, err = run_cmd(ssh, f"mysql -u {db_user} -p'{db_pass}' -e \"CREATE DATABASE IF NOT EXISTS homepage DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\" 2>&1")

    if exit_code == 0:
        print("homepage 数据库创建成功!")
        # 尝试创建 homepage 专用用户
        exit_code2, _, _ = run_cmd(ssh, f"mysql -u {db_user} -p'{db_pass}' -e \"CREATE USER IF NOT EXISTS 'homepage'@'localhost' IDENTIFIED BY 'Homepage@2026!Insai'; GRANT ALL PRIVILEGES ON homepage.* TO 'homepage'@'localhost'; FLUSH PRIVILEGES;\" 2>&1")
        if exit_code2 == 0:
            print("homepage 用户创建成功!")
            final_db_user = "homepage"
            final_db_pass = "Homepage@2026!Insai"
        else:
            print("无法创建 homepage 用户，继续使用 " + db_user + " 用户")
            final_db_user = db_user
            final_db_pass = db_pass
        final_db_name = "homepage"
    else:
        print(db_user + " 用户无 CREATE DATABASE 权限")
        print("改为在 " + db_user + " 数据库下建表...")
        final_db_name = db_user  # 使用用户同名的数据库
        final_db_user = db_user
        final_db_pass = db_pass

    # 验证连接
    run_cmd(ssh, f"mysql -u {final_db_user} -p'{final_db_pass}' {final_db_name} -e \"SELECT 'DB OK' as status\" 2>&1")

    # ===== Step 3: 配置 .env =====
    print("\n" + "=" * 50)
    print("[3/5] 配置环境变量")
    print("=" * 50)

    env_content = f"""# ===== 数据库配置 =====
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER={final_db_user}
DB_PASSWORD={final_db_pass}
DB_NAME={final_db_name}

# ===== 连接池 =====
DB_POOL_SIZE=10

# ===== API 服务 =====
PORT=3900
NODE_ENV=production

# ===== CORS =====
CORS_ORIGINS=*.insai.cn,*.yingsaidata.com

# ===== 限频 =====
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000"""

    run_cmd(ssh, f"cat > /data/server/insai-invision/server/.env << 'EOFENV'\n{env_content}\nEOFENV")
    run_cmd(ssh, "cat /data/server/insai-invision/server/.env")

    # ===== Step 4: 建表 =====
    print("\n" + "=" * 50)
    print("[4/5] 初始化数据库表")
    print("=" * 50)

    # 先尝试 dbInit.js
    exit_code, out, err = run_cmd(ssh, "cd /data/server/insai-invision/server && node src/utils/dbInit.js 2>&1", timeout=30)

    if exit_code != 0 or "失败" in out or "ERROR" in out:
        print("\ndbInit.js 失败，手动建表...")
        # 手动建表
        create_table_sql = f"""USE {final_db_name};
CREATE TABLE IF NOT EXISTS trial_applications (
  id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  company           VARCHAR(128) NOT NULL COMMENT '公司名称',
  industry          VARCHAR(64)  NOT NULL COMMENT '所属行业',
  contact_name      VARCHAR(64)  NOT NULL COMMENT '联系人姓名',
  contact_phone     VARCHAR(20)  NOT NULL COMMENT '联系手机号',
  contact_email     VARCHAR(128) DEFAULT NULL COMMENT '联系邮箱',
  business_scenario TEXT         DEFAULT NULL COMMENT '业务场景',
  video_demand      VARCHAR(255) DEFAULT NULL COMMENT '视频制作需求',
  referral_source   VARCHAR(255) DEFAULT NULL COMMENT '了解渠道',
  source_page       VARCHAR(32)  DEFAULT NULL COMMENT '来源页面',
  source_ip         VARCHAR(64)  DEFAULT NULL COMMENT '提交者IP',
  user_agent        VARCHAR(512) DEFAULT NULL COMMENT '浏览器UA',
  status            VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  created_at        VARCHAR(64)  NOT NULL COMMENT '提交时间',
  updated_at        VARCHAR(64)  DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX idx_phone (contact_phone),
  INDEX idx_created_at (created_at),
  INDEX idx_industry (industry),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='试用申请表';"""

        run_cmd(ssh, f"mysql -u {final_db_user} -p'{final_db_pass}' -e \"{create_table_sql}\" 2>&1")

        # 验证表
        run_cmd(ssh, f"mysql -u {final_db_user} -p'{final_db_pass}' {final_db_name} -e \"SHOW TABLES LIKE 'trial_applications'; DESCRIBE trial_applications;\" 2>&1")
    else:
        # 验证表
        run_cmd(ssh, f"mysql -u {final_db_user} -p'{final_db_pass}' {final_db_name} -e \"SHOW TABLES LIKE 'trial_applications'; DESCRIBE trial_applications;\" 2>&1")

    # ===== Step 5: 安装本地 PM2 + 启动服务 =====
    print("\n" + "=" * 50)
    print("[5/5] 安装本地 PM2 + 启动服务")
    print("=" * 50)

    # 本地安装 pm2
    run_cmd(ssh, "cd /data/server/insai-invision/server && npm install pm2 2>&1", timeout=60)

    PM2_CMD = "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2"

    # 停止旧进程
    run_cmd(ssh, f"{PM2_CMD} delete insai-trial-api 2>/dev/null || true")
    run_cmd(ssh, "mkdir -p /data/server/insai-invision/server/logs")

    # 启动服务
    run_cmd(ssh, f"{PM2_CMD} start ecosystem.config.js")
    run_cmd(ssh, f"{PM2_CMD} save 2>&1")
    run_cmd(ssh, f"{PM2_CMD} status")

    # 验证
    time.sleep(3)
    run_cmd(ssh, "curl -s http://localhost:3900/health")
    run_cmd(ssh, f"{PM2_CMD} logs insai-trial-api --lines 15 --nostream")

    print("\n" + "=" * 50)
    print("  部署完成！")
    print("=" * 50)
    print(f"\n数据库: {final_db_name}")
    print(f"用户: {final_db_user}")
    print(f"表: trial_applications")
    print(f"服务端口: 3900")

    ssh.close()

if __name__ == "__main__":
    main()
