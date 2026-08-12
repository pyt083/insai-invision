#!/usr/bin/env python3
"""Check port 5180 and reconfigure trial API to use it via existing Nginx proxy"""
import paramiko
import sys
import time

HOST = "116.204.78.96"
USER = "www"
PASSWORD = "Mqa2FWOF@A2QfPX"

def run_cmd(ssh, cmd, timeout=60):
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
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    print("SSH 连接成功\n")

    # ===== Step 1: 检查 5180 端口 =====
    print("=" * 50)
    print("[1/5] 检查端口 5180")
    print("=" * 50)
    run_cmd(ssh, "ss -tlnp | grep 5180 || echo 'PORT 5180 IS FREE'")
    run_cmd(ssh, "curl -s http://localhost:5180/ 2>&1 | head -5")
    run_cmd(ssh, "curl -s http://localhost:5180/api/ 2>&1 | head -5")

    # ===== Step 2: 修改 .env 端口为 5180 =====
    print("\n" + "=" * 50)
    print("[2/5] 修改 API 端口为 5180")
    print("=" * 50)

    # 读取当前 .env
    run_cmd(ssh, "cat /data/server/insai-invision/server/.env")

    # 修改端口
    run_cmd(ssh, "cd /data/server/insai-invision/server && sed -i 's/PORT=3900/PORT=5180/' .env")
    run_cmd(ssh, "cat /data/server/insai-invision/server/.env | grep PORT")

    # ===== Step 3: 更新 CORS 配置 =====
    print("\n" + "=" * 50)
    print("[3/5] 更新 CORS 配置")
    print("=" * 50)

    # 更新 .env 的 CORS 设置，允许 invision.insai.cn
    run_cmd(ssh, "cd /data/server/insai-invision/server && sed -i 's|CORS_ORIGINS=.*|CORS_ORIGINS=*.insai.cn,*.yingsaidata.com,*.yingsaidata.tech|' .env")
    run_cmd(ssh, "cat /data/server/insai-invision/server/.env | grep CORS")

    # ===== Step 4: 重启 PM2 服务 =====
    print("\n" + "=" * 50)
    print("[4/5] 重启 PM2 服务")
    print("=" * 50)

    # 删除旧的 3900 端口进程，用新配置启动
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 delete insai-trial-api 2>/dev/null || true")

    # 修改 ecosystem.config.js 的端口
    run_cmd(ssh, "cd /data/server/insai-invision/server && sed -i 's/3900/5180/g' ecosystem.config.js")
    run_cmd(ssh, "cat /data/server/insai-invision/server/ecosystem.config.js")

    # 重新启动
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 start ecosystem.config.js")
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 save")
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 status")

    # 验证服务启动
    time.sleep(3)
    run_cmd(ssh, "curl -s http://localhost:5180/health")

    # ===== Step 5: 验证通过 Nginx HTTPS 访问 =====
    print("\n" + "=" * 50)
    print("[5/5] 验证 HTTPS 访问")
    print("=" * 50)

    # 通过 invision.insai.cn 的 Nginx 访问
    run_cmd(ssh, "curl -sk https://invision.insai.cn/api/trial/submit -X POST -H 'Content-Type: application/json' -H 'Origin: https://invision.insai.cn' -d '{\"company\":\"test\",\"industry\":\"test\",\"contact_name\":\"test\",\"contact_phone\":\"13800138000\"}' 2>&1")

    # 健康检查
    run_cmd(ssh, "curl -sk https://invision.insai.cn/health 2>&1 | head -5")

    # 检查日志
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 logs insai-trial-api --lines 10 --nostream")

    print("\n" + "=" * 50)
    print("  配置完成！")
    print("=" * 50)
    print("\nAPI 端口: 5180 (通过 invision.insai.cn Nginx 代理)")
    print("HTTPS URL: https://invision.insai.cn/api/trial/submit")
    print("健康检查: https://invision.insai.cn/health")

    ssh.close()

if __name__ == "__main__":
    main()
