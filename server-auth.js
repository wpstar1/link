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

// CORS 헤더 설정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 프록시 신뢰 설정 (Vercel 환경)
app.set('trust proxy', 1);

// 세션 설정
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24시간
        sameSite: 'lax'
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
    res.render('index', { 
        shortUrl: null, 
        error: null,
        shortCode: null
    });
});

// Supabase 테이블 권한 테스트
app.get('/test-table-permissions', async (req, res) => {
    try {
        // INSERT 테스트
        const testCode = 'test' + Date.now().toString().slice(-6);
        const { data: insertData, error: insertError } = await supabase
            .from('urls')
            .insert([{
                short_code: testCode,
                original_url: 'https://test.com',
                user_id: null,
                clicks: 0
            }])
            .select()
            .single();
        
        if (insertError) {
            return res.json({
                status: 'error',
                operation: 'insert',
                error: insertError.message,
                details: insertError
            });
        }
        
        // 삽입 성공하면 삭제
        await supabase
            .from('urls')
            .delete()
            .eq('short_code', testCode);
        
        res.json({
            status: 'success',
            message: 'Table permissions are working correctly',
            insertedData: insertData
        });
    } catch (error) {
        res.json({
            status: 'error',
            message: 'Test failed',
            error: error.message
        });
    }
});

// Supabase 연결 테스트 엔드포인트
app.get('/test-supabase', async (req, res) => {
    try {
        console.log('=== Supabase 연결 테스트 ===');
        console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
        console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set');
        
        // 간단한 쿼리 테스트
        const { data, error } = await supabase
            .from('urls')
            .select('count')
            .limit(1);
        
        if (error) {
            console.error('Supabase 쿼리 에러:', error);
            return res.json({
                status: 'error',
                message: 'Supabase 쿼리 실패',
                error: error.message,
                url: process.env.SUPABASE_URL
            });
        }
        
        res.json({
            status: 'success',
            message: 'Supabase 연결 성공',
            url: process.env.SUPABASE_URL,
            data: data
        });
    } catch (error) {
        console.error('테스트 에러:', error);
        res.json({
            status: 'error',
            message: '연결 테스트 실패',
            error: error.message
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
        
        // 세션 저장 후 리디렉션
        req.session.save((err) => {
            if (err) {
                console.error('세션 저장 오류:', err);
                return res.render('login', { error: '로그인 처리 중 오류가 발생했습니다.' });
            }
            console.log('로그인 성공, 세션 저장됨:', req.session.userId);
            res.redirect('/');
        });
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
        
        // 아주 기본적인 signUp 호출
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
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
            
            // 회원가입 성공 시 자동 로그인 및 메인 페이지로 리디렉션
            req.session.userId = data.user.id;
            req.session.userEmail = data.user.email;
            
            // 세션 저장 후 리디렉션
            return req.session.save((err) => {
                if (err) {
                    console.error('회원가입 세션 저장 오류:', err);
                    return res.render('signup', { 
                        error: '회원가입은 성공했지만 자동 로그인에 실패했습니다. 로그인 페이지에서 로그인해주세요.', 
                        success: null 
                    });
                }
                console.log('회원가입 후 자동 로그인 성공:', req.session.userId);
                res.redirect('/');
            });
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

// 구글 로그인 라우트
app.get('/auth/google', async (req, res) => {
    try {
        // Supabase가 처리 후 우리 사이트로 돌아올 URL
        const siteRedirectUrl = 'https://wpst.shop/auth/google/callback';
        const redirectUrl = `${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(siteRedirectUrl)}`;
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('구글 로그인 리디렉트 오류:', error);
        res.redirect('/login?error=google_auth_failed');
    }
});

// Supabase OAuth 콜백 처리
app.get('/auth/google/callback', async (req, res) => {
    try {
        console.log('구글 로그인 콜백 파라미터:', req.query);
        
        // Supabase는 hash fragment로 토큰을 전달하므로 클라이언트 사이드에서 처리해야 함
        // 임시 HTML 페이지를 보내서 토큰을 추출하고 서버로 전송
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>로그인 처리 중...</title>
            </head>
            <body>
                <p>로그인 처리 중입니다...</p>
                <script>
                    // URL의 hash fragment에서 토큰 추출
                    const hashParams = new URLSearchParams(window.location.hash.substring(1));
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');
                    
                    if (accessToken) {
                        // 토큰을 서버로 전송
                        window.location.href = '/auth/process?access_token=' + accessToken + '&refresh_token=' + (refreshToken || '');
                    } else {
                        // 에러 처리
                        const error = hashParams.get('error_description') || 'Unknown error';
                        window.location.href = '/login?error=' + encodeURIComponent(error);
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('구글 로그인 콜백 오류:', error);
        res.redirect('/login?error=google_callback_failed');
    }
});

// 실제 토큰 처리
app.get('/auth/process', async (req, res) => {
    try {
        const { access_token, refresh_token } = req.query;
        
        if (!access_token) {
            throw new Error('Access token not found');
        }
        
        // Supabase를 통해 사용자 정보 가져오기
        const { data: { user }, error } = await supabase.auth.getUser(access_token);
        
        if (error || !user) {
            console.error('사용자 정보 가져오기 실패:', error);
            throw error || new Error('User not found');
        }
        
        // 세션에 사용자 정보 저장
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        
        // users 테이블에 사용자 정보 저장/업데이트
        await supabase
            .from('users')
            .upsert([{ 
                id: user.id,
                email: user.email 
            }], { onConflict: 'id' });
        
        // 세션 저장 후 리디렉션
        req.session.save((err) => {
            if (err) {
                console.error('구글 로그인 세션 저장 오류:', err);
                return res.redirect('/login?error=session_save_failed');
            }
            console.log('구글 로그인 성공:', user.email);
            res.redirect('/');
        });
    } catch (error) {
        console.error('토큰 처리 오류:', error);
        res.redirect('/login?error=token_processing_failed');
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
        console.log('링크 저장 시도:', {
            short_code: shortCode,
            original_url: url,
            user_id: userId
        });
        
        const { data: newUrl, error: insertError } = await supabase
            .from('urls')
            .insert([{
                short_code: shortCode,
                original_url: url,
                user_id: userId,
                clicks: 0,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (insertError) {
            console.error('링크 저장 오류 상세:', {
                error: insertError,
                message: insertError.message,
                details: insertError.details,
                hint: insertError.hint,
                code: insertError.code
            });
            return res.render('index', { 
                shortUrl: null, 
                error: `링크 저장 실패: ${insertError.message || '다시 시도해주세요.'}`,
                shortCode: null
            });
        }

        const shortUrl = `https://wpst.shop/${shortCode}`;
        
        res.render('index', { 
            shortUrl, 
            error: null,
            shortCode
        });
    } catch (error) {
        console.error('URL 단축 처리 오류:', error);
        res.render('index', { 
            shortUrl: null, 
            error: '처리 중 오류가 발생했습니다. 다시 시도해주세요.',
            shortCode: null
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