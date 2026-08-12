#!/usr/bin/env python3
"""Check server nginx/firewall and configure reverse proxy"""
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

    # Check nginx
    print("=== Nginx 检查 ===")
    run_cmd(ssh, "which nginx 2>/dev/null || echo 'no nginx'")
    run_cmd(ssh, "nginx -v 2>&1 || true")
    run_cmd(ssh, "systemctl status nginx 2>/dev/null | head -5 || echo 'no systemd nginx'")
    run_cmd(ssh, "ps aux | grep nginx | grep -v grep || echo 'nginx not running'")

    # Check nginx config
    run_cmd(ssh, "ls /etc/nginx/sites-enabled/ 2>/dev/null || echo 'no sites-enabled'")
    run_cmd(ssh, "ls /etc/nginx/conf.d/ 2>/dev/null || echo 'no conf.d'")
    run_cmd(ssh, "cat /etc/nginx/nginx.conf 2>/dev/null | head -50")

    # Check firewall
    print("\n=== 防火墙检查 ===")
    run_cmd(ssh, "echo 'Mqa2FWOF@A2QfPX' | sudo -S ufw status 2>&1 || echo 'no ufw or no sudo'")
    run_cmd(ssh, "iptables -L -n 2>/dev/null | head -20 || echo 'no iptables access'")

    # Check what ports are listening
    print("\n=== 端口监听 ===")
    run_cmd(ssh, "ss -tlnp 2>/dev/null | head -20 || netstat -tlnp 2>/dev/null | head -20")

    # Check existing nginx sites
    print("\n=== Nginx 站点配置 ===")
    run_cmd(ssh, "cat /etc/nginx/sites-enabled/* 2>/dev/null | head -100")
    run_cmd(ssh, "cat /etc/nginx/conf.d/*.conf 2>/dev/null | head -100")

    ssh.close()

if __name__ == "__main__":
    main()
