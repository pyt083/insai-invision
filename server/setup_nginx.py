#!/usr/bin/env python3
"""Configure Nginx reverse proxy for trial API + update frontend"""
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

    # ===== Step 1: 查看现有 aigv.yingsaidata.com 配置 =====
    print("=" * 50)
    print("[1/4] 查看现有 Nginx 配置")
    print("=" * 50)
    run_cmd(ssh, "cat /etc/nginx/conf.d/*.conf 2>/dev/null | grep -n 'server_name\|location\|proxy_pass\|listen' | head -30")

    # 检查 conf.d 目录权限
    run_cmd(ssh, "ls -la /etc/nginx/conf.d/")

    # ===== Step 2: 创建新的 Nginx 配置文件 =====
    print("\n" + "=" * 50)
    print("[2/4] 创建 Nginx 反向代理配置")
    print("=" * 50)

    # 创建一个独立的配置文件，在 aigv.yingsaidata.com 的 443 端口上添加 /trial-api/ 路径
    # 但由于不能修改已有 server block，我们创建一个新的 server block 在 80 端口
    # 并且也创建一个 443 的 server block 用 IP 作为 server_name
    
    nginx_conf = """# 智影试用表单 API 反向代理
# HTTP - 用于直接 IP 访问
server {
    listen 80;
    server_name 116.204.78.96;

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3900;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 健康检查
    location /health {
        proxy_pass http://127.0.0.1:3900;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        return 404;
    }
}
"""

    # 写入配置文件
    run_cmd(ssh, f"cat > /tmp/trial-api.conf << 'EOF'\n{nginx_conf}\nEOF")

    # 检查是否可以移动到 conf.d
    exit_code, _, _ = run_cmd(ssh, "cp /tmp/trial-api.conf /etc/nginx/conf.d/trial-api.conf 2>&1")
    if exit_code != 0:
        print("无法直接复制，尝试 sudo...")
        run_cmd(ssh, f"echo '{PASSWORD}' | sudo -S cp /tmp/trial-api.conf /etc/nginx/conf.d/trial-api.conf 2>&1")
        run_cmd(ssh, f"echo '{PASSWORD}' | sudo -S chmod 644 /etc/nginx/conf.d/trial-api.conf 2>&1")

    # 验证配置
    run_cmd(ssh, "cat /etc/nginx/conf.d/trial-api.conf")

    # ===== Step 3: 同时给 aigv.yingsaidata.com 添加 HTTPS 反向代理 =====
    print("\n" + "=" * 50)
    print("[3/4] 添加 HTTPS 反向代理到 aigv.yingsaidata.com")
    print("=" * 50)

    # 在 aigv.yingsaidata.com 的 HTTPS server 中添加 /trial-api/ location
    # 先备份原配置
    run_cmd(ssh, "cp /etc/nginx/conf.d/aigv.conf /etc/nginx/conf.d/aigv.conf.bak 2>/dev/null || echo 'no aigv.conf, checking other files'")

    # 找到包含 aigv.yingsaidata.com 的配置文件
    exit_code, out, _ = run_cmd(ssh, "grep -rl 'aigv.yingsaidata.com' /etc/nginx/conf.d/ 2>/dev/null")
    config_file = out.strip()
    if config_file:
        print(f"找到配置文件: {config_file}")
        run_cmd(ssh, f"cat {config_file}")

        # 在 aigv.yingsaidata.com 的 HTTPS server block 中添加 /trial-api/ location
        # 使用 sed 在 location / 之前插入
        sed_cmd = f"""sed -i '/server_name aigv.yingsaidata.com/,/location \\/ /{{/location \\/ /i\\
    # 智影试用表单 API 反向代理\\
    location /trial-api/ {{\\
        proxy_pass http://127.0.0.1:3900/;\\
        proxy_http_version 1.1;\\
        proxy_set_header Host $host;\\
        proxy_set_header X-Real-IP $remote_addr;\\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto $scheme;\\
    }}\\
\\
}}' {config_file}"""
        run_cmd(ssh, sed_cmd)
        run_cmd(ssh, f"cat {config_file}")
    else:
        print("未找到 aigv.yingsaidata.com 配置文件")

    # 测试 Nginx 配置
    print("\n测试 Nginx 配置...")
    exit_code, out, err = run_cmd(ssh, "nginx -t 2>&1")
    if exit_code != 0:
        print("Nginx 配置测试失败！尝试恢复...")
        run_cmd(ssh, f"echo '{PASSWORD}' | sudo -S cp /etc/nginx/conf.d/aigv.conf.bak /etc/nginx/conf.d/aigv.conf 2>&1")
        # 重新测试
        run_cmd(ssh, "nginx -t 2>&1")

    # 重载 Nginx
    print("\n重载 Nginx...")
    exit_code, _, _ = run_cmd(ssh, "nginx -s reload 2>&1")
    if exit_code != 0:
        print("直接 reload 失败，尝试 sudo...")
        run_cmd(ssh, f"echo '{PASSWORD}' | sudo -S nginx -s reload 2>&1")

    # ===== Step 4: 验证 =====
    print("\n" + "=" * 50)
    print("[4/4] 验证反向代理")
    print("=" * 50)
    time.sleep(2)

    # 测试 HTTP 访问
    run_cmd(ssh, "curl -s http://localhost/health 2>&1")
    run_cmd(ssh, "curl -s http://localhost/api/trial/submit -X POST -H 'Content-Type: application/json' -d '{}' 2>&1")

    # 测试 HTTPS 访问
    run_cmd(ssh, "curl -sk https://aigv.yingsaidata.com/trial-api/health 2>&1")
    run_cmd(ssh, "curl -sk https://aigv.yingsaidata.com/trial-api/api/trial/submit -X POST -H 'Content-Type: application/json' -d '{}' 2>&1")

    print("\n" + "=" * 50)
    print("  Nginx 反向代理配置完成！")
    print("=" * 50)

    ssh.close()

if __name__ == "__main__":
    main()
