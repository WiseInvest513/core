// ===== 全局变量 =====
// 美股价格（写死的价格）
const PRICE_VOO_FALLBACK = 632;
const PRICE_QQQ_FALLBACK = 620;
const RATE_VOO = 0.12; // 12% 年化收益率
const RATE_QQQ = 0.17; // 17% 年化收益率

// 动态获取的股票价格（会在页面加载时从API获取）
let stockPrices = {
    VOO: PRICE_VOO_FALLBACK,
    QQQ: PRICE_QQQ_FALLBACK
};

// USD到CNY汇率（可以后续改为API获取）
const USD_TO_CNY = 7.2;

// 实物价格数据（RMB）
const EQUIVALENT_ITEMS = [
    { name: '猪脚饭', price: 20, icon: '🍚', unit: '碗' },
    { name: 'KFC', price: 50, icon: '🍗', unit: '份' },
    { name: '看电影', price: 70, icon: '🎬', unit: '场' },
    { name: '火锅', price: 200, icon: '🍲', unit: '顿' },
    { name: '会所嫩模', price: 1800, icon: '💃', unit: '次' },
    { name: 'iPhone15', price: 6000, icon: '📱', unit: '台' },
    { name: '劳力士', price: 70000, icon: '⌚', unit: '块' },
    { name: '小米SU7', price: 220000, icon: '🏎️', unit: '辆' },
    { name: '奔驰E300L', price: 450000, icon: '🚘', unit: '辆' }
];

// ===== API 配置 =====
// 加密货币价格：使用真实 API（CoinPaprika）获取实时数据
// VOO/QQQ 价格：使用写死的模拟值（见上方 PRICE_VOO 和 PRICE_QQQ）

// CoinPaprika API URLs（预设代币 - 真实API）
const COINPAPRIKA_TICKER_URLS = {
    BTC: 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin',
    ETH: 'https://api.coinpaprika.com/v1/tickers/eth-ethereum',
    SOL: 'https://api.coinpaprika.com/v1/tickers/sol-solana',
    BNB: 'https://api.coinpaprika.com/v1/tickers/bnb-bnb',
    OKB: 'https://api.coinpaprika.com/v1/tickers/okb-okb'
};

// 状态变量
let cryptoPrices = {}; // 加密货币价格 {BTC: 50000, ETH: 3000, ...}
let customTokens = new Map(); // 自定义代币数据
let currentSelectId = null;
let updating = false;
let localStorageAvailable = false;
let loadPricesInFlight = null;
let tokenSearchSessionCache = new Map();

// ===== 工具函数 =====
function nowMs() {
    return Date.now();
}

function formatNumber(num) {
    if (!Number.isFinite(num) || num === 0) return '0';
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1) {
        // 价格精确到小数点后一位
        const rounded = Math.round((abs + Number.EPSILON) * 10) / 10;
        const parts = rounded.toFixed(1).replace(/\.?0+$/, '').split('.');
        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return sign + intPart + (parts[1] ? '.' + parts[1] : '');
    }
    const str = abs.toString();
    if (str.includes('e') || str.includes('E')) {
        const [base, exp] = str.toLowerCase().split('e');
        const numBase = parseFloat(base);
        const numExp = parseInt(exp, 10);
        const result = numBase * Math.pow(10, numExp);
        return formatNumber(result);
    }
    const frac = abs.toString().split('.')[1] || '';
    const firstNonZero = frac.search(/[1-9]/);
    if (firstNonZero === -1) return '0';
    const cut = Math.min(frac.length, firstNonZero + 2);
    return sign + '0.' + frac.slice(0, cut);
}

function parseAmountInput(raw) {
    if (!raw || !raw.trim()) return NaN;
    const cleaned = String(raw).replace(/,/g, '').trim();
    // 检查是否为纯整数（允许负号，但实际使用中会过滤掉负数）
    if (!/^-?\d+$/.test(cleaned)) {
        return NaN; // 不是纯整数
    }
    const num = parseInt(cleaned, 10);
    return Number.isFinite(num) && num > 0 ? num : NaN;
}

// ===== 缓存系统 =====
const CACHE_VERSION = 1;
const CACHE_KEYS = {
    presetCryptoPrices: `valueConverter:caches:v${CACHE_VERSION}:presetCryptoPrices`,
    coingeckoTokenPrice: `valueConverter:caches:v${CACHE_VERSION}:coingeckoTokenPrice`,
    stockPrices: `valueConverter:caches:v${CACHE_VERSION}:stockPrices`
};

const memoryCache = new Map();

function readCache(key, maxAgeMs) {
    const raw = (() => {
        if (localStorageAvailable) {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                return null;
            }
        }
        return memoryCache.get(key) || null;
    })();
    if (!raw) return null;
    try {
        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!payload || typeof payload.ts !== 'number') return null;
        if (typeof maxAgeMs === 'number' && maxAgeMs >= 0) {
            if (nowMs() - payload.ts > maxAgeMs) return null;
        }
        return payload;
    } catch (e) {
        return null;
    }
}

function writeCache(key, data) {
    const payload = { ts: nowMs(), data };
    if (localStorageAvailable) {
        try {
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
            memoryCache.set(key, payload);
        }
    } else {
        memoryCache.set(key, payload);
    }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timeout);
    }
}

// ===== 股票价格获取 =====
async function fetchStockPrice(symbol) {
    // 通过本地服务器代理访问股票价格API（服务器端有24小时缓存）
    const url = `/api/stock/${symbol}`;
    
    try {
        const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 10000);
        if (!res.ok) {
            throw new Error(`请求失败（${symbol}）: ${res.status}`);
        }
        
        const data = await res.json();
        
        // 服务器返回格式: { symbol: "VOO", price: 632.60, timestamp: 1234567890 }
        if (data?.price && Number.isFinite(data.price) && data.price > 0) {
            return data.price;
        }
        
        throw new Error(`返回数据格式异常（${symbol}）: ${JSON.stringify(data).substring(0, 200)}`);
    } catch (error) {
        console.error(`获取 ${symbol} 价格失败:`, error.message);
        throw error;
    }
}

async function getStockPrices({ forceRefresh = false } = {}) {
    // 服务器端已经有24小时缓存，前端每次都从服务器获取即可
    // 如果服务器缓存有效，会立即返回；如果过期，服务器会自动从API获取并更新缓存
    try {
        const [vooPrice, qqqPrice] = await Promise.all([
            fetchStockPrice('VOO'),
            fetchStockPrice('QQQ')
        ]);
        
        const prices = {
            VOO: vooPrice,
            QQQ: qqqPrice
        };
        
        // 前端也缓存一下（5分钟缓存，避免频繁请求），但主要依赖服务器缓存
        writeCache(CACHE_KEYS.stockPrices, prices);
        return { prices, source: 'realtime', ts: nowMs() };
    } catch (error) {
        console.error('获取股票价格失败:', error);
        
        // 如果获取失败，尝试使用前端旧缓存（5分钟内）
        const stale = readCache(CACHE_KEYS.stockPrices, 5 * 60 * 1000);
        if (stale?.data) {
            return { prices: stale.data, source: 'stale-cache', ts: stale.ts };
        }
        
        // 如果连旧缓存都没有，使用fallback价格
        const fallbackPrices = {
            VOO: PRICE_VOO_FALLBACK,
            QQQ: PRICE_QQQ_FALLBACK
        };
        return { prices: fallbackPrices, source: 'fallback', ts: nowMs() };
    }
}

// ===== 加密货币价格获取 =====
async function fetchCoinPaprikaUsdPrice({ symbol, url }) {
    const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 8000);
    if (!res.ok) {
        throw new Error(`CoinPaprika 请求失败（${symbol}）: ${res.status}`);
    }
    const data = await res.json();
    const priceRaw = data?.quotes?.USD?.price;
    const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(priceRaw);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`CoinPaprika 返回数据异常，缺少 ${symbol} USD 价格`);
    }
    return price;
}

async function getPresetCryptoPrices({ forceRefresh = false } = {}) {
    const TTL_MS = 3 * 60 * 1000; // 3分钟缓存
    if (!forceRefresh) {
        const cached = readCache(CACHE_KEYS.presetCryptoPrices, TTL_MS);
        if (cached?.data) {
            return { prices: cached.data, source: 'cache', ts: cached.ts };
        }
    }
    
    const entries = await Promise.all(
        Object.entries(COINPAPRIKA_TICKER_URLS).map(async ([symbol, url]) => {
            try {
                const price = await fetchCoinPaprikaUsdPrice({ symbol, url });
                return [symbol, price];
            } catch (e) {
                console.warn(`获取 ${symbol} 价格失败:`, e.message);
                return [symbol, null];
            }
        })
    );
    
    const prices = {};
    for (const [symbol, price] of entries) {
        if (price !== null) {
            prices[symbol] = price;
        }
    }
    
    if (Object.keys(prices).length > 0) {
        writeCache(CACHE_KEYS.presetCryptoPrices, prices);
    } else {
        // 所有价格获取失败，尝试使用旧缓存
        const stale = readCache(CACHE_KEYS.presetCryptoPrices, -1);
        if (stale?.data) {
            return { prices: stale.data, source: 'stale-cache', ts: stale.ts };
        }
    }
    
    return { prices, source: 'realtime', ts: nowMs() };
}

// ===== 加载数据 =====
async function loadData({ forceRefresh = false } = {}) {
    if (loadPricesInFlight) return loadPricesInFlight;
    
    loadPricesInFlight = (async () => {
        try {
            // 并行获取加密货币价格和股票价格
            const [cryptoResult, stockResult] = await Promise.all([
                getPresetCryptoPrices({ forceRefresh }),
                getStockPrices({ forceRefresh })
            ]);
            
            cryptoPrices = cryptoResult.prices;
            stockPrices = stockResult.prices;
            
            console.log(`加密货币价格来源: ${cryptoResult.source}`);
            console.log(`股票价格来源: ${stockResult.source}`, stockPrices);
            
            // 无论是否有输入，都要更新价格显示
            const vooPriceEl = document.getElementById('vooPrice');
            const qqqPriceEl = document.getElementById('qqqPrice');
            if (vooPriceEl) {
                vooPriceEl.textContent = `$${formatNumber(stockPrices.VOO)}`;
            }
            if (qqqPriceEl) {
                qqqPriceEl.textContent = `$${formatNumber(stockPrices.QQQ)}`;
            }
            
            // 如果页面已有输入，重新计算
            const amountInput = document.getElementById('amountInput');
            if (amountInput && amountInput.value.trim()) {
                calculate();
            }
        } catch (error) {
            console.error('数据加载失败:', error);
            const staleCrypto = readCache(CACHE_KEYS.presetCryptoPrices, -1);
            const staleStock = readCache(CACHE_KEYS.stockPrices, -1);
            
            if (staleCrypto?.data) {
                cryptoPrices = staleCrypto.data;
            }
            if (staleStock?.data) {
                stockPrices = staleStock.data;
            } else {
                // 使用fallback价格
                stockPrices = {
                    VOO: PRICE_VOO_FALLBACK,
                    QQQ: PRICE_QQQ_FALLBACK
                };
            }
            
            // 更新价格显示
            document.getElementById('vooPrice').textContent = `$${formatNumber(stockPrices.VOO)}`;
            document.getElementById('qqqPrice').textContent = `$${formatNumber(stockPrices.QQQ)}`;
        }
    })().finally(() => {
        loadPricesInFlight = null;
    });
    
    return loadPricesInFlight;
}

// ===== 核心计算逻辑 =====
function calculate() {
    if (updating) return;
    updating = true;
    
    const amountInput = document.getElementById('amountInput');
    const currencySelect = document.getElementById('currencySelect');
    const yearSlider = document.getElementById('yearSlider');
    
    const rawAmount = amountInput.value.trim();
    if (!rawAmount) {
        clearResults();
        updating = false;
        return;
    }
    
    const amount = parseAmountInput(rawAmount);
    if (isNaN(amount) || amount <= 0) {
        updating = false;
        return;
    }
    
    const selectedCurrency = currencySelect.value;
    const selectedYears = parseInt(yearSlider.value) || 10;
    
    // 获取加密货币价格
    let cryptoPrice = null;
    if (selectedCurrency === 'CUSTOM') {
        const customOption = currencySelect.querySelector('option[value="CUSTOM"]');
        const tokenKey = customOption?.getAttribute('data-token-key');
        if (tokenKey && customTokens.has(tokenKey)) {
            cryptoPrice = customTokens.get(tokenKey).price;
        }
    } else if (cryptoPrices[selectedCurrency]) {
        cryptoPrice = cryptoPrices[selectedCurrency];
    }
    
    if (!cryptoPrice || cryptoPrice <= 0) {
        clearResults();
        updating = false;
        return;
    }
    
    // 计算加密货币总价值（USD）
    const principalUSD = amount * cryptoPrice;
    
    // 使用动态获取的股票价格
    const currentVooPrice = stockPrices.VOO;
    const currentQqqPrice = stockPrices.QQQ;
    
    // 计算可购买的美股份额
    const vooShares = principalUSD / currentVooPrice;
    const qqqShares = principalUSD / currentQqqPrice;
    
    // 计算选定年份后的未来价值
    const vooFutureUSD = calculateFutureValue(principalUSD, RATE_VOO, selectedYears);
    const qqqFutureUSD = calculateFutureValue(principalUSD, RATE_QQQ, selectedYears);
    
    // 计算收益
    const vooGain = vooFutureUSD - principalUSD;
    const vooGainPercent = ((vooFutureUSD / principalUSD - 1) * 100).toFixed(1);
    const qqqGain = qqqFutureUSD - principalUSD;
    const qqqGainPercent = ((qqqFutureUSD / principalUSD - 1) * 100).toFixed(1);
    
    // 更新 UI
    document.getElementById('vooPrice').textContent = `$${formatNumber(currentVooPrice)}`;
    document.getElementById('qqqPrice').textContent = `$${formatNumber(currentQqqPrice)}`;
    document.getElementById('vooShares').textContent = `${formatNumber(vooShares)} 股`;
    document.getElementById('qqqShares').textContent = `${formatNumber(qqqShares)} 股`;
    
    // VOO 预测结果
    document.getElementById('vooProjectionTitle').textContent = `${selectedYears}年后预计`;
    document.getElementById('vooProjectionValue').textContent = `$${formatNumber(vooFutureUSD)}`;
    document.getElementById('vooProjectionGain').textContent = `+$${formatNumber(vooGain)} (+${vooGainPercent}%)`;
    
    // QQQ 预测结果
    document.getElementById('qqqProjectionTitle').textContent = `${selectedYears}年后预计`;
    document.getElementById('qqqProjectionValue').textContent = `$${formatNumber(qqqFutureUSD)}`;
    document.getElementById('qqqProjectionGain').textContent = `+$${formatNumber(qqqGain)} (+${qqqGainPercent}%)`;
    
    // 计算并显示等价物品（分别显示）
    const vooFutureCNY = vooFutureUSD * USD_TO_CNY;
    const qqqFutureCNY = qqqFutureUSD * USD_TO_CNY;
    updateEquivalentItems('vooEquivalentList', vooFutureCNY);
    updateEquivalentItems('qqqEquivalentList', qqqFutureCNY);
    
    updating = false;
    saveState();
}

function calculateFutureValue(principal, rate, years) {
    return principal * Math.pow(1 + rate, years);
}

function clearResults() {
    document.getElementById('vooPrice').textContent = `$${formatNumber(stockPrices.VOO)}`;
    document.getElementById('qqqPrice').textContent = `$${formatNumber(stockPrices.QQQ)}`;
    document.getElementById('vooShares').textContent = '--';
    document.getElementById('qqqShares').textContent = '--';
    document.getElementById('vooProjectionTitle').textContent = '10年后预计';
    document.getElementById('vooProjectionValue').textContent = '--';
    document.getElementById('vooProjectionGain').textContent = '--';
    document.getElementById('qqqProjectionTitle').textContent = '10年后预计';
    document.getElementById('qqqProjectionValue').textContent = '--';
    document.getElementById('qqqProjectionGain').textContent = '--';
    
    // 清空等价物品
    const vooEquivalentList = document.getElementById('vooEquivalentList');
    const qqqEquivalentList = document.getElementById('qqqEquivalentList');
    if (vooEquivalentList) vooEquivalentList.innerHTML = '';
    if (qqqEquivalentList) qqqEquivalentList.innerHTML = '';
}

// ===== 等价物品计算 =====
function updateEquivalentItems(listId, totalCNY) {
    const equivalentList = document.getElementById(listId);
    if (!equivalentList) return;
    
    // 筛选出价格小于等于总价值的物品，按价格从低到高排序
    const affordableItems = EQUIVALENT_ITEMS
        .filter(item => item.price <= totalCNY)
        .sort((a, b) => a.price - b.price);
    
    if (affordableItems.length === 0) {
        // 如果买不起任何东西，显示提示信息
        equivalentList.innerHTML = '<div class="equivalent-item-small" style="justify-content: center; color: var(--text-muted); font-size: 14px;">兄弟该赚钱了</div>';
        return;
    }
    
    // 随机选择4个物品（如果少于4个则全部显示）
    const selectedItems = [];
    const itemCount = Math.min(4, affordableItems.length);
    const availableIndices = affordableItems.map((_, index) => index);
    
    for (let i = 0; i < itemCount; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        const selectedIndex = availableIndices.splice(randomIndex, 1)[0];
        selectedItems.push(affordableItems[selectedIndex]);
    }
    
    // 按价格从低到高排序
    selectedItems.sort((a, b) => a.price - b.price);
    
    // 生成HTML
    equivalentList.innerHTML = selectedItems.map(item => {
        const count = Math.floor(totalCNY / item.price);
        const unit = item.unit || '份'; // 默认使用'份'作为兜底
        return `
            <div class="equivalent-item-small">
                <div style="display: flex; align-items: center;">
                    <span class="equivalent-icon">${item.icon}</span>
                    <span class="equivalent-name-small">${item.name}</span>
                </div>
                <span class="equivalent-count-small">${formatNumber(count)}${unit}</span>
            </div>
        `;
    }).join('');
}

// ===== 自定义代币搜索 =====
async function searchTokens() {
    const query = document.getElementById('tokenSearchInput').value.trim();
    if (!query) return;
    
    const queryKey = query.toLowerCase();
    const cached = tokenSearchSessionCache.get(queryKey);
    if (cached && nowMs() - cached.ts < 60 * 1000) {
        displaySearchResults(cached.coins || []);
        return;
    }
    
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    // 显示加载状态
    searchResults.innerHTML = '<div class="loading-indicator">搜索中...</div>';
    
    try {
        const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
        const response = await fetchJsonWithTimeout(searchUrl, { method: 'GET' }, 8000);
        
        if (!response.ok) {
            throw new Error('搜索请求失败');
        }
        
        const data = await response.json();
        const coins = data.coins || [];
        tokenSearchSessionCache.set(queryKey, { ts: nowMs(), coins });
        displaySearchResults(coins);
    } catch (error) {
        console.error('搜索代币时出错:', error);
        if (searchResults) {
            searchResults.innerHTML = '<div class="no-results">搜索失败，请稍后重试</div>';
        }
    }
}

function displaySearchResults(coins) {
    const searchResults = document.getElementById('searchResults');
    if (coins.length === 0) {
        searchResults.innerHTML = '<div class="no-results">未找到相关代币</div>';
        return;
    }
    
    searchResults.innerHTML = '';
    coins.slice(0, 10).forEach(coin => {
        const tokenDiv = document.createElement('div');
        tokenDiv.className = 'token-result';
        tokenDiv.onclick = () => selectCustomToken(coin);
        
        tokenDiv.innerHTML = `
            <img src="${coin.large || coin.thumb}" alt="${coin.name}" class="token-logo" onerror="this.style.display='none'">
            <div class="token-content">
                <div class="token-name">${coin.name}</div>
                <div class="token-symbol">${coin.symbol}</div>
            </div>
        `;
        
        searchResults.appendChild(tokenDiv);
    });
}

async function selectCustomToken(coin) {
    const selectId = currentSelectId;
    try {
        const tokenPriceCacheKey = `${CACHE_KEYS.coingeckoTokenPrice}:${coin.id}`;
        const cachedPrice = readCache(tokenPriceCacheKey, 2 * 60 * 1000);
        
        let price = 0;
        if (cachedPrice?.data?.price) {
            price = cachedPrice.data.price;
        } else {
            const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`;
            const response = await fetchJsonWithTimeout(priceUrl, { method: 'GET' }, 8000);
            
            if (response.ok) {
                const priceData = await response.json();
                price = priceData[coin.id]?.usd || 0;
                writeCache(tokenPriceCacheKey, { price });
            }
        }
        
        if (price === 0) {
            throw new Error('无法获取代币价格');
        }
        
        const tokenKey = coin.symbol.toUpperCase();
        customTokens.set(tokenKey, {
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            image: coin.large || coin.thumb,
            price: price
        });
        
        if (selectId) {
            const currentSelect = document.getElementById(selectId);
            if (currentSelect) {
                const customOption = currentSelect.querySelector('option[value="CUSTOM"]');
                if (customOption) {
                    customOption.setAttribute('data-token-key', tokenKey);
                    customOption.setAttribute('data-token-name', coin.name);
                    customOption.setAttribute('data-token-symbol', coin.symbol.toUpperCase());
                    // 更新显示文本为代币符号
                    customOption.textContent = coin.symbol.toUpperCase();
                }
                // 注意：如果当前已经是CUSTOM，设置value不会触发change事件，所以需要手动调用calculate
                const wasCustom = currentSelect.value === 'CUSTOM';
                currentSelect.value = 'CUSTOM';
                
                closeCustomTokenModal();
                
                // 无论是否触发change事件，都需要计算和保存
                calculate();
                saveState();
            }
        } else {
            closeCustomTokenModal();
        }
    } catch (error) {
        console.error('选择代币时出错:', error);
        alert('获取代币信息失败：' + error.message);
    }
}

function openCustomTokenModal() {
    const modal = document.getElementById('customTokenModal');
    if (modal) {
        modal.style.display = 'flex'; // 使用flex以正确居中显示
        document.getElementById('tokenSearchInput').value = '';
        document.getElementById('searchResults').innerHTML = '';
        setTimeout(() => {
            const input = document.getElementById('tokenSearchInput');
            if (input) input.focus();
        }, 100);
    }
}

function closeCustomTokenModal() {
    const modal = document.getElementById('customTokenModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentSelectId = null;
}

// ===== 状态保存和恢复 =====
function checkLocalStorage() {
    try {
        const testKey = '__localStorage_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        localStorageAvailable = true;
        return true;
    } catch (e) {
        localStorageAvailable = false;
        return false;
    }
}

function saveState() {
    if (!localStorageAvailable) return;
    try {
        const amountInput = document.getElementById('amountInput');
        const currencySelect = document.getElementById('currencySelect');
        
        // 保存自定义代币的显示信息
        let customTokenKey = null;
        if (currencySelect && currencySelect.value === 'CUSTOM') {
            const customOption = currencySelect.querySelector('option[value="CUSTOM"]');
            customTokenKey = customOption?.getAttribute('data-token-key');
        }
        
        const state = {
            amount: amountInput ? amountInput.value : '',
            currency: currencySelect ? currencySelect.value : 'BTC',
            customTokenKey: customTokenKey,
            customTokens: Array.from(customTokens.entries())
        };
        localStorage.setItem('valueConverterState', JSON.stringify(state));
    } catch (e) {
        console.warn('保存状态失败:', e);
    }
}

function restoreState() {
    if (!localStorageAvailable) return;
    try {
        const savedState = localStorage.getItem('valueConverterState');
        if (!savedState) return;
        const state = JSON.parse(savedState);
        const amountInput = document.getElementById('amountInput');
        const currencySelect = document.getElementById('currencySelect');
        if (amountInput && state.amount) amountInput.value = state.amount;
        if (currencySelect && state.currency) {
            currencySelect.value = state.currency;
            // 如果恢复的是自定义代币，需要恢复显示文本和属性
            if (state.currency === 'CUSTOM' && state.customTokenKey && state.customTokens) {
                const customOption = currencySelect.querySelector('option[value="CUSTOM"]');
                const tokensMap = new Map(state.customTokens);
                if (customOption && tokensMap.has(state.customTokenKey)) {
                    const token = tokensMap.get(state.customTokenKey);
                    customOption.setAttribute('data-token-key', state.customTokenKey);
                    customOption.setAttribute('data-token-name', token.name);
                    customOption.setAttribute('data-token-symbol', token.symbol.toUpperCase());
                    customOption.textContent = token.symbol.toUpperCase();
                }
            }
        }
        if (state.customTokens) {
            customTokens = new Map(state.customTokens);
        }
        
        // 更新自定义代币搜索按钮的显示状态
        const currencySelectAfterRestore = document.getElementById('currencySelect');
        const customTokenSearchBtn = document.getElementById('customTokenSearchBtn');
        if (currencySelectAfterRestore && customTokenSearchBtn) {
            if (currencySelectAfterRestore.value === 'CUSTOM') {
                customTokenSearchBtn.style.display = 'flex';
            } else {
                customTokenSearchBtn.style.display = 'none';
            }
        }
    } catch (e) {
        console.warn('恢复状态失败:', e);
    }
}

// ===== Toast 提示 =====
function showToast(message) {
    const toast = document.getElementById('shareToast');
    if (toast) {
        const textEl = toast.querySelector('.toast-text');
        if (textEl) textEl.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// ===== 分享图生成 =====
function formatShareTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

async function generateSharePngBlob() {
    const amountInput = document.getElementById('amountInput');
    const currencySelect = document.getElementById('currencySelect');
    const yearSlider = document.getElementById('yearSlider');
    
    if (!amountInput || !amountInput.value.trim()) {
        throw new Error('请先输入数量');
    }
    
    const rawAmount = amountInput.value.trim();
    const amount = parseAmountInput(rawAmount);
    if (isNaN(amount) || amount <= 0) {
        throw new Error('数量无效');
    }
    
    const selectedCurrency = currencySelect.value;
    const selectedYears = parseInt(yearSlider?.value) || 10;
    
    let cryptoPrice = null;
    let cryptoName = '';
    
    if (selectedCurrency === 'CUSTOM') {
        const customOption = currencySelect.querySelector('option[value="CUSTOM"]');
        const tokenKey = customOption?.getAttribute('data-token-key');
        if (tokenKey && customTokens.has(tokenKey)) {
            const token = customTokens.get(tokenKey);
            cryptoPrice = token.price;
            cryptoName = token.symbol.toUpperCase();
        }
    } else {
        cryptoPrice = cryptoPrices[selectedCurrency];
        cryptoName = selectedCurrency;
    }
    
    if (!cryptoPrice || cryptoPrice <= 0) {
        throw new Error('无法获取加密货币价格');
    }
    
    const principalUSD = amount * cryptoPrice;
    const currentVooPrice = stockPrices.VOO;
    const currentQqqPrice = stockPrices.QQQ;
    
    const vooShares = principalUSD / currentVooPrice;
    const qqqShares = principalUSD / currentQqqPrice;
    
    const vooFutureUSD = calculateFutureValue(principalUSD, RATE_VOO, selectedYears);
    const qqqFutureUSD = calculateFutureValue(principalUSD, RATE_QQQ, selectedYears);
    
    const vooFutureCNY = vooFutureUSD * USD_TO_CNY;
    const qqqFutureCNY = qqqFutureUSD * USD_TO_CNY;
    
    // 获取等值物品（选择3-4个代表性物品）
    function getRepresentativeItems(totalCNY) {
        const affordable = EQUIVALENT_ITEMS.filter(item => item.price <= totalCNY).sort((a, b) => a.price - b.price);
        if (affordable.length === 0) return [];
        
        const priority = ['猪脚饭', 'iPhone15', '劳力士', '小米SU7'];
        const selected = [];
        const used = new Set();
        
        // 优先选择有代表性的物品
        for (const name of priority) {
            const item = affordable.find(i => i.name === name);
            if (item && !used.has(item.name) && selected.length < 4) {
                selected.push(item);
                used.add(item.name);
            }
        }
        
        // 如果还不够，从剩余物品中补充（按价格从低到高）
        const remaining = affordable.filter(i => !used.has(i.name));
        const needed = Math.min(4, affordable.length) - selected.length;
        for (let i = 0; i < needed; i++) {
            selected.push(remaining[i]);
        }
        
        // 确保至少选择3个，如果可用物品少于3个则全部显示
        const finalCount = Math.min(Math.max(3, selected.length), affordable.length);
        return selected.slice(0, finalCount).sort((a, b) => a.price - b.price);
    }
    
    const vooItems = getRepresentativeItems(vooFutureCNY);
    const qqqItems = getRepresentativeItems(qqqFutureCNY);
    
    // 画布设置
    const scale = 3;
    const W = 1200;
    const pad = 40; // 减少顶部padding（50 -> 40）
    const cardGap = 40;
    const cardPadding = 50;
    const cardWidth = (W - pad * 2 - cardGap) / 2;
    
    const cardHeight = 750; // 增加卡片高度，确保内容装得下
    const footerHeight = 50; // footer高度（减少：60 -> 50）
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 先计算高度（动态计算）
    let estimatedY = pad;
    
    // Header高度（添加了顶部标题）
    estimatedY += 55; // 顶部标题高度（"价值观纠正器指数版"）
    estimatedY += 28; // 间距（减少：30 -> 28）
    estimatedY += 45; // 主标题高度（"别炒了兄弟"）
    estimatedY += 35; // 副标题高度
    estimatedY += 30; // 间距（减少：35 -> 30）
    
    // 卡片高度
    estimatedY += cardHeight;
    
    // Footer（减少底部padding）
    estimatedY += footerHeight + 30; // 减少底部padding（pad -> 30）
    
    const H = estimatedY;
    canvas.width = W * scale;
    canvas.height = H * scale;
    ctx.scale(scale, scale);
    
    // 背景
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    
    const centerX = W / 2;
    let cursorY = pad;
    
    // ===== 顶部标题 =====
    // "价值观纠正器指数版" - 作为主标题，使用更粗的字重以区别于正文
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    // 使用900字重（最粗）来突出标题，与"别炒了兄弟"的bold（700）区分
    ctx.font = '900 60px "PingFang SC", "Microsoft YaHei", sans-serif'; // 使用900 weight（最粗）和更大的字号
    const appTitleY = cursorY + 42;
    ctx.fillText('价值观纠正器指数版', centerX, appTitleY);
    cursorY = appTitleY + 28; // 减少间距：30 -> 28
    
    // ===== Header =====
    // 主标题模块（"别炒了兄弟"）
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px "PingFang SC"';
    const mainTitle = `别炒了兄弟，你这 ${formatNumber(amount)} 个 ${cryptoName}...`;
    const mainTitleY = cursorY + 38;
    ctx.fillText(mainTitle, centerX, mainTitleY);
    cursorY = mainTitleY + 10; // 紧凑间距
    
    // 副标题模块
    ctx.fillStyle = '#8E8E93';
    ctx.font = '400 24px "PingFang SC"';
    const subTitleY = cursorY + 28;
    ctx.fillText(`要是换成美股，${selectedYears}年后能变成这样👇`, centerX, subTitleY);
    cursorY = subTitleY + 25; // 紧凑间距
    
    // ===== 绘制卡片的辅助函数（模块化设计） =====
    function drawCard(cardX, cardY, symbol, name, currentPrice, shares, futureUSD, items, futureCNY) {
        // 绘制卡片背景
        roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 24);
        ctx.fillStyle = 'rgba(28, 28, 30, 0.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(142, 142, 147, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const cardLeft = cardX + cardPadding;
        const cardRight = cardX + cardWidth - cardPadding;
        const cardCenterX = cardX + cardWidth / 2; // 卡片中心X坐标
        
        // 使用固定的起始位置，确保内容不会因为变化而移动
        let y = cardY + cardPadding + 40; // 固定的顶部偏移
        
        // ===== 模块1: 卡片头部（符号+价格） =====
        const headerY = y; // 固定Y坐标
        
        // 左侧符号
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 38px "PingFang SC"';
        ctx.fillText(symbol, cardLeft, headerY);
        
        // 右侧价格（同一行）
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8E8E93';
        ctx.font = '400 28px "PingFang SC"';
        ctx.fillText(`$${formatNumber(currentPrice)}`, cardRight, headerY);
        
        // 删除名称（标普500/纳指100），直接跳到下一个模块
        y = headerY + 125; // 头部到"可买股数"的固定间距（再增加20px，往下移）
        
        // ===== 模块2: 可买股数（居中展示） =====
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'center'; // 居中对齐
        ctx.fillStyle = '#FF9F0A';
        ctx.font = 'bold 72px "PingFang SC"';
        const sharesY = y;
        ctx.fillText(`可买 ${formatNumber(shares)} 股`, cardCenterX, sharesY);
        y = sharesY + 95; // 固定间距（减少20px，保持总高度不变）
        
        // ===== 模块3: 未来预测（居中展示） =====
        ctx.textAlign = 'center'; // 居中对齐，与"可买股数"对齐
        ctx.fillStyle = '#30D158';
        ctx.font = 'bold 48px "PingFang SC"';
        const projectionLabelY = y;
        ctx.fillText(`${selectedYears}年后预计:`, cardCenterX, projectionLabelY);
        y = projectionLabelY + 65;
        
        ctx.font = 'bold 56px "PingFang SC"';
        const projectionValueY = y;
        ctx.fillText(`$${formatNumber(futureUSD)}`, cardCenterX, projectionValueY);
        y = projectionValueY + 100;
        
        // ===== 模块4: 分割线 =====
        ctx.strokeStyle = 'rgba(142, 142, 147, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cardLeft, y);
        ctx.lineTo(cardRight, y);
        ctx.stroke();
        y += 45;
        
        // ===== 模块5: 等值物品列表 =====
        // 标题
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8E8E93';
        ctx.font = '400 22px "PingFang SC"';
        const listTitleY = y;
        ctx.fillText('相当于', cardLeft, listTitleY);
        y = listTitleY + 45;
        
        // 列表项
        const listStartY = y;
        const rowHeight = 52; // 固定行高
        
        ctx.textBaseline = 'middle';
        ctx.font = '400 28px "PingFang SC"';
        
        items.forEach((item, i) => {
            const rowY = listStartY + (i * rowHeight);
            const count = Math.floor(futureCNY / item.price);
            const valueStr = `${formatNumber(count)}${item.unit}`;
            
            // 左侧（Emoji + 名称）
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(`${item.icon} ${item.name}`, cardLeft, rowY);
            
            // 右侧（数量 + 单位）
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FF9F0A';
            ctx.fillText(valueStr, cardRight, rowY);
        });
    }
    
    // ===== 绘制 VOO 卡片 =====
    const vooCardX = pad;
    drawCard(vooCardX, cursorY, 'VOO', '标普500', currentVooPrice, vooShares, vooFutureUSD, vooItems, vooFutureCNY);
    
    // ===== 绘制 QQQ 卡片 =====
    const qqqCardX = pad + cardWidth + cardGap;
    drawCard(qqqCardX, cursorY, 'QQQ', '纳指100', currentQqqPrice, qqqShares, qqqFutureUSD, qqqItems, qqqFutureCNY);
    
    // ===== Footer =====
    const footerY = cursorY + cardHeight + 25; // 卡片下方25px（进一步减少留白：30 -> 25）
    
    // 统一字体大小
    const footerFontSize = 22;
    const footerColor = 'rgba(142, 142, 147, 0.8)';
    
    // 左下角：作者
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = footerColor;
    ctx.font = `400 ${footerFontSize}px "PingFang SC"`;
    ctx.fillText('作者：X@Wise投资有术', pad, footerY);
    
    // 右下角：日期（年月日）
    ctx.textAlign = 'right';
    ctx.fillStyle = footerColor;
    ctx.font = `400 ${footerFontSize}px "PingFang SC"`;
    const now = new Date();
    const padDate = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}/${padDate(now.getMonth() + 1)}/${padDate(now.getDate())}`;
    ctx.fillText(dateStr, W - pad, footerY);
    
    return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) reject(new Error('生成图片失败'));
            else resolve(blob);
        }, 'image/png', 0.95);
    });
}

// ===== 分享功能 =====
let shareImageBlob = null;
let shareImageObjectUrl = null;

function openImageModal(blob) {
    shareImageBlob = blob;
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('previewImg');
    if (!modal || !img) return;
    
    if (shareImageObjectUrl) URL.revokeObjectURL(shareImageObjectUrl);
    shareImageObjectUrl = URL.createObjectURL(blob);
    img.src = shareImageObjectUrl;
    modal.style.display = 'flex'; /* 使用 flex 而不是 block，以便垂直居中 */
}

function setupImageModalListeners() {
    const modal = document.getElementById('imageModal');
    const backdrop = document.getElementById('modalBackdrop');
    const closeBtn = document.getElementById('closeImageModal');
    const copyBtn = document.getElementById('copyImageBtn');
    const downloadBtn = document.getElementById('downloadImageBtn');
    
    if (!modal) return;
    
    // 关闭弹窗
    const closeModal = () => {
        modal.style.display = 'none';
        const img = document.getElementById('previewImg');
        if (img) img.src = '';
        if (shareImageObjectUrl) {
            URL.revokeObjectURL(shareImageObjectUrl);
            shareImageObjectUrl = null;
        }
        shareImageBlob = null;
    };
    
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (backdrop && !backdrop.dataset.bound) {
        backdrop.dataset.bound = '1';
        backdrop.addEventListener('click', closeModal);
    }
    
    // 复制图片
    if (copyBtn && !copyBtn.dataset.bound) {
        copyBtn.dataset.bound = '1';
        copyBtn.addEventListener('click', async () => {
            try {
                if (!shareImageBlob) throw new Error('图片未就绪');
                if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
                    throw new Error('当前浏览器不支持复制图片');
                }
                const item = new ClipboardItem({ 'image/png': shareImageBlob });
                await navigator.clipboard.write([item]);
                showToast('图片已复制');
            } catch (e) {
                alert(`❌ 复制图片失败：\n\n${e?.message || e}`);
            }
        });
    }
    
    // 下载图片
    if (downloadBtn && !downloadBtn.dataset.bound) {
        downloadBtn.dataset.bound = '1';
        downloadBtn.addEventListener('click', () => {
            try {
                if (!shareImageBlob) throw new Error('图片未就绪');
                const filename = `价值观纠正器指数版-${Date.now()}.png`;
                const url = URL.createObjectURL(shareImageBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showToast('图片已下载');
            } catch (e) {
                alert(`❌ 下载图片失败：\n\n${e?.message || e}`);
            }
        });
    }
    
    // ESC键关闭
    if (!modal.dataset.bound) {
        modal.dataset.bound = '1';
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
            }
        });
    }
    
    window.closeImageModal = closeModal;
}

window.closeCustomTokenModal = closeCustomTokenModal;

// ===== 事件监听 =====
function setupEventListeners() {
    const amountInput = document.getElementById('amountInput');
    const currencySelect = document.getElementById('currencySelect');
    const yearSlider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearDisplay');
    const tokenSearchInput = document.getElementById('tokenSearchInput');
    
    if (amountInput) {
        // 只允许输入数字（整数）
        amountInput.addEventListener('input', function(e) {
            const value = this.value;
            
            // 移除所有非数字字符（除了为了清理输入）
            const cleaned = value.replace(/[^\d]/g, '');
            
            // 如果清理后的值与原值不同，说明输入了非法字符
            if (cleaned !== value) {
                // 显示提示
                showToast('只能够输入整数');
                // 将输入框的值设置为清理后的值
                this.value = cleaned;
            }
            
            // 更新显示和计算
            if (cleaned) {
                calculate();
            } else {
                clearResults();
            }
        });
        
        // 阻止粘贴非数字内容
        amountInput.addEventListener('paste', function(e) {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            if (!/^\d+$/.test(paste)) {
                e.preventDefault();
                showToast('只能够输入整数');
            }
        });
    }
    
    if (yearSlider && yearDisplay) {
        // 阻止键盘输入（range input 本身不支持文本输入，但为了安全起见添加保护）
        yearSlider.addEventListener('keydown', function(e) {
            // 只允许方向键和 Tab 键（用于无障碍访问）
            // 阻止所有其他键盘输入，包括数字键
            const allowedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'];
            if (!allowedKeys.includes(e.key)) {
                e.preventDefault();
                return false;
            }
        });
        
        // 阻止 keypress 事件（防止任何字符输入）
        yearSlider.addEventListener('keypress', function(e) {
            e.preventDefault();
            return false;
        });
        
        // 阻止粘贴操作
        yearSlider.addEventListener('paste', function(e) {
            e.preventDefault();
            return false;
        });
        
        // 更新显示（只能通过滑动或方向键）
        yearSlider.addEventListener('input', function() {
            // 确保值在有效范围内
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 20) value = 20;
            
            // 如果值被修改，确保滑块值也更新
            if (value !== parseInt(this.value)) {
                this.value = value;
            }
            
            yearDisplay.textContent = value;
            calculate();
        });
    }
    
    if (currencySelect) {
        let lastValue = currencySelect.value;
        const customTokenSearchBtn = document.getElementById('customTokenSearchBtn');
        
        // 显示/隐藏搜索按钮的函数
        function updateCustomTokenSearchBtn() {
            if (customTokenSearchBtn) {
                if (currencySelect.value === 'CUSTOM') {
                    customTokenSearchBtn.style.display = 'flex';
                } else {
                    customTokenSearchBtn.style.display = 'none';
                }
            }
        }
        
        // 初始化按钮显示状态
        updateCustomTokenSearchBtn();
        
        // 使用 mousedown 事件来保存点击前的值
        currencySelect.addEventListener('mousedown', function(e) {
            // 保存点击前的值
            lastValue = this.value;
        });
        
        currencySelect.addEventListener('change', function() {
            if (this.value === 'CUSTOM') {
                currentSelectId = this.id;
                openCustomTokenModal();
                // 打开模态框后return，不执行后面的calculate
                return;
            }
            
            // 如果从CUSTOM切换回其他选项
            if (lastValue === 'CUSTOM' && this.value !== 'CUSTOM') {
                // 不重置CUSTOM选项的显示文本，保留用户之前的选择
            }
            
            // 更新搜索按钮显示状态
            updateCustomTokenSearchBtn();
            
            calculate();
        });
        
        // 搜索按钮点击事件：打开搜索模态框
        if (customTokenSearchBtn) {
            customTokenSearchBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                currentSelectId = currencySelect.id;
                openCustomTokenModal();
            });
        }
        
        // 处理键盘导航：当用户使用键盘选择CUSTOM选项时也能打开搜索
        currencySelect.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                // 如果当前焦点在CUSTOM选项上，打开搜索模态框
                const selectedOption = this.options[this.selectedIndex];
                if (selectedOption && selectedOption.value === 'CUSTOM') {
                    if (this.value === 'CUSTOM') {
                        // 如果已经是CUSTOM，打开搜索框
                        e.preventDefault();
                        currentSelectId = this.id;
                        openCustomTokenModal();
                        return false;
                    }
                }
            }
        });
    }
    
    const exportImageBtn = document.getElementById('exportImageBtn');
    if (exportImageBtn) {
        exportImageBtn.addEventListener('click', async () => {
            try {
                const blob = await generateSharePngBlob();
                openImageModal(blob);
            } catch (err) {
                alert(`❌ 生成图片失败：\n\n${err?.message || err}`);
            }
        });
    }
    
    if (tokenSearchInput) {
        let searchTimeout;
        tokenSearchInput.addEventListener('input', function(e) {
            const query = e.target.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);
            const searchResults = document.getElementById('searchResults');
            if (query === '') {
                if (searchResults) searchResults.innerHTML = '';
                return;
            }
            searchTimeout = setTimeout(() => {
                searchTokens();
            }, 300);
        });
        
        tokenSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTokens();
            }
        });
    }
    
    // 关闭自定义代币搜索模态框的按钮
    const closeCustomTokenModalBtn = document.getElementById('closeCustomTokenModal');
    if (closeCustomTokenModalBtn) {
        closeCustomTokenModalBtn.addEventListener('click', closeCustomTokenModal);
    }
    
    // 点击弹窗外部关闭
    window.addEventListener('click', function(event) {
        const customModal = document.getElementById('customTokenModal');
        if (event.target === customModal) {
            closeCustomTokenModal();
        }
    });
    
    // ESC键关闭自定义代币搜索模态框
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const customModal = document.getElementById('customTokenModal');
            if (customModal && customModal.style.display === 'flex') {
                closeCustomTokenModal();
            }
        }
    });
    
    setupImageModalListeners();
}

// ===== 初始化日期显示 =====

// ===== 初始化 =====
function initApp() {
    console.log('🚀 开始初始化应用...');
    
    checkLocalStorage();
    setupEventListeners();
    setupImageModalListeners();
    restoreState();
    
    window.addEventListener('beforeunload', () => {
        saveState();
    });
    
    window.addEventListener('blur', () => {
        saveState();
    });
    
    // 从服务器获取股票价格（服务器端有24小时缓存）
    loadData().then(() => {
        console.log('数据加载完成');
        const amountInput = document.getElementById('amountInput');
        if (amountInput && amountInput.value.trim()) {
            calculate();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
