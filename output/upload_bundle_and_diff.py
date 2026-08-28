#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""创建本地 git bundle 并上传到服务器，对比服务器 HEAD 与本地 main 的差异"""
import subprocess
import sys
import paramiko

HOST = "116.204.78.96"
USER = "www"
PASSWORD = "Mqa2FWOF@A2QfPX"
LOCAL_DIR = r"D:\东信工作\智影商业版\网站\智影商业版 8.25"
BUNDLE_LOCAL = LOCAL_DIR + r"\output\insai-825-update.bundle"
BUNDLE_REMOTE = "/tmp/insai-825-update.bundle"


def run(ssh, cmd, timeout=120):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(">>>", cmd)
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print("[stderr]", err.rstrip())
    print("[exit: %d]" % code)
    print("=" * 60)
    return code, out, err


def main():
    # 1. 创建 bundle（包含完整历史，因为本地历史与服务器无关）
    print("[1/3] 创建本地 bundle...")
    r = subprocess.run(
        ["git", "bundle", "create", BUNDLE_LOCAL, "main"],
        cwd=LOCAL_DIR, capture_output=True, text=True
    )
    print(r.stdout, r.stderr)
    if r.returncode != 0:
        print("bundle 创建失败")
        sys.exit(1)

    # 2. SFTP 上传
    print("[2/3] 上传 bundle 到服务器...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    sftp = ssh.open_sftp()
    sftp.put(BUNDLE_LOCAL, BUNDLE_REMOTE)
    sftp.close()
    print("上传完成: %s" % BUNDLE_REMOTE)

    # 3. 在服务器上 fetch bundle 并对比
    print("[3/3] 服务器上对比差异...")
    run(ssh, "cd /data/server/insai-invision && git fetch %s main:refs/remotes/local825/main" % BUNDLE_REMOTE, timeout=120)
    run(ssh, "cd /data/server/insai-invision && echo '--- 服务器HEAD 有而本地8.25没有的提交 ---' && git log --oneline local825/main..HEAD | head -20")
    run(ssh, "cd /data/server/insai-invision && echo '--- 本地8.25 有而服务器HEAD没有的提交 ---' && git log --oneline HEAD..local825/main | head -20")
    run(ssh, "cd /data/server/insai-invision && echo '--- 文件差异统计 (服务器HEAD vs 本地8.25) ---' && git diff --stat HEAD local825/main | tail -40")
    ssh.close()


if __name__ == "__main__":
    main()
