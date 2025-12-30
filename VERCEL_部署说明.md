# Vercel 部署说明

## 快速部署步骤

### 方法一：通过 Vercel 网站（推荐）

1. **访问 Vercel**
   - 打开 https://vercel.com
   - 使用 GitHub 账号登录（点击 "Continue with GitHub"）

2. **导入项目**
   - 登录后，点击 "Add New..." → "Project"
   - 在 "Import Git Repository" 中找到你的仓库 `WiseInvest513/core`
   - 点击 "Import"

3. **配置项目**
   - Project Name: 可以保持 `core` 或改为你喜欢的名字
   - Framework Preset: 选择 "Other" 或留空（Vercel 会自动检测）
   - Root Directory: 保持 `.`（根目录）
   - Build Command: 留空（这是静态项目）
   - Output Directory: 留空
   - Install Command: 留空

4. **部署**
   - 点击 "Deploy" 按钮
   - 等待部署完成（通常 1-2 分钟）

5. **访问网站**
   - 部署完成后，Vercel 会提供一个 URL，格式如：`https://core-xxx.vercel.app`
   - 你也可以在项目设置中配置自定义域名

### 方法二：使用 Vercel CLI（可选）

如果你想使用命令行工具：

```bash
# 安装 Vercel CLI
npm i -g vercel

# 在项目目录下登录
vercel login

# 部署
vercel

# 生产环境部署
vercel --prod
```

## 项目结构

部署到 Vercel 后：
- **静态文件**（index.html, style.css, script.js 等）会自动提供服务
- **API 路由**（`/api/stock/[symbol]`）会作为 Serverless Function 运行
- **实时股票价格**功能完全可用

## API 路由说明

- `/api/stock/VOO` - 获取 VOO 股票价格
- `/api/stock/QQQ` - 获取 QQQ 股票价格

API 会从 Alpha Vantage 获取实时价格，并返回 JSON 格式：
```json
{
  "symbol": "VOO",
  "price": 632.60,
  "timestamp": 1234567890
}
```

## 注意事项

1. **API Key**: Alpha Vantage API Key 已经配置在代码中
2. **缓存**: 前端会缓存价格（5分钟），减少 API 调用
3. **CORS**: API 已经配置了 CORS，允许跨域访问
4. **免费额度**: Vercel 免费版每月有 100GB 带宽和 1000 小时 Serverless Function 执行时间，对于这个项目完全够用

## 更新代码

每次你 push 代码到 GitHub 的 main 分支，Vercel 会自动重新部署。你也可以在 Vercel 后台手动触发部署。

## 自定义域名（可选）

1. 在 Vercel 项目设置中点击 "Domains"
2. 输入你的域名
3. 按照提示配置 DNS 记录
4. 等待 DNS 生效后，你的网站就可以通过自定义域名访问了

