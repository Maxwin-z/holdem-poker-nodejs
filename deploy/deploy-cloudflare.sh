#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-deploy}"

cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js。请先安装 Node.js 20 或更高版本。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "错误：当前 Node.js 版本过低，需要 Node.js 20 或更高版本。" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci --legacy-peer-deps --no-audit --no-fund
fi

if [[ ! -x node_modules/.bin/wrangler ]]; then
  echo "正在安装项目依赖（包括 Wrangler）..."
  npm install --legacy-peer-deps --no-audit --no-fund
fi

case "$COMMAND" in
  setup)
    if [[ -z "${JWT_SECRET:-}" ]]; then
      echo "错误：请先设置稳定的 JWT_SECRET，例如：" >&2
      echo "  JWT_SECRET=\"\$(openssl rand -hex 32)\" npm run setup:cloudflare" >&2
      exit 1
    fi
    echo "检查 Cloudflare 登录状态..."
    npx wrangler whoami
    echo "写入生产环境 JWT_SECRET..."
    printf '%s' "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
    echo "Cloudflare 初始化完成。现在可运行 npm run deploy:cloudflare。"
    ;;
  deploy)
    echo "构建 React 前端..."
    npm run build:web
    echo "部署 Worker、静态资源和 Durable Object..."
    npx wrangler deploy
    ;;
  dev)
    if [[ ! -f .dev.vars ]]; then
      echo "错误：本地调试需要 .dev.vars，内容格式为：" >&2
      echo "  JWT_SECRET=\"请填写一个稳定的随机字符串\"" >&2
      exit 1
    fi
    npm run build:web
    npx wrangler dev
    ;;
  dry-run)
    npm run build:web
    npx wrangler deploy --dry-run
    ;;
  *)
    echo "用法：$0 {setup|deploy|dev|dry-run}" >&2
    exit 1
    ;;
esac
