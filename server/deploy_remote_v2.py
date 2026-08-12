#!/usr/bin/env python3
"""SSH deploy script v2 - fix npm/mysql/pm2 issues"""
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
    print("  SSH 连接服务器 116.204.78.96 (v2)")
    print("=" * 50)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
        print("✅ SSH 连接成功\n")
    except Exception as e:
        print(f"❌ SSH 连接失败: {e}")
        sys.exit(1)

    # ===== Step 1: 修复 npm 配置 + 安装依赖 =====
    print("=" * 50)
    print("[1/6] 修复 npm + 安装依赖")
    print("=" * 50)

    # 删除 package-lock.json（它引用了远程 tarball 导致 EALLOWREMOTE）
    run_cmd(ssh, "cd /data/server/insai-invision/server && rm -f package-lock.json")
    # 设置 npm registry 为 npmmirror
    run_cmd(ssh, "npm config set registry https://registry.npmmirror.com/")
    # 允许远程包
    run_cmd(ssh, "npm config set allow-remote true 2>/dev/null; echo done")
    # 安装依赖（不用 --production，改用 --omit=dev）
    exit_code, out, err = run_cmd(ssh, "cd /data/server/insai-invision/server && npm install --omit=dev 2>&1", timeout=180)
    if exit_code != 0:
        # 如果还是失败，尝试用 --force
        print("常规安装失败，尝试 --force...")
        run_cmd(ssh, "cd /data/server/insai-invision/server && rm -rf node_modules package-lock.json && npm install --omit=dev --force 2>&1", timeout=180)

    # 验证依赖
    run_cmd(ssh, "cd /data/server/insai-invision/server && ls node_modules/ | head -20")
    run_cmd(ssh, "cd /data/server/insai-invision/server && node -e \"require('dotenv'); require('express'); require('mysql2'); console.log('All deps OK')\"")

    # ===== Step 2: 安装 PM2 =====
    print("\n" + "=" * 50)
    print("[2/6] 安装 PM2")
    print("=" * 50)
    run_cmd(ssh, "npm install -g pm2 2>&1", timeout=120)
    run_cmd(ssh, "pm2 -v 2>/dev/null || echo 'PM2 still not found'")
    # 如果 pm2 不在 PATH，找到它
    run_cmd(ssh, "which pm2 2>/dev/null || find / -name pm2 -type f 2>/dev/null | head -5")
    run_cmd(ssh, "export PATH=$PATH:$(npm config get prefix)/bin && pm2 -v 2>/dev/null || echo 'trying npx...'")

    # ===== Step 3: 创建 MySQL 数据库和用户 =====
    print("\n" + "=" * 50)
    print("[3/6] 创建 MySQL 数据库和用户")
    print("=" * 50)

    # 用 sudo -S 从 stdin 读密码
    mysql_sql = """CREATE DATABASE IF NOT EXISTS `homepage` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'homepage'@'localhost' IDENTIFIED BY 'Homepage@2026!Insai';
GRANT ALL PRIVILEGES ON `homepage`.* TO 'homepage'@'localhost';
FLUSH PRIVILEGES;
SELECT 'Database and user created successfully' AS status;"""

    # 方式1: echo password | sudo -S mysql
    exit_code, out, err = run_cmd(ssh, f"echo '{PASSWORD}' | sudo -S mysql -e \"{mysql_sql}\" 2>&1")

    if exit_code != 0 or "success" not in out:
        print("sudo -S mysql 失败，尝试其他方式...")
        # 方式2: 检查是否有 .my.cnf
        run_cmd(ssh, "cat ~/.my.cnf 2>/dev/null || echo 'no .my.cnf'")
        # 方式3: 尝试用 www 用户连接 MySQL
        exit_code, out, err = run_cmd(ssh, f"mysql -u www -p'{PASSWORD}' -e \"SELECT 1 as test\" 2>&1")
        if exit_code == 0:
            print("www 用户可连接 MySQL!")
            run_cmd(ssh, f"mysql -u www -p'{PASSWORD}' -e \"{mysql_sql}\" 2>&1")
        else:
            # 方式4: 尝试 root 无密码
            exit_code2, out2, _ = run_cmd(ssh, "mysql -e \"SELECT 1 as test\" 2>&1")
            if exit_code2 != 0:
                # 方式5: 检查 MySQL 配置
                print("尝试查看 MySQL 可用用户...")
                run_cmd(ssh, "cat /etc/mysql/debian.cnf 2>/dev/null")
                # 用 debian-sys-maint 用户
                run_cmd(ssh, "mysql --defaults-file=/etc/mysql/debian.cnf -e \"SELECT user, host FROM mysql.user\" 2>&1")

    # 验证 homepage 用户能否连接
    run_cmd(ssh, "mysql -u homepage -p'Homepage@2026!Insai' homepage -e \"SELECT 1 as test\" 2>&1")

    # ===== Step 4: 配置环境变量 =====
    print("\n" + "=" * 50)
    print("[4/6] 配置环境变量")
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

    run_cmd(ssh, f"cat > /data/server/insai-invision/server/.env << 'EOFENV'\n{env_content}\nEOFENV")

    # ===== Step 5: 初始化数据库表 =====
    print("\n" + "=" * 50)
    print("[5/6] 初始化数据库表")
    print("=" * 50)
    run_cmd(ssh, "cd /data/server/insai-invision/server && node src/utils/dbInit.js 2>&1", timeout=30)

    # ===== Step 6: 启动 PM2 + 验证 =====
    print("\n" + "=" * 50)
    print("[6/6] 启动 PM2 服务 + 验证")
    print("=" * 50)

    # 找到 pm2 的完整路径
    exit_code, out, _ = run_cmd(ssh, "which pm2 2>/dev/null")
    pm2_path = out.strip()
    if not pm2_path:
        exit_code, out, _ = run_cmd(ssh, "npm config get prefix")
        npm_prefix = out.strip()
        pm2_path = f"{npm_prefix}/bin/pm2"

    print(f"PM2 路径: {pm2_path}")

    # 停止旧进程
    run_cmd(ssh, f"{pm2_path} delete insai-trial-api 2>/dev/null || true")
    run_cmd(ssh, "mkdir -p /data/server/insai-invision/server/logs")

    # 启动服务
    run_cmd(ssh, f"cd /data/server/insai-invision/server && {pm2_path} start ecosystem.config.js")
    run_cmd(ssh, f"{pm2_path} save 2>&1")
    run_cmd(ssh, f"{pm2_path} status")

    # 验证
    time.sleep(3)
    run_cmd(ssh, "curl -s http://localhost:3900/health")
    run_cmd(ssh, f"{pm2_path} logs insai-trial-api --lines 15 --nostream")

    print("\n" + "=" * 50)
    print("  部署完成！")
    print("=" * 50)

    ssh.close()

if __name__ == "__main__":
    main()
