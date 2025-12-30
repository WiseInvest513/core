const https = require('https');

// Alpha Vantage API Key
const API_KEY = 'XL4PDNIA4QRSKB3P.';

// 从Alpha Vantage获取股票价格
function fetchStockPriceFromAPI(symbol) {
    return new Promise((resolve, reject) => {
        const apiUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
        
        https.get(apiUrl, (apiRes) => {
            let data = '';
            
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            
            apiRes.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    
                    // 检查API错误响应
                    if (jsonData['Error Message']) {
                        reject(new Error(`Alpha Vantage API Error: ${jsonData['Error Message']}`));
                        return;
                    }
                    
                    if (jsonData['Note']) {
                        reject(new Error(`Alpha Vantage API Rate Limit: ${jsonData['Note']}`));
                        return;
                    }
                    
                    const priceStr = jsonData?.['Global Quote']?.['05. price'];
                    if (priceStr) {
                        const price = parseFloat(priceStr);
                        if (Number.isFinite(price) && price > 0) {
                            resolve(price);
                            return;
                        }
                    }
                    reject(new Error('Invalid price data: ' + JSON.stringify(jsonData).substring(0, 200)));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // 处理 OPTIONS 请求（CORS preflight）
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // 从URL路径获取symbol
    // 在Vercel中，动态路由参数可以通过多种方式获取
    // 优先尝试 req.query.symbol，如果不存在则从URL路径解析
    let symbol = req.query?.symbol;
    
    // 如果query中没有，尝试从URL路径解析（格式：/api/stock/VOO）
    if (!symbol && req.url) {
        const urlMatch = req.url.match(/\/api\/stock\/([^/?]+)/);
        if (urlMatch && urlMatch[1]) {
            symbol = urlMatch[1];
        }
    }
    
    // 如果还是没有，尝试从req.url的路径名解析（处理Vercel的URL结构）
    if (!symbol && req.url) {
        // 移除查询字符串
        const pathOnly = req.url.split('?')[0];
        const parts = pathOnly.split('/').filter(p => p);
        // 查找 'stock' 后面的部分
        const stockIndex = parts.indexOf('stock');
        if (stockIndex >= 0 && parts[stockIndex + 1]) {
            symbol = parts[stockIndex + 1];
        }
    }
    
    if (!symbol) {
        console.error('[错误] 无法从URL解析symbol:', { url: req.url, query: req.query });
        res.status(400).json({ error: 'Missing symbol parameter', debug: { url: req.url, query: req.query } });
        return;
    }
    
    symbol = symbol.toUpperCase();
    
    // 只允许 VOO 和 QQQ
    if (symbol !== 'VOO' && symbol !== 'QQQ') {
        res.status(400).json({ error: 'Invalid symbol. Only VOO and QQQ are supported.' });
        return;
    }
    
    try {
        const price = await fetchStockPriceFromAPI(symbol);
        
        // 价格精确到小数点后一位
        const roundedPrice = Math.round(price * 10) / 10;
        
        // 返回统一格式的数据
        const response = {
            symbol: symbol,
            price: roundedPrice,
            timestamp: Date.now()
        };
        
        res.status(200).json(response);
    } catch (error) {
        console.error(`[错误] 获取 ${symbol} 价格失败:`, error.message);
        res.status(500).json({ error: 'Failed to fetch stock price', details: error.message });
    }
};

