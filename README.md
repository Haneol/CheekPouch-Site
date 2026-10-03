# CheekPouch 공개 사이트

`cheekpouch.ayou.kr` — 랜딩, Docs, 버전 히스토리, 개인정보·약관, 설치(최신 GitHub Release), Jev 허용 목록 관리자(`/admin/`).
빌드 도구 없는 정적 사이트다. `dist/`가 그대로 배포된다.

```bash
node scripts/validate-site.mjs          # 정적 검사
python -m http.server 4173 --directory dist   # 로컬 미리보기
```

- **배포**: 현재 `main` 커밋에 붙인 `website-*` 태그에서만 검증 후 Vercel 프로덕션 배포를 실행한다. 일반 푸시·PR은 배포하지 않는다. Actions 시크릿 `VERCEL_TOKEN`·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID` 중 하나라도 없으면 태그 작업은 실패한다. Vercel 프로젝트의 Root Directory는 비워 둔다.
- **설치 버튼**: `dist/assets/download.js`가 이 레포의 최신 Release에서 `CheekPouch-Setup-<버전>-x64.exe`를 찾는다. 저장소·자산 이름은 파일 맨 위 상수 한 곳이다.
- **앱과의 관계**: 앱 레포(`Haneol/CheekPouch`)의 `website/`는 이 레포의 클론이다. 앱 게이트 테스트와 설치본의 `resources/docs`가 `dist/`를 읽으므로(`dist/admin/`은 설치본에서 제외) 앱 버전을 올릴 때 `dist/releases.json` 맨 앞에 같은 `alpha-<버전>` 항목을 추가해 이 레포에 먼저 푸시한다.
- **`/admin/`**: Jev 허용 목록 관리 페이지. API는 프록시(`cheekpouch-jev-proxy`)에 있고, 이 페이지는 비밀번호 로그인 후 세션 토큰만 `sessionStorage`에 둔다. 계약은 앱 레포의 `docs/contracts/2026-10-03-jev-admin-allowlist.md`.
