const fs = require('fs');
const path = require('path');
const supabase = require('./lib/supabase');

// 데이터 파일 경로
const DATA_FILE = path.join(__dirname, 'data.json');

async function migrateData() {
    console.log('데이터 마이그레이션 시작...');
    
    try {
        // 기존 데이터 파일 읽기
        if (!fs.existsSync(DATA_FILE)) {
            console.log('마이그레이션할 데이터 파일이 없습니다.');
            return;
        }
        
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(rawData);
        
        if (!data.urlDatabase) {
            console.log('유효한 데이터 구조가 아닙니다.');
            return;
        }
        
        const urlEntries = Object.entries(data.urlDatabase);
        console.log(`${urlEntries.length}개의 링크를 마이그레이션합니다...`);
        
        // 배치로 데이터 삽입
        const batchSize = 100;
        for (let i = 0; i < urlEntries.length; i += batchSize) {
            const batch = urlEntries.slice(i, i + batchSize);
            
            const urls = batch.map(([shortCode, urlData]) => ({
                short_code: shortCode,
                original_url: urlData.originalUrl,
                clicks: urlData.clicks || 0,
                user_id: urlData.userId || null,
                created_at: urlData.createdAt || new Date().toISOString()
            }));
            
            const { error } = await supabase
                .from('urls')
                .insert(urls);
            
            if (error) {
                console.error(`배치 ${i / batchSize + 1} 삽입 오류:`, error);
            } else {
                console.log(`배치 ${i / batchSize + 1} 완료 (${Math.min(i + batchSize, urlEntries.length)}/${urlEntries.length})`);
            }
        }
        
        console.log('마이그레이션 완료!');
        
        // 백업 파일 생성
        const backupFile = DATA_FILE + '.migrated-' + new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(DATA_FILE, backupFile);
        console.log(`백업 파일 생성: ${backupFile}`);
        
    } catch (error) {
        console.error('마이그레이션 오류:', error);
    }
}

// 마이그레이션 실행
migrateData();