const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// 수퍼베이스 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('수퍼베이스 설정이 필요합니다. .env 파일을 확인하세요.');
    process.exit(1);
}

console.log('Supabase URL:', supabaseUrl ? 'Configured' : 'Missing');
console.log('Supabase Anon Key:', supabaseAnonKey ? 'Configured' : 'Missing');

// Supabase 클라이언트 옵션 개선
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
    },
    global: {
        fetch: (...args) => {
            console.log('Supabase fetch request:', args[0]);
            return fetch(...args).catch(error => {
                console.error('Fetch error:', error);
                throw error;
            });
        }
    },
    db: {
        schema: 'public'
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// 연결 테스트
supabase.auth.getSession()
    .then(({ data, error }) => {
        if (error) {
            console.error('Supabase 연결 테스트 실패:', error);
        } else {
            console.log('Supabase 연결 성공');
        }
    })
    .catch(err => {
        console.error('Supabase 연결 오류:', err);
    });

module.exports = supabase;