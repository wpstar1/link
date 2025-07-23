const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const app = express();

const urlDatabase = new Map();
const userLinks = new Map();

// 데이터 파일 경로
const DATA_FILE = path.join(__dirname, 'data.json');

// 데이터 저장 함수
function saveData() {
    const data = {
        urlDatabase: Object.fromEntries(urlDatabase),
        userLinks: Object.fromEntries(userLinks)
    };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('데이터 저장 실패:', error);
    }
}

// 데이터 로드 함수
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            
            // urlDatabase 복원
            if (data.urlDatabase) {
                for (const [key, value] of Object.entries(data.urlDatabase)) {
                    urlDatabase.set(key, value);
                }
            }
            
            // userLinks 복원
            if (data.userLinks) {
                for (const [key, value] of Object.entries(data.userLinks)) {
                    userLinks.set(key, value);
                }
            }
            
            console.log('저장된 데이터 로드 완료');
        }
    } catch (error) {
        console.error('데이터 로드 실패:', error);
    }
}

// 테스트용 샘플 데이터 (개발/데모용)
function initSampleData() {
    const sampleUserId = 'demo-user';
    const sampleLinks = ['a1', 'b2', 'c3'];
    
    // 샘플 URL 데이터
    urlDatabase.set('a1', {
        originalUrl: 'https://www.google.com',
        clicks: 15,
        createdAt: new Date(Date.now() - 86400000), // 1일 전
        userId: sampleUserId
    });
    
    urlDatabase.set('b2', {
        originalUrl: 'https://github.com/wpstar1/link',
        clicks: 7,
        createdAt: new Date(Date.now() - 43200000), // 12시간 전
        userId: sampleUserId
    });
    
    urlDatabase.set('c3', {
        originalUrl: 'https://vercel.com',
        clicks: 3,
        createdAt: new Date(Date.now() - 3600000), // 1시간 전
        userId: sampleUserId
    });
    
    // 사용자별 링크 매핑
    userLinks.set(sampleUserId, sampleLinks);
}

// 서버 시작 시 데이터 로드 후 샘플 데이터 초기화 (데이터가 없을 때만)
loadData();
if (urlDatabase.size === 0) {
    initSampleData();
    saveData(); // 샘플 데이터 저장
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function generateShortCode() {
    // 최대한 짧게: 2자리 + 숫자와 소문자만 사용 (가독성 향상)
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 2; i++) {
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
        // 새로운 사용자에게 고유한 ID 생성
        userId = generateUserId();
        res.cookie('userId', userId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    }
    if (!userLinks.has(userId)) {
        userLinks.set(userId, []);
    }
    return userId;
}

app.get('/', (req, res) => {
    const userId = getUserId(req, res);
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // 페이지당 10개씩 표시
    const offset = (page - 1) * limit;
    
    // 모든 링크들을 가져와서 최신순으로 정렬
    const allLinks = [];
    for (const [code, urlData] of urlDatabase.entries()) {
        allLinks.push({
            shortCode: code,
            originalUrl: urlData.originalUrl,
            clicks: urlData.clicks,
            createdAt: urlData.createdAt,
            shortUrl: `https://wpst.shop/${code}`
        });
    }
    
    // 생성일 기준으로 최신순 정렬
    const sortedLinks = allLinks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 페이지네이션 적용
    const totalLinks = sortedLinks.length;
    const totalPages = Math.ceil(totalLinks / limit);
    const links = sortedLinks.slice(offset, offset + limit);

    res.render('index', { 
        shortUrl: null, 
        error: null,
        shortCode: null,
        links: links,
        pagination: {
            currentPage: page,
            totalPages: totalPages,
            totalLinks: totalLinks,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    });
});

app.post('/shorten', (req, res) => {
    const { url } = req.body;
    const userId = getUserId(req, res);
    
    // 모든 링크 목록 가져오기 (페이지네이션 포함)
    const getAllLinksWithPagination = (page = 1) => {
        const limit = 10;
        const offset = (page - 1) * limit;
        
        const allLinks = [];
        for (const [code, urlData] of urlDatabase.entries()) {
            allLinks.push({
                shortCode: code,
                originalUrl: urlData.originalUrl,
                clicks: urlData.clicks,
                createdAt: urlData.createdAt,
                shortUrl: `https://wpst.shop/${code}`
            });
        }
        
        const sortedLinks = allLinks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const totalLinks = sortedLinks.length;
        const totalPages = Math.ceil(totalLinks / limit);
        const links = sortedLinks.slice(offset, offset + limit);
        
        return {
            links: links,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalLinks: totalLinks,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    };
    
    if (!url) {
        const data = getAllLinksWithPagination(1);
        return res.render('index', { 
            shortUrl: null, 
            error: 'URL을 입력해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }

    if (!isValidUrl(url)) {
        const data = getAllLinksWithPagination(1);
        return res.render('index', { 
            shortUrl: null, 
            error: '유효한 URL을 입력해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }

    // 중복 URL 확인
    for (const [code, urlData] of urlDatabase.entries()) {
        if (urlData.originalUrl === url) {
            const existingShortUrl = `https://wpst.shop/${code}`;
            const data = getAllLinksWithPagination(1);
            return res.render('index', { 
                shortUrl: existingShortUrl, 
                error: null,
                shortCode: code,
                links: data.links,
                pagination: data.pagination
            });
        }
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

    const userLinkList = userLinks.get(userId) || [];
    userLinkList.push(shortCode);
    userLinks.set(userId, userLinkList);

    // 데이터 저장
    saveData();

    const shortUrl = `https://wpst.shop/${shortCode}`;
    
    const data = getAllLinksWithPagination(1);
    res.render('index', { 
        shortUrl, 
        error: null,
        shortCode,
        links: data.links,
        pagination: data.pagination
    });
});

app.get('/:code', (req, res) => {
    const { code } = req.params;
    const urlData = urlDatabase.get(code);

    if (!urlData) {
        return res.status(404).render('index', { 
            shortUrl: null, 
            error: '존재하지 않는 단축 URL입니다.',
            shortCode: null 
        });
    }

    urlData.clicks += 1;
    saveData(); // 클릭수 업데이트 저장
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
            shortUrl: `https://wpst.shop/${code}`
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