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

// 데이터 저장 함수 - 강화된 버전
function saveData() {
    const data = {
        urlDatabase: Object.fromEntries(urlDatabase),
        userLinks: Object.fromEntries(userLinks),
        lastSaved: new Date().toISOString()
    };
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        try {
            // 디렉토리가 존재하는지 확인
            const dir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 직접 파일에 저장 (Windows에서 rename이 문제가 될 수 있음)
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
            
            console.log(`데이터 저장 완료 (${new Date().toLocaleString()}):`, DATA_FILE);
            return true;
        } catch (error) {
            attempts++;
            console.error(`데이터 저장 실패 (시도 ${attempts}/${maxAttempts}):`, error);
            console.error('에러 상세:', error.message, error.code);
            
            if (attempts < maxAttempts) {
                // 재시도 전에 잠시 대기 (동기적으로)
                const delay = attempts * 100;
                const start = Date.now();
                while (Date.now() - start < delay) {
                    // 대기
                }
            }
        }
    }
    
    // 모든 시도 실패 시 백업 방법 시도
    try {
        const backupFile = DATA_FILE + '.emergency';
        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
        console.log('비상 백업 파일에 저장:', backupFile);
        
        // 백업 파일을 원본으로 복사 시도
        try {
            fs.copyFileSync(backupFile, DATA_FILE);
            console.log('백업 파일을 원본으로 복사 성공');
            return true;
        } catch (copyError) {
            console.error('백업 파일 복사 실패:', copyError);
        }
    } catch (emergencyError) {
        console.error('비상 백업도 실패:', emergencyError);
    }
    
    return false;
}

// 데이터 로드 함수 - 백업 파일 복구 기능 포함
function loadData() {
    const files = [DATA_FILE, DATA_FILE + '.bak'];
    
    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                const rawData = fs.readFileSync(file, 'utf8');
                const data = JSON.parse(rawData);
                
                // 데이터 무결성 검사
                if (!data.urlDatabase || !data.userLinks) {
                    console.warn(`${file}: 데이터 구조가 올바르지 않음`);
                    continue;
                }
                
                // urlDatabase 복원
                urlDatabase.clear();
                for (const [key, value] of Object.entries(data.urlDatabase)) {
                    urlDatabase.set(key, value);
                }
                
                // userLinks 복원
                userLinks.clear();
                for (const [key, value] of Object.entries(data.userLinks)) {
                    userLinks.set(key, value);
                }
                
                console.log(`데이터 로드 완료 (${file}): ${urlDatabase.size}개 링크`);
                return true;
            }
        } catch (error) {
            console.error(`${file} 로드 실패:`, error);
        }
    }
    
    console.log('로드할 유효한 데이터 파일이 없음');
    return false;
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
    console.log('데이터베이스가 비어있어 샘플 데이터를 초기화합니다.');
    initSampleData();
    saveData(); // 샘플 데이터 저장
} else {
    console.log(`${urlDatabase.size}개의 링크 데이터가 로드되었습니다.`);
}

// 주기적으로 데이터 백업 (30초마다 - 더 자주 백업하여 데이터 손실 방지)
setInterval(() => {
    if (urlDatabase.size > 0) {
        const backupResult = saveData();
        if (backupResult) {
            console.log(`주기적 데이터 백업 완료 - ${urlDatabase.size}개 링크`);
        } else {
            console.error('주기적 데이터 백업 실패');
        }
    }
}, 30 * 1000);

// 프로세스 종료 시 데이터 저장
process.on('SIGINT', () => {
    console.log('\n서버 종료 중... 데이터 저장');
    saveData();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('서버 종료 신호 받음... 데이터 저장');
    saveData();
    process.exit(0);
});

// 예상치 못한 오류 시에도 데이터 저장
process.on('uncaughtException', (error) => {
    console.error('예상치 못한 오류:', error);
    saveData();
    process.exit(1);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function generateShortCode() {
    // 6자리로 변경 - 중복 방지를 위해 충분한 조합 확보 (36^6 = 2,176,782,336개 조합)
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
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

app.post('/shorten', async (req, res) => {
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
    let attempts = 0;
    const maxAttempts = 100; // 최대 100번 시도로 중복 방지 강화
    do {
        shortCode = generateShortCode();
        attempts++;
        if (attempts > maxAttempts) {
            console.error('단축 코드 생성 실패: 너무 많은 시도');
            const data = getAllLinksWithPagination(1);
            return res.render('index', { 
                shortUrl: null, 
                error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
                shortCode: null,
                links: data.links,
                pagination: data.pagination
            });
        }
    } while (urlDatabase.has(shortCode));

    // 새 링크 데이터 생성
    const newLinkData = {
        originalUrl: url,
        clicks: 0,
        createdAt: new Date(),
        userId: userId
    };

    // 메모리에 저장
    urlDatabase.set(shortCode, newLinkData);

    const userLinkList = userLinks.get(userId) || [];
    userLinkList.push(shortCode);
    userLinks.set(userId, userLinkList);

    // 데이터 저장 - 여러 번 시도하여 확실히 저장
    let saveAttempts = 0;
    const maxSaveAttempts = 5;
    let saveSuccess = false;
    
    while (saveAttempts < maxSaveAttempts && !saveSuccess) {
        saveAttempts++;
        saveSuccess = saveData();
        if (!saveSuccess) {
            console.error(`새 링크 저장 실패 (시도 ${saveAttempts}/${maxSaveAttempts})`);
            if (saveAttempts < maxSaveAttempts) {
                // 잠시 대기 후 재시도
                await new Promise(resolve => setTimeout(resolve, 100 * saveAttempts));
            }
        } else {
            console.log(`새 링크 저장 성공: ${shortCode} -> ${url}`);
        }
    }
    
    if (!saveSuccess) {
        console.error('링크 저장 최종 실패 - 메모리에만 존재');
        // 메모리에서 제거하여 일관성 유지
        urlDatabase.delete(shortCode);
        const userList = userLinks.get(userId);
        if (userList) {
            const index = userList.indexOf(shortCode);
            if (index > -1) {
                userList.splice(index, 1);
            }
        }
        
        const data = getAllLinksWithPagination(1);
        return res.render('index', { 
            shortUrl: null, 
            error: '링크 저장에 실패했습니다. 다시 시도해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }

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
        
        // 첫 번째 페이지만 표시 (최대 10개)
        const links = sortedLinks.slice(0, 10);
        const totalLinks = sortedLinks.length;
        const totalPages = Math.ceil(totalLinks / 10);
        
        return res.status(404).render('index', { 
            shortUrl: null, 
            error: '존재하지 않는 단축 URL입니다.',
            shortCode: null,
            links: links,
            pagination: {
                currentPage: 1,
                totalPages: totalPages,
                totalLinks: totalLinks,
                hasNext: totalPages > 1,
                hasPrev: false
            }
        });
    }

    urlData.clicks += 1;
    // 클릭수 업데이트 저장 - 비동기로 처리하여 리다이렉트 속도 향상
    setImmediate(() => {
        const saveResult = saveData();
        if (!saveResult) {
            console.error('클릭수 업데이트 저장 실패');
        }
    });
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
        
        // 첫 번째 페이지만 표시 (최대 10개)
        const links = sortedLinks.slice(0, 10);
        const totalLinks = sortedLinks.length;
        const totalPages = Math.ceil(totalLinks / 10);
        
        return res.status(404).render('index', { 
            shortUrl: null, 
            error: '존재하지 않는 단축 URL입니다.',
            shortCode: null,
            links: links,
            pagination: {
                currentPage: 1,
                totalPages: totalPages,
                totalLinks: totalLinks,
                hasNext: totalPages > 1,
                hasPrev: false
            }
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