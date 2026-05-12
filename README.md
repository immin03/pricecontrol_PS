# 파마스퀘어 최저가 트래킹 웹앱

React 프론트엔드 + Node.js 백엔드(크롤링/가격 수집) 기반의 초기 세팅입니다.

## 구성

- `frontend/`: React(Vite) 대시보드 UI
- `backend/`: Node.js(Express) API + 크롤링(cheerio 기반) + 스케줄러(옵션)
- `data/`: 로컬 개발용 데이터 저장(JSON)

## 요구사항

- Node.js LTS + npm (또는 pnpm/yarn)

> 현재 워크스페이스에 `npm`이 인식되지 않으면, 시스템에 Node.js LTS를 설치하고 터미널을 재시작하세요.

## 로컬 실행

Windows에서 `npm workspaces` symlink 이슈를 피하기 위해, `frontend/`와 `backend/`는 **서로 독립적으로 설치/실행**합니다.

### 백엔드 실행

```bash
cd backend
npm install
npm run dev
```

#### 백엔드 환경변수

`backend/.env` 파일을 만들고 아래를 채웁니다.

```env
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

#### 백엔드 확인 URL

- `http://localhost:4000/health`
- `http://localhost:4000/health/env`

### 프론트 실행

```bash
cd frontend
npm install
npm run dev
```

기본 주소:

- 프론트: `http://localhost:5173`
- 백엔드: `http://localhost:4000`

## 배포(가장 쉬운 방법: Render + Vercel)

### 1) 백엔드 배포(Render)

- **Service**: Web Service
- **Root Directory**: `backend`
- **Build Command**:

```bash
npm install && npm run build
```

- **Start Command**:

```bash
npm run start
```

- **Environment Variables**:
  - `NAVER_CLIENT_ID`
  - `NAVER_CLIENT_SECRET`

배포 후 확인:
- `<BACKEND_URL>/health`
- `<BACKEND_URL>/health/env`

### 2) 프론트 배포(Vercel)

- **Root Directory**: `frontend`
- **Environment Variables**:
  - `VITE_API_BASE_URL` = Render에서 나온 백엔드 URL (예: `https://xxxx.onrender.com`)

> 배포 환경에서는 로컬의 Vite proxy가 동작하지 않으므로, 프론트가 `VITE_API_BASE_URL`로 백엔드를 호출하도록 설정해야 합니다.

## 주요 기능(초기)

- 상품 목록 CRUD(간단)
- 경쟁사 가격 크롤링(사이트별 “어댑터” 형태로 확장 가능)
- 대시보드: 상품별 최신 가격, 수집 로그/상태 표시

