const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const app = express();

const urlDatabase = new Map();
const userLinks = new Map();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function generateShortCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function generateUserId() {
    return crypto.randomBytes(16).toString('hex');
}

function getUserId(req, res) {
    let userId = req.cookies.userId;
    if (!userId) {
        userId = generateUserId();
        res.cookie('userId', userId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
        userLinks.set(userId, []);
    }
    if (!userLinks.has(userId)) {
        userLinks.set(userId, []);
    }
    return userId;
}

app.get('/', (req, res) => {
    const userId = getUserId(req, res);
    res.render('index', { 
        shortUrl: null, 
        error: null,
        shortCode: null 
    });
});

app.post('/shorten', (req, res) => {
    const { url } = req.body;
    const userId = getUserId(req, res);
    
    if (!url) {
        return res.render('index', { 
            shortUrl: null, 
            error: 'URL을 입력해주세요.',
            shortCode: null 
        });
    }

    if (!isValidUrl(url)) {
        return res.render('index', { 
            shortUrl: null, 
            error: '유효한 URL을 입력해주세요.',
            shortCode: null 
        });
    }

    let shortCode;
    do {
        shortCode = generateShortCode();
    } while (urlDatabase.has(shortCode));

    urlDatabase.set(shortCode, {
        originalUrl: url,
        clicks: 0,
        createdAt: new Date(),
        userId: userId
    });

    const userLinkList = userLinks.get(userId);
    userLinkList.push(shortCode);
    userLinks.set(userId, userLinkList);

    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
    
    res.render('index', { 
        shortUrl, 
        error: null,
        shortCode 
    });
});

app.get('/:code', (req, res) => {
    const { code } = req.params;
    const urlData = urlDatabase.get(code);

    if (!urlData) {
        return res.status(404).render('index', { 
            shortUrl: null, 
            error: '존재하지 않는 단축 URL입니다.' 
        });
    }

    urlData.clicks += 1;
    res.redirect(urlData.originalUrl);
});

app.get('/my-links', (req, res) => {
    const userId = getUserId(req, res);
    const userLinkCodes = userLinks.get(userId) || [];
    
    const links = userLinkCodes.map(code => {
        const urlData = urlDatabase.get(code);
        return {
            shortCode: code,
            originalUrl: urlData.originalUrl,
            clicks: urlData.clicks,
            createdAt: urlData.createdAt,
            shortUrl: `${req.protocol}://${req.get('host')}/${code}`
        };
    }).reverse();

    res.render('my-links', { links });
});

app.get('/stats/:code', (req, res) => {
    const { code } = req.params;
    const urlData = urlDatabase.get(code);

    if (!urlData) {
        return res.status(404).render('index', { 
            shortUrl: null, 
            error: '존재하지 않는 단축 URL입니다.',
            shortCode: null 
        });
    }

    const accept = req.headers.accept;
    if (accept && accept.includes('application/json')) {
        return res.json({
            originalUrl: urlData.originalUrl,
            shortCode: code,
            clicks: urlData.clicks,
            createdAt: urlData.createdAt
        });
    }

    res.render('stats', {
        shortCode: code,
        originalUrl: urlData.originalUrl,
        clicks: urlData.clicks,
        createdAt: urlData.createdAt,
        shortUrl: `${req.protocol}://${req.get('host')}/${code}`
    });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});