#!/usr/bin/env python3
"""SSH deploy script for insai-invision backend"""
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
    print("=" * 50)
    print("  SSH 连接服务器 116.204.78.96")
    print("=" * 50)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
        print("✅ SSH 连接成功\n")
    except Exception as e:
        print(f"❌ SSH 连接失败: {e}")
        sys.exit(1)

    # Step 1: 检查环境
    print("=" * 50)
    print("[1/8] 检查运行环境")
    print("=" * 50)
    run_cmd(ssh, "whoami && pwd")
    run_cmd(ssh, "node -v 2>/dev/null || echo 'Node.js NOT installed'")
    run_cmd(ssh, "npm -v 2>/dev/null || echo 'npm NOT installed'")
    run_cmd(ssh, "pm2 -v 2>/dev/null || echo 'pm2 NOT installed'")
    run_cmd(ssh, "git --version 2>/dev/null || echo 'git NOT installed'")
    run_cmd(ssh, "mysql --version 2>/dev/null || echo 'mysql NOT installed'")

    # Step 2: 拉取代码
    print("\n" + "=" * 50)
    print("[2/8] 拉取/更新代码")
    print("=" * 50)

    # 检查是否已有仓库
    exit_code, out, _ = run_cmd(ssh, "test -d /data/server/insai-invision/.git && echo 'EXISTS' || echo 'NOT_EXISTS'")

    if "EXISTS" in out:
        print("仓库已存在，拉取最新代码...")
        run_cmd(ssh, "cd /data/server/insai-invision && git fetch --all && git reset --hard origin/main && git pull origin main")
    else:
        print("首次部署，克隆仓库...")
        run_cmd(ssh, "mkdir -p /data/server")
        run_cmd(ssh, "cd /data/server && git clone https://gitlab.yingsaidata.tech/pengyiting/insai-invision.git", timeout=60)

    run_cmd(ssh, "cd /data/server/insai-invision && git log --oneline -3")

    # Step 3: 安装依赖
    print("\n" + "=" * 50)
    print("[3/8] 安装 Node.js 依赖")
    print("=" * 50)
    run_cmd(ssh, "cd /data/server/insai-invision/server && npm install --production", timeout=180)

    # Step 4: 创建 MySQL 数据库和用户
    print("\n" + "=" * 50)
    print("[4/8] 创建 MySQL 数据库和用户")
    print("=" * 50)

    mysql_sql = """CREATE DATABASE IF NOT EXISTS `homepage` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'homepage'@'localhost' IDENTIFIED BY 'Homepage@2026!Insai';
GRANT ALL PRIVILEGES ON `homepage`.* TO 'homepage'@'localhost';
FLUSH PRIVILEGES;
SELECT 'Database and user created successfully' AS status;"""

    # 先尝试 sudo mysql
    exit_code, out, err = run_cmd(ssh, f"sudo mysql -e \"{mysql_sql}\" 2>&1")

    if exit_code != 0:
        print("sudo mysql 失败，尝试 mysql -u root...")
        # 尝试直接 mysql
        run_cmd(ssh, f"mysql -u root -e \"{mysql_sql}\" 2>&1")

    # Step 5: 配置环境变量
    print("\n" + "=" * 50)
    print("[5/8] 配置环境变量")
    print("=" * 50)

    env_content = """# ===== 数据库配置 =====
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=homepage
DB_PASSWORD=Homepage@2026!Insai
DB_NAME=homepage

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

    # Write .env file
    run_cmd(ssh, f"cat > /data/server/insai-invision/server/.env << 'EOFENV'\n{env_content}\nEOFENV")
    run_cmd(ssh, "cat /data/server/insai-invision/server/.env")

    # Step 6: 初始化数据库表
    print("\n" + "=" * 50)
    print("[6/8] 初始化数据库表")
    print("=" * 50)
    run_cmd(ssh, "cd /data/server/insai-invision/server && npm run db:init", timeout=30)

    # Step 7: 启动 PM2 服务
    print("\n" + "=" * 50)
    print("[7/8] 启动 PM2 服务")
    print("=" * 50)
    run_cmd(ssh, "pm2 delete insai-trial-api 2>/dev/null || true")
    run_cmd(ssh, "mkdir -p /data/server/insai-invision/server/logs")
    run_cmd(ssh, "cd /data/server/insai-invision/server && pm2 start ecosystem.config.js")
    run_cmd(ssh, "pm2 save")
    run_cmd(ssh, "pm2 status")

    # Step 8: 验证服务
    print("\n" + "=" * 50)
    print("[8/8] 验证服务")
    print("=" * 50)
    time.sleep(3)
    run_cmd(ssh, "curl -s http://localhost:3900/health")
    run_cmd(ssh, "pm2 logs insai-trial-api --lines 10 --nostream")

    print("\n" + "=" * 50)
    print("  部署完成！")
    print("=" * 50)

    ssh.close()
    print("\nSSH 连接已关闭。")

if __name__ == "__main__":
    main()
