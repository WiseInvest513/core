#!/bin/bash

# 快速推送脚本
# 使用方法：在项目目录下执行 ./push.sh

cd "$(dirname "$0")"

echo "📦 检查 Git 状态..."
git status

echo ""
echo "🚀 开始推送代码到远程仓库..."

# 尝试推送
if git push origin main; then
    echo ""
    echo "✅ 代码推送成功！"
    git log --oneline -1
else
    echo ""
    echo "❌ 推送失败，请检查："
    echo "   1. 网络连接是否正常"
    echo "   2. 是否配置了代理（如果需要）"
    echo "   3. 是否使用 SSH 方式（推荐）"
    echo ""
    echo "💡 提示：如果使用代理，请先配置："
    echo "   git config --global http.proxy http://127.0.0.1:7890"
    echo "   git config --global https.proxy http://127.0.0.1:7890"
    exit 1
fi

