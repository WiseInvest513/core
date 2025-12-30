const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 股票价格缓存（内存缓存）
let stockPriceCache = {
    VOO: null,
    QQQ: null,
    lastUpdate: 0
};

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

// Alpha Vantage API Key
const API_KEY = 'XL4PDNIA4QRSKB3P.';

// 从Alpha Vantage获取股票价格
function fetchStockPriceFromAPI(symbol, callback) {
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
                        callback(null, price);
                        return;
                    }
                }
                callback(new Error('Invalid price data'));
            } catch (error) {
                callback(error);
            }
        });
    }).on('error', (error) => {
        callback(error);
    });
}

// 获取股票价格（带缓存）
function getStockPrice(symbol, callback) {
    const now = Date.now();
    const cachedPrice = stockPriceCache[symbol];
    const cacheAge = now - stockPriceCache.lastUpdate;
    
    // 如果缓存有效（24小时内），直接返回缓存
    if (cachedPrice && cacheAge < CACHE_DURATION) {
        console.log(`[缓存] 使用缓存的 ${symbol} 价格: $${cachedPrice}`);
        callback(null, cachedPrice);
        return;
    }
    
    // 缓存过期或不存在，从API获取
    console.log(`[API] 从Alpha Vantage获取 ${symbol} 价格...`);
    fetchStockPriceFromAPI(symbol, (error, price) => {
        if (error) {
            // 如果API失败但有旧缓存，使用旧缓存
            if (cachedPrice) {
                console.log(`[降级] API失败，使用旧缓存 ${symbol}: $${cachedPrice}`);
                callback(null, cachedPrice);
                return;
            }
            callback(error);
            return;
        }
        
        // 更新缓存
        stockPriceCache[symbol] = price;
        stockPriceCache.lastUpdate = now;
        console.log(`[成功] 获取 ${symbol} 价格并更新缓存: $${price}`);
        callback(null, price);
    });
}

const server = http.createServer((req, res) => {
    // 处理股票价格代理请求（必须在文件服务之前）
    if (req.url.startsWith('/api/stock/') && req.method === 'GET') {
        const urlParts = req.url.split('/api/stock/');
        const symbolPart = urlParts[1];
        const symbol = symbolPart ? symbolPart.split('?')[0].toUpperCase() : null;
        
        if (!symbol) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Missing symbol parameter' }), 'utf-8');
            return;
        }
        
        console.log(`[API] 请求股票价格: ${symbol}`);
        
        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // 使用带缓存的股票价格获取
        getStockPrice(symbol, (error, price) => {
            if (error) {
                console.error(`[错误] 获取 ${symbol} 价格失败:`, error.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to fetch stock price' }), 'utf-8');
                return;
            }
            
            // 返回统一格式的数据
            const response = {
                symbol: symbol,
                price: price,
                timestamp: Date.now()
            };
            
            res.writeHead(200);
            res.end(JSON.stringify(response), 'utf-8');
        });
        
        return;
    }
    
    // 移除查询参数
    let filePath = '.' + req.url.split('?')[0];
    
    // 默认文件为 index.html
    if (filePath === './') {
        filePath = './index.html';
    }
    
    // 获取文件扩展名
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    // 读取文件
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在，返回 404
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - 文件未找到</h1>', 'utf-8');
            } else {
                // 服务器错误
                res.writeHead(500);
                res.end(`服务器错误: ${error.code}`, 'utf-8');
            }
        } else {
            // 成功返回文件
            res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 服务目录: ${__dirname}`);
});

