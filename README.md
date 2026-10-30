# Parking Twin · 2.5D Studio

**v0.4:** 인천공항 공식 주차 현황, 2.5D 차량 시뮬레이션, 배정 근거 검사기와 반복 실험 분석을 제공하는 주차 공간 할당 플랫폼입니다. 최종보고서 본문은 작성하지 않았으며, 실험 원자료·그림·재현 규약을 준비했습니다.

## 실행

Node.js 22.12 이상, pnpm 12.3.4, WebGL2 브라우저가 필요합니다.

```bash
pnpm install --frozen-lockfile
pnpm dev
# 운영 빌드
pnpm build
pnpm preview
```

기본 [로컬 화면](http://127.0.0.1:5173/)에서 실행합니다. 정책·공식 저장 스냅샷·반복 실험 결과가 포함되어 재학습이나 외부 연결 없이 시연할 수 있습니다. 공식 현황 갱신과 관측 수집에는 dev/preview 서버와 외부 연결이 필요합니다. 정적 호스팅에서는 번들 관측 자료로 대체합니다.

## 구현 범위

- Three.js 직교 3D의 세단/SUV·조향·주차·후진 출차, 터미널·조명·그림자, 주야간·회전·확대·탑뷰·차량 추적
- Nearest·Random·Rule-based·DQN, 동일 수요의 동기 비교, 통로 용량·FIFO·이동 중 예약
- 기본 20면, 인천공항 T1 80면 축소 모델, 거리와 병목이 다른 비대칭 출구 20면
- 공항 세 층의 공식 잔여 대수·점유율·관측 시각, 새 관측 저장·중복 제거·시계열 비교
- 출차정보 사용/제외 정책 전환, 배정 직전 관찰·후보·Q값 검사기
- 미배정 우선 목적, 원래 출차 요청·물리적 준비·일정 지연 분리
- 독립 학습 seed 3개, 별도 학습한 출차정보 제외 실험, 학습 전 정책, 교통 seed 30개의 대응 비교
- 수요×예측 오차 민감도, 학습·검증 곡선, seed 편차와 탐색적 95% 대응 bootstrap 구간
- 웹 CSV 입력 검증, 차량별 CSV·결과 JSON, 전체 평가 CSV.gz, 보고서용 300 dpi PNG·SVG

공식 데이터는 층별 집계 현황입니다. 개별 차량·정밀 도면·도착과 출차 흐름은 합성 가정이며 실제 운영 효과를 입증한 시스템은 아닙니다. [모델 규약](docs/simulation-model.md), [공항 데이터](docs/incheon-data.md), [실험과 결과](docs/research-results.md)를 참조하세요.

## 재현

```bash
pnpm test
pnpm format:check
# 3환경 × 2입력 조건 × 3학습 seed, 각 200 episodes
pnpm research:train 200
pnpm research:publish
# 29,160회: 3환경 × 3수요유형/층 × 3규모 × 3오차 × 30교통 seed × 12실행
pnpm research:evaluate
pnpm research:verify
# matplotlib이 있는 Python 환경
python3 -m pip install matplotlib
pnpm figures
pnpm research:provenance
# 실제 공식 관측 8회, 간격 60초 (유한 수집)
pnpm collect:airport 8 60000
```

`research:train 200 --resume`는 저장된 동일 설정의 정책·로그를 재사용합니다. 고정 공항 스냅샷을 바꾼 경우 새 학습을 하세요. 테스트 seed로 정책을 선택하지 않습니다. 평가에 모든 학습 seed를 포함하고, 화면용 대표 정책만 검증 성능으로 선택합니다. 구체적 설정과 해시는 manifest와 provenance에 보존합니다. `pnpm refresh:airport`는 학습용 고정 스냅샷을 바꾸므로 기존 결과와 구별하세요.

| 파일                               | 내용                                 |
| ---------------------------------- | ------------------------------------ |
| `public/research/analysis.json`    | 조건별 평균·편차·대응 구간·교통별 점 |
| `public/research/runs.csv.gz`      | 29,160회 원자료와 입력 해시          |
| `public/research/manifest.json`    | 실험 설정·공항 스냅샷·18개 정책 해시 |
| `public/research/published.json`   | 화면용 정책의 검증 선택 기록         |
| `public/research/training/`        | 18개 학습 로그                       |
| `public/research/figures/`         | 재생성 가능한 PNG·SVG 그림           |
| `experiments/v0.4/policies/`       | 전체 학습 가중치                     |
| `data/observations/incheon.jsonl`  | 실제 관측 시각의 원자료              |
| `public/data/incheon-history.json` | 오프라인 시계열 자료                 |
| `experiments/archive/v0.3/`        | 구 목적함수의 과거 실험              |

## CLI와 CSV

```bash
pnpm start -- --scenario incheon --floor ground --strategy rl --count 180
pnpm start -- --scenario asymmetric --strategy rl --count 70
pnpm start -- --scenario office --strategy rule --seed 42 --output output/result.json
pnpm start -- data/vehicles.csv --strategy nearest
```

시나리오는 office, cinema, mall, incheon, asymmetric이며 전략은 nearest, random, rule, rl입니다.

```csv
vehicleId,arrivalTime,duration
CAR-001,0,30
CAR-002,2,20
```

CSV의 duration은 주차 완료 후 체류시간입니다. 빈 값·중복 ID·잘못된 숫자를 거부하며 웹은 1MB·300대·최대 도착+체류 1,970 tick으로 제한합니다. 단순 쉼표 구분만 지원합니다. CSV는 기본 20면 레이아웃에서 실행합니다.

## 해석의 한계

기본·공항 환경은 모든 면의 총 이동거리가 같아 거리 절감 효과를 평가하기 어렵습니다. 비대칭 모델은 이 제약을 다루는 별도 통제 실험입니다. 처리율을 먼저 확인하고 비용을 해석하세요. 배정된 신규 차량의 시간 평균과 배경 차량을 포함한 시스템 비용을 구분해야 합니다.

시간 tick은 실측 보정되지 않았습니다. 실제 관측 시계열의 MAE는 선택한 시간 대응 가정의 기술 통계이며 예측력 검증이 아닙니다. 학습 seed 3개의 신뢰구간은 탐색적이며 RL의 일반적 우수성이나 출차정보의 일관된 효과를 보장하지 않습니다. 실측 보정·장기 수집·다른 시설 검증은 후속 연구입니다.

중간 프로토타입 `src/simulation.ts`는 회귀 검증용이며 현재 웹·CLI·학습·평가는 공통 `src/twin/`을 사용합니다. [검증 기록](docs/verification.md)과 [최초 구현 계획](docs/implementation-plan.md)을 함께 남겼습니다.
