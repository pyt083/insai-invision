#!/usr/bin/env python3
"""Find invision backend on port 5180 and check if we can add proxy route"""
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

    # 1. 找到 5180 端口的进程
    print("=== 查找 5180 端口进程 ===")
    run_cmd(ssh, "ss -tlnp | grep 5180")
    run_cmd(ssh, "ps aux | grep 1262555 | grep -v grep")

    # 2. 查看进程的完整命令行
    run_cmd(ssh, "cat /proc/1262555/cmdline | tr '\\0' ' ' 2>/dev/null")
    run_cmd(ssh, "ls -la /proc/1262555/cwd 2>/dev/null")

    # 3. 查看 invision 后端目录
    print("\n=== invision 后端目录 ===")
    run_cmd(ssh, "ls -la /data/server/invision/ 2>/dev/null | head -20")

    # 4. 查看 nginx.conf 的 include 指令
    print("\n=== Nginx 主配置 include ===")
    run_cmd(ssh, "cat /etc/nginx/nginx.conf | grep -i include")

    # 5. 检查是否有用户可写的 Nginx 配置目录
    run_cmd(ssh, "find /etc/nginx/ -writable -type f 2>/dev/null || echo 'no writable nginx configs'")
    run_cmd(ssh, "find /etc/nginx/ -type d -writable 2>/dev/null || echo 'no writable nginx dirs'")

    # 6. 检查 invision 后端是否是 Python/FastAPI
    print("\n=== 检查 invision 后端类型 ===")
    run_cmd(ssh, "ls /data/server/invision/*.py /data/server/invision/app/*.py /data/server/invision/main.py /data/server/invision/app.py 2>/dev/null || echo 'no python files found'")
    run_cmd(ssh, "ls /data/server/invision/package.json 2>/dev/null && cat /data/server/invision/package.json | head -20 || echo 'no package.json'")

    # 7. 检查 5180 进程的工作目录和启动文件
    print("\n=== 5180 进程详情 ===")
    run_cmd(ssh, "ls -la /proc/1262555/cwd 2>/dev/null")
    run_cmd(ssh, "cat /proc/1262555/environ 2>/dev/null | tr '\\0' '\\n' | grep -E 'PWD|HOME|PATH|PWD' | head -10")

    # 8. 尝试查看 invision 后端的路由配置
    print("\n=== invision 后端路由 ===")
    run_cmd(ssh, "curl -s http://localhost:5180/docs 2>&1 | head -10")
    run_cmd(ssh, "curl -s http://localhost:5180/openapi.json 2>&1 | head -100")

    ssh.close()

if __name__ == "__main__":
    main()
