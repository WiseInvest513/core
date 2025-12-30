# 美股定投纠正器

一个用于计算投资 VOO（标普500）和 QQQ（纳指100）ETF 预期收益的工具。

## 功能特性

- 📊 实时股价获取（Finnhub API）
- 💱 汇率转换（CNY ↔ USD）
- 📈 复利收益计算（1年、3年、10年）
- 📱 PWA 支持，可添加到主屏幕
- 🎨 苹果风格深色界面
- 📤 分享图生成功能
- 💾 本地状态保存

## 使用说明

### 1. 配置 Finnhub API Key

1. 访问 [Finnhub](https://finnhub.io/) 注册账号并获取免费的 API Key
2. 打开 `script.js` 文件
3. 找到第 3 行的 `FINNHUB_API_KEY` 常量
4. 将 `YOUR_FINNHUB_API_KEY_HERE` 替换为你的 API Key

```javascript
// script.js 第 3 行
const FINNHUB_API_KEY = 'your_actual_api_key_here';
```

**注意：** 如果没有配置 API Key 或 API 请求失败，系统会自动使用 Fallback 价格：
- VOO: $510
- QQQ: $495

### 2. 本地运行

由于需要加载外部资源（API），建议使用 HTTP 服务器运行，而不是直接打开 HTML 文件。

#### 使用 Python

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

#### 使用 Node.js

```bash
# 安装 http-server
npm install -g http-server

# 运行
http-server -p 8000
```

然后在浏览器中访问 `http://localhost:8000`

### 3. 部署

可以将项目部署到 GitHub Pages、Netlify、Vercel 等静态网站托管服务。

## 项目结构

```
.
├── index.html          # 主 HTML 文件
├── style.css           # 样式文件
├── script.js           # JavaScript 逻辑
├── manifest.json       # PWA 配置
├── .gitignore          # Git 忽略文件
└── README.md           # 说明文档
```

## 技术说明

### ETF 年化收益率（CAGR）

- **VOO（标普500）**: 10.5%
- **QQQ（纳指100）**: 14.5%

这些数值基于历史数据估算，仅供参考，不构成投资建议。

### 计算公式

**复利公式：**
```
FV = PV × (1 + r)^n
```

其中：
- FV = 未来价值（Future Value）
- PV = 现值（Present Value）
- r = 年化收益率（CAGR）
- n = 年数

### API 使用

- **Finnhub API**: 获取实时股价
  - 免费版限制：60 请求/分钟
  - 文档：https://finnhub.io/docs/api
  
- **ExchangeRate API**: 获取汇率
  - 免费使用
  - 文档：https://www.exchangerate-api.com/docs

## 浏览器支持

- Chrome/Edge（推荐）
- Safari（iOS 和 macOS）
- Firefox
- 支持 Service Worker 和 LocalStorage 的现代浏览器

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

