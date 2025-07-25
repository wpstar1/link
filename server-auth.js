const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const crypto = require('crypto');

// 환경변수 확인
console.log('=== 서버 시작 환경변수 확인 ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Configured' : 'Not configured');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Configured' : 'Not configured');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'Configured' : 'Using default');
console.log('==============================');

const supabase = require('./lib/supabase');
const app = express();

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 인증 미들웨어
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// 사용자 정보를 뷰에 전달하는 미들웨어
app.use((req, res, next) => {
    res.locals.user = req.session.userId ? { id: req.session.userId, email: req.session.userEmail } : null;
    next();
});

// 짧은 코드 생성 함수
function generateShortCode() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// URL 유효성 검사
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// 메인 페이지
app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    try {
        // 전체 링크 수 가져오기
        const { count } = await supabase
            .from('urls')
            .select('*', { count: 'exact', head: true });
        
        // 페이지에 해당하는 링크 가져오기
        const { data: links, error } = await supabase
            .from('urls')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (error) throw error;
        
        const totalPages = Math.ceil(count / limit);
        
        // 링크 데이터 형식 변환
        const formattedLinks = links.map(link => ({
            shortCode: link.short_code,
            originalUrl: link.original_url,
            clicks: link.clicks,
            createdAt: link.created_at,
            shortUrl: `https://wpst.shop/${link.short_code}`,
            isOwner: req.session.userId === link.user_id
        }));
        
        res.render('index', { 
            shortUrl: null, 
            error: null,
            shortCode: null,
            links: formattedLinks,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalLinks: count,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('링크 목록 조회 오류:', error);
        res.render('index', { 
            shortUrl: null, 
            error: '링크 목록을 불러오는 중 오류가 발생했습니다.',
            shortCode: null,
            links: [],
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalLinks: 0,
                hasNext: false,
                hasPrev: false
            }
        });
    }
});

// 로그인 페이지
app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

// 회원가입 페이지
app.get('/signup', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('signup', { error: null, success: null });
});

// 로그인 처리
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            return res.render('login', { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }
        
        // 세션에 사용자 정보 저장
        req.session.userId = data.user.id;
        req.session.userEmail = data.user.email;
        
        res.redirect('/');
    } catch (error) {
        console.error('로그인 오류:', error);
        res.render('login', { error: '로그인 중 오류가 발생했습니다.' });
    }
});

// 회원가입 처리
app.post('/signup', async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    
    if (password !== confirmPassword) {
        return res.render('signup', { 
            error: '비밀번호가 일치하지 않습니다.', 
            success: null 
        });
    }
    
    if (password.length < 6) {
        return res.render('signup', { 
            error: '비밀번호는 6자 이상이어야 합니다.', 
            success: null 
        });
    }
    
    try {
        console.log('회원가입 시도:', email);
        console.log('Supabase 환경변수 확인:', {
            url: process.env.SUPABASE_URL ? 'Set' : 'Not set',
            key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set'
        });
        
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${req.protocol}://${req.get('host')}/login`
            }
        });
        
        if (error) {
            console.error('Supabase signUp error:', error);
            return res.render('signup', { 
                error: `회원가입 실패: ${error.message}`, 
                success: null 
            });
        }
        
        // users 테이블에도 사용자 정보 저장
        if (data.user) {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ 
                    id: data.user.id,
                    email: data.user.email 
                }]);
            
            if (insertError) {
                console.error('Users table insert error:', insertError);
            }
        }
        
        res.render('signup', { 
            error: null, 
            success: '회원가입이 완료되었습니다. 이메일을 확인해주세요.' 
        });
    } catch (error) {
        console.error('회원가입 전체 오류:', error);
        console.error('Error stack:', error.stack);
        res.render('signup', { 
            error: `회원가입 중 오류가 발생했습니다: ${error.message}`, 
            success: null 
        });
    }
});

// 로그아웃
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// URL 단축 처리
app.post('/shorten', async (req, res) => {
    const { url } = req.body;
    const userId = req.session.userId || null;
    
    // 페이지네이션 데이터 가져오기 함수
    const getAllLinksWithPagination = async (page = 1) => {
        const limit = 10;
        const offset = (page - 1) * limit;
        
        try {
            const { count } = await supabase
                .from('urls')
                .select('*', { count: 'exact', head: true });
            
            const { data: links, error } = await supabase
                .from('urls')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            
            if (error) throw error;
            
            const totalPages = Math.ceil(count / limit);
            
            const formattedLinks = links.map(link => ({
                shortCode: link.short_code,
                originalUrl: link.original_url,
                clicks: link.clicks,
                createdAt: link.created_at,
                shortUrl: `https://wpst.shop/${link.short_code}`,
                isOwner: req.session.userId === link.user_id
            }));
            
            return {
                links: formattedLinks,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalLinks: count,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            console.error('링크 목록 조회 오류:', error);
            return {
                links: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalLinks: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    };
    
    if (!url) {
        const data = await getAllLinksWithPagination(1);
        return res.render('index', { 
            shortUrl: null, 
            error: 'URL을 입력해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }

    if (!isValidUrl(url)) {
        const data = await getAllLinksWithPagination(1);
        return res.render('index', { 
            shortUrl: null, 
            error: '유효한 URL을 입력해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }

    try {
        // 중복 URL 확인
        const { data: existingUrl, error: checkError } = await supabase
            .from('urls')
            .select('short_code')
            .eq('original_url', url)
            .single();
        
        if (existingUrl && !checkError) {
            const existingShortUrl = `https://wpst.shop/${existingUrl.short_code}`;
            const data = await getAllLinksWithPagination(1);
            return res.render('index', { 
                shortUrl: existingShortUrl, 
                error: null,
                shortCode: existingUrl.short_code,
                links: data.links,
                pagination: data.pagination
            });
        }

        // 새로운 단축 코드 생성
        let shortCode;
        let attempts = 0;
        const maxAttempts = 100;
        
        while (attempts < maxAttempts) {
            shortCode = generateShortCode();
            
            // 중복 확인
            const { data: duplicate } = await supabase
                .from('urls')
                .select('id')
                .eq('short_code', shortCode)
                .single();
            
            if (!duplicate) {
                break;
            }
            
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            const data = await getAllLinksWithPagination(1);
            return res.render('index', { 
                shortUrl: null, 
                error: '시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
                shortCode: null,
                links: data.links,
                pagination: data.pagination
            });
        }

        // 새 링크 저장
        const { data: newUrl, error: insertError } = await supabase
            .from('urls')
            .insert([{
                short_code: shortCode,
                original_url: url,
                user_id: userId,
                clicks: 0
            }])
            .select()
            .single();
        
        if (insertError) {
            console.error('링크 저장 오류:', insertError);
            const data = await getAllLinksWithPagination(1);
            return res.render('index', { 
                shortUrl: null, 
                error: '링크 저장에 실패했습니다. 다시 시도해주세요.',
                shortCode: null,
                links: data.links,
                pagination: data.pagination
            });
        }

        const shortUrl = `https://wpst.shop/${shortCode}`;
        const data = await getAllLinksWithPagination(1);
        
        res.render('index', { 
            shortUrl, 
            error: null,
            shortCode,
            links: data.links,
            pagination: data.pagination
        });
    } catch (error) {
        console.error('URL 단축 처리 오류:', error);
        const data = await getAllLinksWithPagination(1);
        res.render('index', { 
            shortUrl: null, 
            error: '처리 중 오류가 발생했습니다. 다시 시도해주세요.',
            shortCode: null,
            links: data.links,
            pagination: data.pagination
        });
    }
});

// 내 링크 페이지 (로그인 필요)
app.get('/my-links', isAuthenticated, async (req, res) => {
    try {
        const { data: links, error } = await supabase
            .from('urls')
            .select('*')
            .eq('user_id', req.session.userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const formattedLinks = links.map(link => ({
            shortCode: link.short_code,
            originalUrl: link.original_url,
            clicks: link.clicks,
            createdAt: link.created_at,
            shortUrl: `https://wpst.shop/${link.short_code}`
        }));
        
        res.render('my-links', { links: formattedLinks });
    } catch (error) {
        console.error('내 링크 조회 오류:', error);
        res.render('my-links', { links: [] });
    }
});

// 단축 URL 리다이렉트
app.get('/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        // URL 조회
        const { data: urlData, error } = await supabase
            .from('urls')
            .select('*')
            .eq('short_code', code)
            .single();
        
        if (error || !urlData) {
            // 404 페이지 표시
            const { count } = await supabase
                .from('urls')
                .select('*', { count: 'exact', head: true });
            
            const { data: links } = await supabase
                .from('urls')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            
            const formattedLinks = links.map(link => ({
                shortCode: link.short_code,
                originalUrl: link.original_url,
                clicks: link.clicks,
                createdAt: link.created_at,
                shortUrl: `https://wpst.shop/${link.short_code}`,
                isOwner: req.session.userId === link.user_id
            }));
            
            const totalPages = Math.ceil(count / 10);
            
            return res.status(404).render('index', { 
                shortUrl: null, 
                error: '존재하지 않는 단축 URL입니다.',
                shortCode: null,
                links: formattedLinks,
                pagination: {
                    currentPage: 1,
                    totalPages: totalPages,
                    totalLinks: count,
                    hasNext: totalPages > 1,
                    hasPrev: false
                }
            });
        }
        
        // 클릭수 증가 (비동기로 처리)
        supabase
            .from('urls')
            .update({ clicks: urlData.clicks + 1 })
            .eq('short_code', code)
            .then(({ error }) => {
                if (error) {
                    console.error('클릭수 업데이트 오류:', error);
                }
            });
        
        // 원본 URL로 리다이렉트
        res.redirect(urlData.original_url);
    } catch (error) {
        console.error('리다이렉트 처리 오류:', error);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
});

// 통계 페이지
app.get('/stats/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        const { data: urlData, error } = await supabase
            .from('urls')
            .select('*')
            .eq('short_code', code)
            .single();
        
        if (error || !urlData) {
            // 404 페이지 표시
            const { count } = await supabase
                .from('urls')
                .select('*', { count: 'exact', head: true });
            
            const { data: links } = await supabase
                .from('urls')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);
            
            const formattedLinks = links.map(link => ({
                shortCode: link.short_code,
                originalUrl: link.original_url,
                clicks: link.clicks,
                createdAt: link.created_at,
                shortUrl: `https://wpst.shop/${link.short_code}`,
                isOwner: req.session.userId === link.user_id
            }));
            
            const totalPages = Math.ceil(count / 10);
            
            return res.status(404).render('index', { 
                shortUrl: null, 
                error: '존재하지 않는 단축 URL입니다.',
                shortCode: null,
                links: formattedLinks,
                pagination: {
                    currentPage: 1,
                    totalPages: totalPages,
                    totalLinks: count,
                    hasNext: totalPages > 1,
                    hasPrev: false
                }
            });
        }
        
        const accept = req.headers.accept;
        if (accept && accept.includes('application/json')) {
            return res.json({
                originalUrl: urlData.original_url,
                shortCode: code,
                clicks: urlData.clicks,
                createdAt: urlData.created_at
            });
        }
        
        res.render('stats', {
            shortCode: code,
            originalUrl: urlData.original_url,
            clicks: urlData.clicks,
            createdAt: urlData.created_at,
            shortUrl: `${req.protocol}://${req.get('host')}/${code}`
        });
    } catch (error) {
        console.error('통계 조회 오류:', error);
        res.status(500).send('서버 오류가 발생했습니다.');
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log('수퍼베이스 인증 연동 버전');
});