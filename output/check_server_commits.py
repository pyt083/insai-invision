#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""临时脚本：检查服务器 insai-invision 仓库未推送提交"""
import paramiko

HOST = "116.204.78.96"
USER = "www"
PASSWORD = "Mqa2FWOF@A2QfPX"


def run(ssh, cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print(">>>", cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("[stderr]", err.rstrip())
    print("=" * 60)
    return out


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)

    run(ssh, 'cd /data/server/insai-invision && git log --format="%h %ad %s" --date=format:"%m-%d %H:%M" origin/main..HEAD')
    run(ssh, 'cd /data/server/insai-invision && git diff --stat origin/main..HEAD | tail -30')
    ssh.close()


if __name__ == "__main__":
    main()
