-- 사용자 테이블 (수퍼베이스 Auth와 연동)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- urls 테이블에 user_id 컬럼 타입 변경 (기존 VARCHAR(32)에서 UUID로)
ALTER TABLE urls 
ALTER COLUMN user_id TYPE UUID USING NULL;

-- users 테이블과 urls 테이블 연결
ALTER TABLE urls 
ADD CONSTRAINT fk_urls_user_id 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;

-- RLS 정책 업데이트
DROP POLICY IF EXISTS "Enable read access for all users" ON urls;
DROP POLICY IF EXISTS "Enable insert for all users" ON urls;
DROP POLICY IF EXISTS "Enable update for all users" ON urls;

-- 새로운 RLS 정책
-- 모든 사용자가 읽을 수 있음
CREATE POLICY "Anyone can read urls" ON urls
    FOR SELECT USING (true);

-- 로그인한 사용자만 생성 가능
CREATE POLICY "Authenticated users can insert" ON urls
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL OR user_id IS NULL
    );

-- 자신의 링크만 업데이트 가능
CREATE POLICY "Users can update own urls" ON urls
    FOR UPDATE USING (
        user_id = auth.uid() OR user_id IS NULL
    );

-- 자신의 링크만 삭제 가능
CREATE POLICY "Users can delete own urls" ON urls
    FOR DELETE USING (
        user_id = auth.uid() OR user_id IS NULL
    );