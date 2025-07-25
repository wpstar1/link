const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fetch = require('cross-fetch');

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

// cross-fetch를 사용하는 Supabase 클라이언트 설정
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: fetch
    },
    auth: {
        persistSession: false
    }
});

console.log('Supabase 클라이언트 생성 완료 (cross-fetch 사용)');

module.exports = supabase;