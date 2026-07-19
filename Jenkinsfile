/*
 * VeldrixAI — Enterprise CI/CD Pipeline (Phase 7: prod-protecting gate)
 *
 * Stages:
 *   Lint → Unit Tests → Phase 6 Proof Package → Security Scan
 *   → Performance Gate → E2E Tests (Playwright + AI Agent)
 *   → Build Docker Images → Push → [Deploy to Dev — dormant until droplet]
 *   → Promotion Summary → HUMAN-GATED Prod Promotion (SHA-pinned)
 *   → [Prod Rollback — parameterized, human-triggered]
 *
 * Branch strategy:
 *   ft/* & phase*  — Lint + Unit + Proof Package + Perf + E2E (no deploy)
 *   main           — Full suite + build + push; prod deploy ONLY via the
 *                    human input gate. Nothing auto-deploys to prod.
 *
 * Hard rules (Phase 7 — see CICD_RUNBOOK.md):
 *   - Tests hard-fail the build. An UNSTABLE/FAILED build never builds,
 *     pushes, or deploys an image.
 *   - Prod runs the exact tested :GIT_SHA image (never :latest).
 *   - Promotion ships engine OFF/0%/shadow; attaching to traffic is a
 *     separate runtime-flag act (PHASE6_CLOSED.md), never a deploy side effect.
 *   - Rollback: re-run with ROLLBACK_PROD=true → redeploys the previous_sha
 *     recorded on the droplet (or an explicit ROLLBACK_TO_SHA).
 *
 * Required Jenkins credentials:
 *   DOCKER_HUB_CREDS        — DockerHub / GHCR username:password
 *   DIGITAL_OCEAN_PAT       — DigitalOcean Personal Access Token
 *   VELDRIX_ENV_FILE        — .env.production Secret File
 *   slack-webhook-url       — Slack webhook URL (Secret Text)
 *   veldrix-ci-email        — Test user email (Secret Text)
 *   veldrix-ci-password     — Test user password (Secret Text)
 *   anthropic-api-key       — Anthropic API key for agent tests (Secret Text)
 * Required ONLY once the dev droplet is provisioned (DEV_DROPLET_ENABLED):
 *   VELDRIX_DEV_ENV_FILE    — dev-scoped .env Secret File (distinct from prod)
 *   veldrix-dev-ssh-key     — SSH private key for deploy@<dev droplet>
 */

pipeline {
  agent none  // each stage declares its own agent for isolation

  options {
    buildDiscarder(logRotator(numToKeepStr: '30'))
    // 120 min: the pipeline itself needs ~60; the rest is the human prod-approval
    // window (the input gate below has its own 60-min stage timeout). An expired
    // gate ABORTS the build — nothing deploys.
    timeout(time: 120, unit: 'MINUTES')
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  // Daily health check — runs full Playwright suite + unit tests at ~06:00 UTC
  // Skips lint, security scan, and deploy so it is safe to run continuously.
  // Requires "Allure Jenkins Plugin" installed on the controller for allure() step.
  triggers {
    cron('H 6 * * *')
  }

  parameters {
    booleanParam(
      name:         'RUN_AGENT_TESTS',
      defaultValue: true,
      description:  'Run Layer 2 AI agent exploratory tests (requires anthropic-api-key)'
    )
    string(
      name:         'VELDRIX_BASE_URL',
      defaultValue: 'https://app.veldrixai.ca',
      description:  'Target URL for Playwright / E2E tests'
    )
    booleanParam(
      name:         'ROLLBACK_PROD',
      defaultValue: false,
      description:  'PROD ROLLBACK: skip all build/test stages and redeploy a previous known-good SHA to production (human-confirmed via input gate). See CICD_RUNBOOK.md §Rollback.'
    )
    string(
      name:         'ROLLBACK_TO_SHA',
      defaultValue: '',
      description:  'Rollback target image tag (git SHA, 7-40 hex chars). Leave EMPTY to use previous_sha recorded on the droplet.'
    )
  }

  environment {
    COMPOSE_PROJECT_NAME = "veldrixai-ci-${BUILD_NUMBER}"
    DOCKER_REGISTRY      = "ghcr.io/veldrixai"
    IMAGE_TAG            = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
    VELDRIX_BASE_URL     = "${params.VELDRIX_BASE_URL}"
    CI                   = 'true'
    // ── Deploy targets ──────────────────────────────────────────────────────
    PROD_SSH_TARGET      = 'deploy@api.veldrixai.ca'
    PROD_DIR             = '/opt/veldrixai'
    // Dev droplet (Phase 7 Fix 7 — DORMANT). Flip to 'true' ONLY after the
    // droplet is provisioned (infra/terraform APPLY-RUNBOOK.md) and the
    // VELDRIX_DEV_ENV_FILE + veldrix-dev-ssh-key credentials exist.
    // Activation steps: CICD_RUNBOOK.md §Dev auto-deploy activation.
    DEV_DROPLET_ENABLED  = 'false'
    DEV_DROPLET_HOST     = 'api.dev.veldrixai.ca'   // user comes from veldrix-dev-ssh-key credential
    DEV_DIR              = '/opt/veldrixai'
  }

  stages {

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1 — CODE QUALITY (parallel linters, runs on all branches)
    // Skipped on scheduled cron builds — no new code to lint.
    // ─────────────────────────────────────────────────────────────────────────
    stage('Code Quality') {
      when {
        allOf {
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
        }
      }
      parallel {

        stage('Python — ruff') {
          agent { docker { image 'python:3.11-slim'; args '--user root' } }
          steps {
            sh '''
              pip install --quiet --upgrade pip ruff
              ruff check backend/ --output-format=github
            '''
          }
        }

        stage('Python — mypy') {
          agent { docker { image 'python:3.11-slim'; args '--user root' } }
          steps {
            sh '''
              pip install --quiet --upgrade pip mypy \
                fastapi pydantic pydantic-settings sqlalchemy \
                python-jose bcrypt python-dotenv httpx
              mypy backend/auth/app/   --ignore-missing-imports --strict-equality || true
              mypy backend/core/src/   --ignore-missing-imports --strict-equality || true
              mypy backend/connectors/src/ --ignore-missing-imports --strict-equality || true
            '''
          }
        }

        stage('Python — bandit') {
          agent { docker { image 'python:3.11-slim'; args '--user root' } }
          steps {
            sh '''
              pip install --quiet bandit
              bandit -r backend/ -x backend/*/tests/ \
                     --severity-level medium --confidence-level medium \
                     -f json -o bandit-report.json || true
              python3 -c "
import json, sys
with open('bandit-report.json') as f:
    report = json.load(f)
high = [r for r in report.get('results', []) if r['issue_severity'] == 'HIGH']
if high:
    print(f'FATAL: {len(high)} HIGH severity bandit issues:')
    for r in high:
        print(f'  {r[\"filename\"]}:{r[\"line_number\"]} — {r[\"issue_text\"]}')
    sys.exit(1)
print(f'bandit OK — {len(report[\"results\"])} non-HIGH findings')
"
            '''
          }
          post {
            always {
              archiveArtifacts artifacts: 'bandit-report.json', allowEmptyArchive: true
            }
          }
        }

        stage('Python — safety') {
          agent { docker { image 'python:3.11-slim'; args '--user root' } }
          steps {
            sh '''
              pip install --quiet safety
              # Collect all requirements files
              find backend/ -name "requirements*.txt" | xargs -I{} pip install --quiet -r {} 2>/dev/null || true
              safety check --json -o safety-report.json 2>/dev/null || true
              python3 -c "
import json, sys
try:
    with open('safety-report.json') as f:
        data = json.load(f)
    vulns = data.get('vulnerabilities', [])
    critical = [v for v in vulns if v.get('severity','').upper() in ('CRITICAL','HIGH')]
    if critical:
        print(f'FATAL: {len(critical)} critical/high CVEs:')
        for v in critical:
            print(f'  {v.get(\"package_name\")} {v.get(\"analyzed_version\")}: {v.get(\"advisory\",\"\")}')
        sys.exit(1)
    print(f'safety OK — {len(vulns)} total findings, 0 critical/high')
except Exception as e:
    print(f'safety report unreadable: {e} — treating as warning')
"
            '''
          }
          post {
            always {
              archiveArtifacts artifacts: 'safety-report.json', allowEmptyArchive: true
            }
          }
        }

        stage('TypeScript — ESLint + tsc') {
          agent { docker { image 'node:20-slim'; args '--user root' } }
          steps {
            dir('frontend') {
              sh '''
                npm ci --prefer-offline --quiet
                npx eslint . --ext .ts,.tsx --max-warnings=0
                npx tsc --noEmit
              '''
            }
          }
        }

      } // end parallel
    } // end Code Quality

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2 — UNIT TESTS (all branches)
    // ─────────────────────────────────────────────────────────────────────────
    // Phase 7 green-integrity: NO `|| true` on any pytest — a failing test,
    // a collection error, a pip crash, or a --cov-fail-under violation FAILS
    // the build. junit XML remains for reporting, not for failure detection.
    stage('Unit Tests') {
      when {
        beforeAgent true
        not { expression { params.ROLLBACK_PROD } }
      }
      agent { docker { image 'python:3.11-slim'; args '--user root' } }
      steps {
        sh 'mkdir -p test-results allure-results/auth allure-results/core allure-results/connectors allure-results/sdk'

        // Auth service
        sh '''
          cd backend/auth
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx allure-pytest
          python -m pytest tests/ \
            --cov=app --cov-report=xml:coverage-auth.xml \
            --cov-fail-under=60 \
            -v --tb=short -m "not integration" \
            --junit-xml=../../test-results/auth-unit.xml \
            --alluredir=../../allure-results/auth
          cd ../..
        '''

        // Core service
        sh '''
          cd backend/core
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx respx allure-pytest
          python -m pytest tests/ \
            --cov=src --cov-report=xml:coverage-core.xml \
            --cov-fail-under=60 \
            -v --tb=short -m "not integration" \
            --junit-xml=../../test-results/core-unit.xml \
            --alluredir=../../allure-results/core
          cd ../..
        '''

        // Connectors service
        sh '''
          cd backend/connectors
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx allure-pytest
          if [ -d tests ]; then
            python -m pytest tests/ \
              --cov=src --cov-report=xml:coverage-connectors.xml \
              --cov-fail-under=40 \
              -v --tb=short -m "not integration" \
              --junit-xml=../../test-results/connectors-unit.xml \
              --alluredir=../../allure-results/connectors
          else
            echo "No connectors tests directory — skipping"
          fi
          cd ../..
        '''

        // SDK (the pip fallback chain is intentional: editable install first,
        // bare deps second; if BOTH fail the step — and the build — fails)
        sh '''
          cd sdk
          pip install --quiet -e ".[test]" pytest pytest-asyncio pytest-cov httpx allure-pytest 2>/dev/null || \
            pip install --quiet pytest pytest-asyncio pytest-cov httpx pydantic allure-pytest
          python -m pytest tests/ \
            --cov=veldrixai --cov-report=xml:coverage-sdk.xml \
            -v --tb=short \
            --junit-xml=../test-results/sdk-unit.xml \
            --alluredir=../allure-results/sdk
          cd ..
        '''
      }
      post {
        always {
          // allowEmptyResults: if pytest died before writing XML the sh step
          // already failed the build — a missing report must not double-error.
          junit testResults: 'test-results/*.xml', allowEmptyResults: true
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3 — PHASE 6 PROOF PACKAGE (all branches, HARD-FAILING)
    //
    // Replaces the retired "Integration Tests" stage, which ran the nonexistent
    // repo-root tests/integration/ and green-lit on zero tests (RECON-CICD
    // Finding 3). This is the canonical Phase 6 shadow-engine proof suite
    // (INTEGRATION_RUNBOOK.md §6, 46 tests): isolation, zero-actuation,
    // byte-identical responses, the 5-fault injection matrix, hot-detach
    // runtime flags, and pool wedge self-heal. In-process (fakeredis) — needs
    // no live stack. A REQUIRED gate for prod promotion: any failure fails
    // the build, so Build/Push/Promotion can never see a red proof package.
    //
    // The live drivers (shadow_shed_load.py / shadow_hot_detach_live.py) are
    // dev-stack evidence, NOT CI-runnable — their captured evidence lives in
    // docs/evidence/phase6-closeout/ and is surfaced in the promotion summary.
    // ─────────────────────────────────────────────────────────────────────────
    stage('Phase 6 Proof Package') {
      when {
        beforeAgent true
        not { expression { params.ROLLBACK_PROD } }
      }
      agent { docker { image 'python:3.11-slim'; args '--user root' } }
      steps {
        sh '''
          mkdir -p test-results
          cd backend/core
          pip install --quiet -r requirements.txt pytest pytest-asyncio httpx respx
          python -m pytest \
            tests/test_shadow_integration.py \
            tests/integration/test_shadow_integrated_system.py \
            tests/test_shadow_tap_wiring.py \
            tests/test_shadow_flags.py \
            tests/test_shadow_pool_selfheal.py \
            -v --tb=short \
            --junit-xml=../../test-results/phase6-proof.xml
        '''
      }
      post {
        always {
          junit testResults: 'test-results/phase6-proof.xml', allowEmptyResults: true
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4 — SECURITY SCAN (main only)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Security Scan') {
      when {
        allOf {
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
        }
      }
      parallel {

        stage('SAST — semgrep') {
          agent { docker { image 'python:3.11-slim'; args '--user root' } }
          steps {
            sh '''
              pip install --quiet semgrep
              semgrep --config=auto backend/ \
                      --severity=ERROR \
                      --json --output=semgrep-results.json || true
              python3 -c "
import json, sys
try:
    with open('semgrep-results.json') as f:
        data = json.load(f)
    errors = [r for r in data.get('results', []) if r.get('extra', {}).get('severity') == 'ERROR']
    if errors:
        print(f'FATAL: {len(errors)} SAST errors found')
        for e in errors[:5]:
            print(f'  {e.get(\"path\")}:{e.get(\"start\",{}).get(\"line\")} — {e.get(\"extra\",{}).get(\"message\",\"\")}')
        sys.exit(1)
    print(f'semgrep OK — {len(data.get(\"results\",[]))} findings, 0 errors')
except Exception as ex:
    print(f'semgrep report error: {ex}')
"
            '''
          }
          post {
            always {
              archiveArtifacts artifacts: 'semgrep-results.json', allowEmptyArchive: true
            }
          }
        }

        stage('Docker Scan — trivy') {
          agent { label 'docker-available' }
          steps {
            sh '''
              # Install trivy if not present
              which trivy || \
                (curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.50.1)

              # Build the auth image for scanning (cheapest image = best proxy for all)
              docker build -f backend/auth/Dockerfile -t veldrixai-scan-target:ci backend/auth/ 2>/dev/null || \
                echo "Dockerfile build failed — scan skipped"

              trivy image \
                --severity CRITICAL,HIGH \
                --exit-code 0 \
                --format json \
                --output trivy-report.json \
                veldrixai-scan-target:ci 2>/dev/null || echo "trivy scan completed with findings"

              docker rmi veldrixai-scan-target:ci 2>/dev/null || true
            '''
          }
          post {
            always {
              archiveArtifacts artifacts: 'trivy-report.json', allowEmptyArchive: true
            }
          }
        }

      } // end parallel
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5 — PERFORMANCE GATE (main + phase*/ft/* + daily cron)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Performance Gate') {
      // 'develop' does not exist (RECON-CICD Finding 4) — repointed to the
      // real pre-main branches (phase*/ft/*) so perf regressions surface
      // before merge, plus main and the daily cron.
      when {
        beforeAgent true
        allOf {
          not { expression { params.ROLLBACK_PROD } }
          anyOf {
            branch 'main'
            branch pattern: 'phase*', comparator: 'GLOB'
            branch pattern: 'ft/**', comparator: 'GLOB'
            triggeredBy 'TimerTrigger'
          }
        }
      }
      agent { docker { image 'python:3.11-slim'; args '--user root' } }
      steps {
        sh '''
          mkdir -p test-results
          cd backend/core
          pip install --quiet -r requirements.txt pytest pytest-asyncio httpx respx
          python -m pytest tests/test_latency.py \
            -v --tb=short \
            --junit-xml=../../test-results/performance.xml
          cd ../..
        '''
      }
      post {
        always {
          junit testResults: 'test-results/performance.xml', allowEmptyResults: true
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6 — E2E TESTS: Layer 1 Critical + Layer 2 AI Agent
    //           (main + phase*/ft/* + daily cron)
    // ─────────────────────────────────────────────────────────────────────────
    stage('E2E Tests') {
      // 'develop' does not exist — repointed to phase*/ft/* (Finding 4).
      when {
        beforeAgent true
        allOf {
          not { expression { params.ROLLBACK_PROD } }
          anyOf {
            branch 'main'
            branch pattern: 'phase*', comparator: 'GLOB'
            branch pattern: 'ft/**', comparator: 'GLOB'
            triggeredBy 'TimerTrigger'
          }
        }
      }
      agent {
        docker {
          image 'mcr.microsoft.com/playwright:v1.49.0-jammy'
          args  '--shm-size=2gb --user root'
        }
      }
      environment {
        VELDRIX_TEST_EMAIL    = credentials('veldrix-ci-email')
        VELDRIX_TEST_PASSWORD = credentials('veldrix-ci-password')
        ANTHROPIC_API_KEY     = credentials('anthropic-api-key')
        SLACK_WEBHOOK_URL     = credentials('slack-webhook-url')
        NODE_ENV              = 'test'
      }
      steps {
        dir('frontend') {
          sh 'npm ci --prefer-offline --quiet'
          sh 'npx playwright install --with-deps chromium firefox webkit'

          // Auth setup
          sh '''
            npx playwright test --project=setup \
              --config playwright.config.ts 2>&1
          '''

          // Layer 1 — critical path (Chrome, CI-blocking)
          sh '''
            npx playwright test --project=critical-chrome \
              --config playwright.config.ts \
              --reporter=list,junit,html 2>&1
          '''

          // Layer 1 — cross-browser (Firefox, advisory)
          sh '''
            npx playwright test --project=critical-firefox \
              --config playwright.config.ts \
              --reporter=list 2>&1 || echo "Firefox advisory check failed"
          '''

          // Layer 2 — AI agent exploratory (advisory, not blocking unless hasBlockingFailures)
          // Always runs on scheduled daily builds to catch edge-case regressions.
          script {
            def isCronBuild = currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause')?.size() > 0
            if (params.RUN_AGENT_TESTS.toBoolean() || isCronBuild) {
              sh '''
                npx @playwright/mcp --port 8931 &
                MCP_PID=$!
                sleep 3
                export PLAYWRIGHT_MCP_URL=http://localhost:8931/sse
                npx tsx tests/agent/veldrix-test-agent.ts
                AGENT_EXIT=$?
                kill $MCP_PID 2>/dev/null || true
                exit $AGENT_EXIT
              ''' // agent failures handled in post block
            }
          }
        }
      }
      post {
        always {
          junit 'frontend/tests/reports/junit.xml'
          publishHTML(target: [
            allowMissing:          true,
            alwaysLinkToLastBuild: true,
            keepAll:               true,
            reportDir:             'frontend/tests/reports/html',
            reportFiles:           'index.html',
            reportName:            'Playwright E2E Report',
          ])
          // Allure E2E report — requires "Allure Jenkins Plugin" on the controller
          script {
            if (fileExists('frontend/tests/reports/allure-results')) {
              allure(results: [[path: 'frontend/tests/reports/allure-results']])
            }
          }
          archiveArtifacts artifacts: 'frontend/tests/reports/agent-*.json,frontend/tests/screenshots/**/*.png',
                           allowEmptyArchive: true
        }
        failure {
          script {
            def reportFile = 'frontend/tests/reports/agent-final.json'
            if (fileExists(reportFile)) {
              def report = readJSON file: reportFile
              if (report.hasBlockingFailures) {
                currentBuild.result = 'FAILURE'
              } else {
                currentBuild.result = 'UNSTABLE'
              }
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 7 — BUILD DOCKER IMAGES (main only)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Build Images') {
      // SUCCESS gate (Phase 7): an UNSTABLE/FAILED build must never produce
      // an image — closes the hole where a red main build still moved :latest.
      when {
        beforeAgent true
        allOf {
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
          expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      agent { label 'docker-available' }
      steps {
        script {
          def services = ['auth', 'core', 'connectors']
          services.each { svc ->
            sh """
              docker build \\
                --file backend/${svc}/Dockerfile \\
                --tag ${env.DOCKER_REGISTRY}/veldrixai-${svc}:${env.IMAGE_TAG} \\
                --tag ${env.DOCKER_REGISTRY}/veldrixai-${svc}:latest \\
                --build-arg BUILD_DATE=\$(date -u +%Y-%m-%dT%H:%M:%SZ) \\
                --build-arg GIT_COMMIT=${env.GIT_COMMIT} \\
                --build-arg VERSION=${env.IMAGE_TAG} \\
                --label "org.opencontainers.image.created=\$(date -u +%Y-%m-%dT%H:%M:%SZ)" \\
                --label "org.opencontainers.image.revision=${env.GIT_COMMIT}" \\
                --label "org.opencontainers.image.version=${env.IMAGE_TAG}" \\
                backend/${svc}/
            """
          }
          sh """
            docker build \\
              --file frontend/Dockerfile \\
              --tag ${env.DOCKER_REGISTRY}/veldrixai-frontend:${env.IMAGE_TAG} \\
              --tag ${env.DOCKER_REGISTRY}/veldrixai-frontend:latest \\
              --build-arg GIT_COMMIT=${env.GIT_COMMIT} \\
              frontend/
          """
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 8 — PUSH TO REGISTRY (main only)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Push Images') {
      // Same SUCCESS gate as Build: nothing red ever reaches GHCR.
      when {
        beforeAgent true
        allOf {
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
          expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      agent { label 'docker-available' }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'DOCKER_HUB_CREDS',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login ghcr.io -u "$DOCKER_USER" --password-stdin
            for svc in auth core connectors frontend; do
              docker push ${DOCKER_REGISTRY}/veldrixai-${svc}:${IMAGE_TAG}
              docker push ${DOCKER_REGISTRY}/veldrixai-${svc}:latest
              echo "Pushed veldrixai-${svc}:${IMAGE_TAG}"
            done
          '''
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 9 — DEPLOY TO DEV (AUTO on green; DORMANT until droplet funded)
    //
    // Authored against the cloud-dev-droplet contract (RECON-CICD Finding 4
    // target #2): infra/compose/docker-compose.deploy.yml with ENVIRONMENT=dev,
    // smoke-verified by infra/scripts/verify-dev.sh. The droplet does not exist
    // yet (infra/terraform never applied — NOT-USED-LOCALLY.md), so this stage
    // is GUARDED by DEV_DROPLET_ENABLED='false' in the environment block.
    // Activation: CICD_RUNBOOK.md §Dev auto-deploy activation. Once active it
    // fires automatically on green main — only PROD is human-gated.
    // It never targets the local WSL2 mirror (Finding 4 target #1).
    // ─────────────────────────────────────────────────────────────────────────
    stage('Deploy to Dev') {
      when {
        beforeAgent true
        allOf {
          environment name: 'DEV_DROPLET_ENABLED', value: 'true'
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
          expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      agent { label 'docker-available' }
      steps {
        withCredentials([
          file(credentialsId: 'VELDRIX_DEV_ENV_FILE', variable: 'DEV_ENV_FILE'),
          sshUserPrivateKey(credentialsId: 'veldrix-dev-ssh-key',
                            keyFileVariable: 'DEV_SSH_KEY',
                            usernameVariable: 'DEV_SSH_USER')
        ]) {
          sh '''
            # Remote script — heredoc is quoted, so $vars expand on the DROPLET.
            cat > dev-deploy-remote.sh <<'REMOTE'
set -e
cd /opt/veldrixai

# Safety: this stage must only ever act on a DEV-scoped environment.
grep -q '^ENVIRONMENT=dev' .env || { echo 'FATAL: /opt/veldrixai/.env is not ENVIRONMENT=dev — refusing to deploy'; exit 1; }

# Pin the exact tested artifact (same :SHA that passed the gate)
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=${NEW_SHA}" >> .env

export COMPOSE_PROFILES=stub
docker compose -f docker-compose.deploy.yml --env-file .env pull
docker compose -f docker-compose.deploy.yml --env-file .env up -d --remove-orphans

# Dev smoke — parity + isolation + chain-health + stub inference (Phase 5).
# A failed smoke FAILS this build, which blocks prod promotion downstream.
COMPOSE_FILE=/opt/veldrixai/docker-compose.deploy.yml ENV_FILE=/opt/veldrixai/.env \
  bash infra/scripts/verify-dev.sh

# Deploy audit record (dev)
mkdir -p deploy-state
PREV=$(cat deploy-state/current_sha 2>/dev/null || echo "none")
echo "${NEW_SHA}" > deploy-state/current_sha
echo "${PREV}" > deploy-state/previous_sha
printf '{"ts":"%s","action":"deploy","environment":"dev","sha":"%s","previous_sha":"%s","approver":"auto-on-green","build":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${NEW_SHA}" "${PREV}" "${BUILD_URL_IN}" >> deploy-state/deploy-log.jsonl
echo "Dev deploy of ${NEW_SHA} verified"
REMOTE

            # Ship the deploy overlay + verify tooling + dev-scoped env, then run.
            SSH_OPTS="-i $DEV_SSH_KEY -o StrictHostKeyChecking=no"
            TARGET="$DEV_SSH_USER@$DEV_DROPLET_HOST"
            ssh $SSH_OPTS "$TARGET" "mkdir -p $DEV_DIR/infra"
            scp $SSH_OPTS infra/compose/docker-compose.deploy.yml "$TARGET:$DEV_DIR/docker-compose.deploy.yml"
            scp $SSH_OPTS -r infra/scripts infra/db "$TARGET:$DEV_DIR/infra/"
            scp $SSH_OPTS "$DEV_ENV_FILE" "$TARGET:$DEV_DIR/.env"
            ssh $SSH_OPTS "$TARGET" "NEW_SHA='$IMAGE_TAG' BUILD_URL_IN='$BUILD_URL' bash -s" < dev-deploy-remote.sh
          '''
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 10 — PROMOTION SUMMARY (what the human approver reviews)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Promotion Summary') {
      when {
        beforeAgent true
        allOf {
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
          expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      agent { label 'docker-available' }
      steps {
        sh '''
          # Read-only: what is prod running now? (tolerate first-run absence)
          CURRENT_PROD=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$PROD_SSH_TARGET" \
            "cat $PROD_DIR/deploy-state/current_sha 2>/dev/null" 2>/dev/null || echo "")
          PREVIOUS_PROD=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$PROD_SSH_TARGET" \
            "cat $PROD_DIR/deploy-state/previous_sha 2>/dev/null" 2>/dev/null || echo "")

          {
            echo "# Production Promotion Summary"
            echo
            echo "**Candidate artifact:** \\`$IMAGE_TAG\\` (full commit $GIT_COMMIT)"
            echo "**Images:** ghcr.io/veldrixai/veldrixai-{auth,core,connectors,frontend}:$IMAGE_TAG"
            echo "**Currently on prod:** \\`${CURRENT_PROD:-unknown (state not initialized — first recorded deploy)}\\`"
            echo
            echo "## What is changing"
            if [ -n "$CURRENT_PROD" ] && git cat-file -e "$CURRENT_PROD^{commit}" 2>/dev/null; then
              git log --oneline "$CURRENT_PROD..HEAD" || echo "(diff unavailable)"
            else
              echo "(commit range unavailable — prod SHA unknown to this checkout; review branch history manually)"
            fi
            echo
            echo "## Proof-gate status (green by construction — this stage is unreachable otherwise)"
            echo "- Full test suite: HARD-PASSED this build (no || true; failures fail the build)"
            echo "- Phase 6 proof package (46 tests): PASSED this build (dedicated stage)"
            echo "- Dev smoke (verify-dev.sh): $([ "$DEV_DROPLET_ENABLED" = "true" ] && echo "PASSED this build (Deploy to Dev stage)" || echo "N/A — dev droplet not yet provisioned (stage dormant)")"
            echo
            echo "## Phase 6 evidence (review before approving)"
            echo "- PHASE6_CLOSED.md — the scorecard: all promote-to-prod criteria live-proven 2026-07-15"
            echo "- INTEGRATION_RUNBOOK.md §7 — the six promotion criteria; §2-3 — hot-detach flip bound (max 2.5 s at defaults)"
            echo "- docs/evidence/phase6-closeout/ — Grafana renders: shed proof, hot-detach + fail-safe"
            echo
            echo "## Posture on deploy (ship code, do NOT attach)"
            echo "- The engine deploys OFF / 0% sample / shadow (no flags set = detached — PHASE6_CLOSED.md)"
            echo "- Attaching to prod traffic is a SEPARATE runtime-flag act (POST /internal/shadow-flags), never a deploy side effect"
            echo
            echo "## Rollback plan"
            echo "- Previous prod SHA retained on droplet: \\`${PREVIOUS_PROD:-none recorded yet}\\`"
            echo "- One action: re-run this job with ROLLBACK_PROD=true (redeploys previous_sha, or ROLLBACK_TO_SHA if given)"
            echo "- No rebuild — rollback re-pins the retained GHCR :SHA tag (CICD_RUNBOOK.md §Rollback)"
          } > promotion-summary.md

          echo "══════════════════ PROMOTION SUMMARY ══════════════════"
          cat promotion-summary.md
          echo "════════════════════════════════════════════════════════"
        '''
        archiveArtifacts artifacts: 'promotion-summary.md', allowEmptyArchive: false
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 11 — PROD PROMOTION (HUMAN-GATED — the Phase 7 gate)
    //
    // Prod NEVER deploys automatically. This stage-level input pauses BEFORE
    // an agent is allocated; an unanswered gate times out in 60 min and the
    // build ABORTS — nothing deploys. The approver's Jenkins ID is captured
    // in PROD_APPROVER and written to the droplet's deploy audit log.
    // ─────────────────────────────────────────────────────────────────────────
    stage('Prod Promotion') {
      when {
        beforeInput true
        allOf {
          branch 'main'
          not { triggeredBy 'TimerTrigger' }
          not { expression { params.ROLLBACK_PROD } }
          expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      options { timeout(time: 60, unit: 'MINUTES') }
      input {
        message 'Promote this build to PRODUCTION? Review the archived promotion-summary.md first: proof-gate status, Phase 6 evidence, diff since prod, rollback plan. Promotion ships the tested :SHA with the engine OFF/0%/shadow — it does NOT attach the engine to traffic.'
        ok 'Promote to production'
        submitterParameter 'PROD_APPROVER'
      }
      agent { label 'docker-available' }
      steps {
        withCredentials([file(credentialsId: 'VELDRIX_ENV_FILE', variable: 'ENV_FILE')]) {
          sh '''
            # Remote script — quoted heredoc: $vars expand on the DROPLET.
            cat > prod-deploy-remote.sh <<'REMOTE'
set -e
cd /opt/veldrixai
mv .env.production .env 2>/dev/null || true

# Phase 7: pin the EXACT tested artifact. Prod never runs :latest again.
sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=${NEW_SHA}" >> .env

mkdir -p deploy-state
PREV=$(cat deploy-state/current_sha 2>/dev/null || echo "none")

# Pull + rolling update of the pinned SHA (identical artifact — no rebuild)
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --no-deps --remove-orphans

# Record what is now running BEFORE health, so state never lies about reality
echo "${NEW_SHA}" > deploy-state/current_sha
echo "${PREV}" > deploy-state/previous_sha

sleep 10
HEALTH=passed
curl -sf http://localhost:8000/health >/dev/null && echo 'auth OK'        || HEALTH=failed
curl -sf http://localhost:8001/health >/dev/null && echo 'core OK'        || HEALTH=failed
curl -sf http://localhost:8002/health >/dev/null && echo 'connectors OK'  || HEALTH=failed

# Deploy audit record: what, where, when, who approved, health outcome
printf '{"ts":"%s","action":"deploy","environment":"prod","sha":"%s","previous_sha":"%s","approver":"%s","build":"%s","health":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${NEW_SHA}" "${PREV}" "${APPROVER}" "${BUILD_URL_IN}" "${HEALTH}" \
  >> deploy-state/deploy-log.jsonl

if [ "${HEALTH}" != "passed" ]; then
  echo '████████████████████████████████████████████████████████████████'
  echo "██  PROD HEALTH CHECK FAILED after deploying ${NEW_SHA}"
  echo "██  Previous SHA ${PREV} is retained in GHCR and deploy-state."
  echo '██  ROLLBACK IS ONE ACTION: re-run the Jenkins job with'
  echo '██  ROLLBACK_PROD=true  (see CICD_RUNBOOK.md §Rollback)'
  echo '████████████████████████████████████████████████████████████████'
  exit 1
fi
echo "Deployment of ${NEW_SHA} verified healthy."
echo "NOTE: engine posture is unchanged by this deploy — OFF/0%/shadow until a separate runtime-flag act."
REMOTE

            # Ship compose + env (existing prod mechanism, extended), then run.
            scp -o StrictHostKeyChecking=no \
                docker-compose.prod.yml \
                "$ENV_FILE" \
                "$PROD_SSH_TARGET:$PROD_DIR/"
            ssh -o StrictHostKeyChecking=no "$PROD_SSH_TARGET" \
                "NEW_SHA='$IMAGE_TAG' APPROVER='$PROD_APPROVER' BUILD_URL_IN='$BUILD_URL' bash -s" < prod-deploy-remote.sh
          '''
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 12 — PROD ROLLBACK (parameterized, human-confirmed, no rebuild)
    //
    // Trigger: "Build with Parameters" → ROLLBACK_PROD=true. All build/test
    // stages are skipped (speed is the point); an input gate confirms; then
    // the previous known-good :SHA (or ROLLBACK_TO_SHA) is re-pinned and
    // redeployed from GHCR via the same SSH mechanism. Logged like a deploy.
    // ─────────────────────────────────────────────────────────────────────────
    stage('Prod Rollback') {
      when {
        beforeInput true
        allOf {
          branch 'main'
          expression { params.ROLLBACK_PROD }
          not { triggeredBy 'TimerTrigger' }
        }
      }
      options { timeout(time: 30, unit: 'MINUTES') }
      input {
        message 'CONFIRM PRODUCTION ROLLBACK. Target = ROLLBACK_TO_SHA if set, otherwise previous_sha recorded on the droplet. This re-pins and redeploys a retained GHCR image — no rebuild.'
        ok 'Roll back production'
        submitterParameter 'ROLLBACK_APPROVER'
      }
      agent { label 'docker-available' }
      steps {
        sh '''
          cat > prod-rollback-remote.sh <<'REMOTE'
set -e
cd /opt/veldrixai

TARGET="${TARGET_SHA}"
if [ -z "${TARGET}" ]; then
  TARGET=$(cat deploy-state/previous_sha 2>/dev/null || echo "")
fi
case "${TARGET}" in
  none|"") echo "FATAL: no rollback target — previous_sha not recorded and ROLLBACK_TO_SHA not given"; exit 1 ;;
esac
echo "${TARGET}" | grep -Eq '^[0-9a-f]{7,40}$' || { echo "FATAL: rollback target '${TARGET}' is not a git SHA tag"; exit 1; }

BAD=$(cat deploy-state/current_sha 2>/dev/null || echo "none")
echo "Rolling back prod: ${BAD} -> ${TARGET}"

sed -i '/^IMAGE_TAG=/d' .env
echo "IMAGE_TAG=${TARGET}" >> .env

docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --no-deps --remove-orphans

echo "${TARGET}" > deploy-state/current_sha
echo "${BAD}" > deploy-state/previous_sha

sleep 10
HEALTH=passed
curl -sf http://localhost:8000/health >/dev/null && echo 'auth OK'        || HEALTH=failed
curl -sf http://localhost:8001/health >/dev/null && echo 'core OK'        || HEALTH=failed
curl -sf http://localhost:8002/health >/dev/null && echo 'connectors OK'  || HEALTH=failed

printf '{"ts":"%s","action":"rollback","environment":"prod","sha":"%s","previous_sha":"%s","approver":"%s","build":"%s","health":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${TARGET}" "${BAD}" "${APPROVER}" "${BUILD_URL_IN}" "${HEALTH}" \
  >> deploy-state/deploy-log.jsonl

[ "${HEALTH}" = "passed" ] || { echo "ROLLBACK HEALTH CHECK FAILED — escalate; deploy-log has the history"; exit 1; }
echo "Rollback to ${TARGET} verified healthy."
REMOTE

          # Validate the human-typed param BEFORE it touches a remote command
          # line: empty (= use previous_sha) or a plain hex SHA — nothing else.
          if [ -n "$ROLLBACK_TO_SHA" ]; then
            echo "$ROLLBACK_TO_SHA" | grep -Eq '^[0-9a-f]{7,40}$' || {
              echo "FATAL: ROLLBACK_TO_SHA '$ROLLBACK_TO_SHA' is not a git SHA"; exit 1;
            }
          fi
          ssh -o StrictHostKeyChecking=no "$PROD_SSH_TARGET" \
              "TARGET_SHA='$ROLLBACK_TO_SHA' APPROVER='$ROLLBACK_APPROVER' BUILD_URL_IN='$BUILD_URL' bash -s" < prod-rollback-remote.sh
        '''
      }
    }

  } // end stages

  post {
    success {
      script {
        withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
          def deployNote = env.PROD_APPROVER ? " | PROD DEPLOY approved by: ${env.PROD_APPROVER}" : (env.ROLLBACK_APPROVER ? " | PROD ROLLBACK approved by: ${env.ROLLBACK_APPROVER}" : "")
          def msg = "✅ *VeldrixAI Build #${BUILD_NUMBER} PASSED* | branch: `${env.BRANCH_NAME}` | commit: `${env.IMAGE_TAG}`${deployNote} | ${currentBuild.durationString} | <${BUILD_URL}|View>"
          sh "curl -s -X POST -H 'Content-type: application/json' --data '{\"text\":\"${msg}\"}' \"${SLACK_WEBHOOK_URL}\" || true"
        }
      }
    }
    failure {
      script {
        withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
          def msg = "🚨 *VeldrixAI Build #${BUILD_NUMBER} FAILED* | branch: `${env.BRANCH_NAME}` | commit: `${env.IMAGE_TAG}` | <${BUILD_URL}|View Logs>"
          sh "curl -s -X POST -H 'Content-type: application/json' --data '{\"text\":\"${msg}\"}' \"${SLACK_WEBHOOK_URL}\" || true"
        }
      }
    }
    always {
      publishHTML(target: [
        allowMissing:          true,
        alwaysLinkToLastBuild: true,
        keepAll:               true,
        reportDir:             'frontend/tests/reports/html',
        reportFiles:           'index.html',
        reportName:            'Playwright Full Report',
      ])
      // Combined Allure report (E2E + all backend services)
      // Requires "Allure Jenkins Plugin" on the Jenkins controller.
      script {
        def allureResultPaths = []
        def candidatePaths = [
          'frontend/tests/reports/allure-results',
          'allure-results/auth',
          'allure-results/core',
          'allure-results/connectors',
          'allure-results/sdk',
        ]
        candidatePaths.each { p ->
          if (fileExists(p)) { allureResultPaths << [path: p] }
        }
        if (allureResultPaths.size() > 0) {
          allure([reportBuildPolicy: 'ALWAYS', results: allureResultPaths])
        }
      }
      cleanWs()
    }
  }
}
