# Sonar Sweep 플랫폼 준비 사본

존댓말로 보고합니다. 원본 main과 다른 작업자의 변경을 보존합니다.

- 이 저장소에서 `wrangler deploy`, 원격 D1/KV 명령, 기존 Worker 수정·폐기를 하지 않습니다. Worker `sonar-sweep-rank`는 다른 운영 서비스와 이름이 겹칩니다.
- 플랫폼 준비 내용과 경계는 `jp/README.md`입니다. 현재 게임 소스는 `public/`의 분리 파일이며 옛 단일 HTML은 Git upstream `7f1e99a`에 남습니다.
- 테스트: `node --test tests/portal.test.mjs`. 반입 ZIP은 `node scripts/package.mjs`로 만듭니다. Google 로그인은 사용자 인수입니다.
- 파일 800줄·함수 50줄 이하, 명시 경로만 stage, `<type>: <description>` 커밋을 사용합니다.
