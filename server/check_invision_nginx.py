#!/usr/bin/env python3
"""Check invision.insai.cn nginx config and find a way to expose API"""
import paramiko
import sys

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

    # 查看 invision.insai.cn 的 Nginx 配置
    print("=== invision.insai.cn.conf ===")
    run_cmd(ssh, "cat /etc/nginx/conf.d/invision.insai.cn.conf")

    # 查看 insai.cn.conf
    print("\n=== insai.cn.conf ===")
    run_cmd(ssh, "cat /etc/nginx/conf.d/insai.cn.conf")

    # 查看哪些端口在监听
    print("\n=== 端口监听情况 ===")
    run_cmd(ssh, "ss -tlnp 2>/dev/null | grep -E '3900|80|443|8900|5180|8110' || echo 'none found'")

    # 检查是否有 invision 后端在运行
    print("\n=== 检查 invision 后端进程 ===")
    run_cmd(ssh, "ps aux | grep -E 'invision|node|python' | grep -v grep | head -20")

    # 检查 8900 端口（invision 后端）
    print("\n=== 检查 8900 端口 ===")
    run_cmd(ssh, "curl -s http://localhost:8900/ 2>&1 | head -5")

    # 检查 PM2 进程列表
    print("\n=== PM2 进程 ===")
    run_cmd(ssh, "cd /data/server/insai-invision/server && ./node_modules/.bin/pm2 list 2>&1")

    ssh.close()

if __name__ == "__main__":
    main()
