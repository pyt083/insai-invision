#!/bin/bash
# ============================================================
# 智影 inVision 试用表单 API — 服务器部署脚本
# 服务器: 116.204.78.96 (www 用户)
# 端口: 3900
# 数据库: homepage.trial_applications
# ============================================================
# 使用方法:
#   1. SSH 登录服务器: ssh www@116.204.78.96
#   2. 将此脚本上传到服务器或直接复制粘贴执行
#   3. 或: bash deploy.sh
# ============================================================

set -e

echo "=========================================="
echo "  智影 inVision 试用表单 API 部署"
echo "=========================================="
echo ""

# ===== 1. 检查环境 =====
echo "[1/8] 检查运行环境..."

if ! command -v node &> /dev/null; then
    echo "  ❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi
echo "  ✅ Node.js: $(node -v)"

if ! command -v npm &> /dev/null; then
    echo "  ❌ npm 未安装"
    exit 1
fi
echo "  ✅ npm: $(npm -v)"

if ! command -v pm2 &> /dev/null; then
    echo "  ⚠️  PM2 未安装，正在安装..."
    npm install -g pm2
fi
echo "  ✅ PM2: $(pm2 -v)"

if ! command -v git &> /dev/null; then
    echo "  ❌ Git 未安装"
    exit 1
fi
echo "  ✅ Git: $(git --version)"
echo ""

# ===== 2. 拉取代码 =====
DEPLOY_DIR="/data/server/insai-invision"
REPO_URL="https://gitlab.yingsaidata.tech/pengyiting/insai-invision.git"

echo "[2/8] 拉取最新代码..."

if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "  仓库已存在，拉取最新代码..."
    cd "$DEPLOY_DIR"
    git fetch --all
    git reset --hard origin/main
    git pull origin main
else
    echo "  首次部署，克隆仓库..."
    mkdir -p /data/server
    cd /data/server
    git clone "$REPO_URL" insai-invision
    cd "$DEPLOY_DIR"
fi

echo "  ✅ 代码已更新到最新版本"
git log --oneline -3
echo ""

# ===== 3. 安装依赖 =====
echo "[3/8] 安装 Node.js 依赖..."

cd "$DEPLOY_DIR/server"
npm install --production

echo "  ✅ 依赖安装完成"
echo ""

# ===== 4. 创建 MySQL 数据库和用户 =====
echo "[4/8] 创建 MySQL 数据库和用户..."

# 使用 sudo mysql (auth_socket 认证)
MYSQL_CMD="sudo mysql"

# 创建数据库和用户
$MYSQL_CMD << 'EOFSQL'
CREATE DATABASE IF NOT EXISTS `homepage` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'homepage'@'localhost' IDENTIFIED BY 'Homepage@2026!Insai';
GRANT ALL PRIVILEGES ON `homepage`.* TO 'homepage'@'localhost';
FLUSH PRIVILEGES;
SELECT 'Database and user created successfully' AS status;
EOFSQL

echo "  ✅ MySQL 数据库 homepage 和用户 homepage 已创建"
echo ""

# ===== 5. 配置环境变量 =====
echo "[5/8] 配置环境变量..."

cat > "$DEPLOY_DIR/server/.env" << 'EOFENV'
# ===== 数据库配置 =====
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
RATE_LIMIT_WINDOW_MS=60000
EOFENV

echo "  ✅ .env 文件已生成"
echo ""

# ===== 6. 初始化数据库表 =====
echo "[6/8] 初始化数据库表..."

cd "$DEPLOY_DIR/server"
npm run db:init

echo "  ✅ 数据库表已创建"
echo ""

# ===== 7. 启动 PM2 服务 =====
echo "[7/8] 启动 PM2 服务..."

# 如果已有同名进程，先停止
pm2 delete insai-trial-api 2>/dev/null || true

# 创建日志目录
mkdir -p "$DEPLOY_DIR/server/logs"

cd "$DEPLOY_DIR/server"
pm2 start ecosystem.config.js
pm2 save

echo "  ✅ PM2 服务已启动"
pm2 status
echo ""

# ===== 8. 验证服务 =====
echo "[8/8] 验证服务..."

sleep 2

# 健康检查
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3900/health)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "  ✅ 健康检查通过 (HTTP 200)"
else
    echo "  ❌ 健康检查失败 (HTTP $HEALTH_RESPONSE)"
    echo "  查看日志: pm2 logs insai-trial-api"
fi

# 检查端口
if command -v lsof &> /dev/null; then
    PORT_CHECK=$(lsof -i :3900 | head -5)
    echo "  端口 3900 状态:"
    echo "$PORT_CHECK"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "服务地址: http://localhost:3900"
echo "健康检查: curl http://localhost:3900/health"
echo "API 端点: POST http://116.204.78.96:3900/api/trial/submit"
echo ""
echo "常用命令:"
echo "  查看日志:   pm2 logs insai-trial-api"
echo "  重启服务:   pm2 restart insai-trial-api"
echo "  停止服务:   pm2 stop insai-trial-api"
echo "  查看状态:   pm2 status"
echo ""
