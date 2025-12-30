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
                    const priceStr = jsonData?.['Global Quote']?.['05. price'];
                    if (priceStr) {
                        const price = parseFloat(priceStr);
                        if (Number.isFinite(price) && price > 0) {
                            resolve(price);
                            return;
                        }
                    }
                    reject(new Error('Invalid price data'));
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
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // 从URL路径获取symbol（Vercel动态路由参数在req.query中）
    // URL格式: /api/stock/VOO 或 /api/stock/QQQ
    // 参数名就是文件名中的 [symbol]，所以是 req.query.symbol
    const symbol = (req.query.symbol || '').toUpperCase();
    
    if (!symbol) {
        res.status(400).json({ error: 'Missing symbol parameter' });
        return;
    }
    
    // 只允许 VOO 和 QQQ
    if (symbol !== 'VOO' && symbol !== 'QQQ') {
        res.status(400).json({ error: 'Invalid symbol. Only VOO and QQQ are supported.' });
        return;
    }
    
    try {
        const price = await fetchStockPriceFromAPI(symbol);
        
        // 返回统一格式的数据
        const response = {
            symbol: symbol,
            price: price,
            timestamp: Date.now()
        };
        
        res.status(200).json(response);
    } catch (error) {
        console.error(`[错误] 获取 ${symbol} 价格失败:`, error.message);
        res.status(500).json({ error: 'Failed to fetch stock price' });
    }
};

