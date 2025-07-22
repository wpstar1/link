# 🔗 ShotLink - URL 단축 서비스

간단하고 빠른 URL 단축 서비스입니다. 긴 URL을 **2자리 초단축 코드**로 단축하여 공유하기 쉽게 만들어주는 웹 애플리케이션입니다.

## ✨ 주요 기능

- **URL 단축**: 긴 URL을 2자리 초단축 코드로 단축 (최대한 짧게!)
- **리다이렉트**: 단축 URL 클릭 시 원본 URL로 자동 이동
- **클릭 카운팅**: 각 단축 URL의 클릭 수 추적
- **깔끔한 UI**: 반응형 웹 디자인으로 모바일 지원
- **통계 확인**: `/stats/:code` 엔드포인트로 클릭 통계 조회

## 🛠 기술 스택

- **Backend**: Node.js + Express.js
- **Template Engine**: EJS
- **Storage**: 메모리 저장소 (In-Memory Map)
- **Frontend**: HTML5, CSS3, JavaScript
- **Deployment**: Vercel 지원

## 📁 프로젝트 구조

```
shotlink/
├── package.json          # 프로젝트 의존성 관리
├── server.js             # 메인 서버 파일
├── vercel.json          # Vercel 배포 설정
├── views/
│   └── index.ejs        # 메인 페이지 템플릿
├── public/
│   └── style.css        # 스타일시트
└── README.md            # 프로젝트 문서
```

## 🚀 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```

### 3. 프로덕션 서버 실행
```bash
npm start
```

서버가 실행되면 `http://localhost:3000`에서 확인할 수 있습니다.

## 📡 API 엔드포인트

### GET `/`
- 메인 페이지를 렌더링합니다.

### POST `/shorten`
- URL을 단축합니다.
- **Body**: `{ url: "https://example.com" }`
- **Response**: 단축된 URL과 함께 메인 페이지 렌더링

### GET `/:code`
- 단축 코드를 통해 원본 URL로 리다이렉트합니다.
- 클릭 카운트가 자동으로 증가합니다.

### GET `/stats/:code`
- 단축 URL의 통계 정보를 JSON으로 반환합니다.
- **Response**: 
```json
{
  "originalUrl": "https://example.com",
  "shortCode": "abc123",
  "clicks": 15,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

## 🌐 Vercel 배포

1. Vercel 계정에 로그인
2. 프로젝트를 GitHub에 업로드
3. Vercel에서 프로젝트 import
4. 자동 배포 완료!

`vercel.json` 설정 파일이 포함되어 있어 별도 설정 없이 배포 가능합니다.

## 💡 사용 예시

1. **URL 단축**:
   - 메인 페이지에서 긴 URL을 입력
   - "단축하기" 버튼 클릭
   - 생성된 단축 URL 복사

2. **통계 확인**:
   ```
   GET /stats/abc123
   ```

## ⚠️ 주의사항

- 현재 메모리 저장소를 사용하므로 서버 재시작 시 데이터가 초기화됩니다.
- 프로덕션 환경에서는 데이터베이스(MongoDB, PostgreSQL 등) 연동을 권장합니다.
- 단축 코드 중복 방지 로직이 포함되어 있습니다.

## 🔮 향후 개선사항

- [ ] 데이터베이스 연동 (MongoDB/PostgreSQL)
- [ ] 사용자 인증 시스템
- [ ] 커스텀 단축 코드 지원
- [ ] QR 코드 생성
- [ ] 상세 통계 대시보드
- [ ] URL 만료 기능

## 📄 라이선스

MIT License

---

**ShotLink** - 간단하고 빠른 URL 단축 서비스 🚀