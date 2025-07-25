const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const supabase = require('./lib/supabase');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// 사용자 ID 생성
function generateUserId() {
    return crypto.randomBytes(16).toString('hex');
}

// 사용자 ID 가져오기 또는 생성
function getUserId(req, res) {
    let userId = req.cookies.userId;
    if (!userId) {
        userId = generateUserId();
        res.cookie('userId', userId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    }
    return userId;
}

// 메인 페이지
app.get('/', async (req, res) => {
    const userId = getUserId(req, res);
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
            shortUrl: `https://wpst.shop/${link.short_code}`
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

// URL 단축 처리
app.post('/shorten', async (req, res) => {
    const { url } = req.body;
    const userId = getUserId(req, res);
    
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
                shortUrl: `https://wpst.shop/${link.short_code}`
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
                shortUrl: `https://wpst.shop/${link.short_code}`
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
                shortUrl: `https://wpst.shop/${link.short_code}`
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
    console.log('수퍼베이스 연동 버전');
});