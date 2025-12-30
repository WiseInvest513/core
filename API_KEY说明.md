# 股票价格API配置说明

## 获取Alpha Vantage API Key

1. **访问注册页面**: https://www.alphavantage.co/support/#api-key
2. **填写邮箱和相关信息**（完全免费，无需信用卡）
3. **获取API Key**（会立即发送到你的邮箱）
4. **在 `server.js` 文件中替换API Key**:
   - 找到第 42 行: `const API_KEY = 'YOUR_API_KEY';`
   - 将 `'YOUR_API_KEY'` 替换为你的实际API key
   - 例如: `const API_KEY = 'ABC123XYZ';`

## 免费账户限制

- **每分钟**: 5次请求
- **每天**: 500次请求
- **足够使用**: 每天只需要获取2次（VOO和QQQ各1次），完全足够

## 注意事项

- API Key是免费的，注册过程非常简单
- 不要将API Key提交到公共代码仓库
- 如果API Key泄露，可以在Alpha Vantage网站上重新生成

