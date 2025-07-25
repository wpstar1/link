-- URL 테이블
CREATE TABLE IF NOT EXISTS urls (
    id SERIAL PRIMARY KEY,
    short_code VARCHAR(10) UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    user_id VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);
CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);
CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE urls ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 URL을 생성하고 읽을 수 있도록 정책 설정
CREATE POLICY "Enable read access for all users" ON urls
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON urls
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON urls
    FOR UPDATE USING (true);

-- updated_at 자동 업데이트를 위한 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_urls_updated_at BEFORE UPDATE ON urls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();