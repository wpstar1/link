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

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false
    }
});

module.exports = supabase;