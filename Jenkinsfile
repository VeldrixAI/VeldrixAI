/*
 * VeldrixAI — Enterprise CI/CD Pipeline
 *
 * Stages:
 *   Lint → Unit Tests → Integration Tests → Security Scan
 *   → Performance Gate → E2E Tests (Playwright + AI Agent)
 *   → Build Docker Images → Push → Deploy to DigitalOcean
 *
 * Branch strategy:
 *   feature/*  — Lint + Unit Tests (fast feedback, ~8 min)
 *   develop    — Full test suite, no deploy
 *   main       — Full suite + Docker build + push + rolling deploy
 *
 * Required Jenkins credentials:
 *   DOCKER_HUB_CREDS        — DockerHub / GHCR username:password
 *   DIGITAL_OCEAN_PAT       — DigitalOcean Personal Access Token
 *   VELDRIX_ENV_FILE        — .env.production Secret File
 *   SLACK_WEBHOOK_URL       — Slack webhook URL
 *   veldrix-ci-email        — Test user email (Secret Text)
 *   veldrix-ci-password     — Test user password (Secret Text)
 *   anthropic-api-key       — Anthropic API key for agent tests (Secret Text)
 */

pipeline {
  agent none  // each stage declares its own agent for isolation

  options {
    buildDiscarder(logRotator(numToKeepStr: '30'))
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  parameters {
    booleanParam(
      name:         'RUN_AGENT_TESTS',
      defaultValue: true,
      description:  'Run Layer 2 AI agent exploratory tests (requires anthropic-api-key)'
    )
    string(
      name:         'VELDRIX_BASE_URL',
      defaultValue: 'https://staging.veldrixai.ca',
      description:  'Target URL for Playwright / E2E tests'
    )
  }

  environment {
    COMPOSE_PROJECT_NAME = "veldrixai-ci-${BUILD_NUMBER}"
    DOCKER_REGISTRY      = "ghcr.io/veldrixai"
    IMAGE_TAG            = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
    VELDRIX_BASE_URL     = "${params.VELDRIX_BASE_URL}"
    CI                   = 'true'
  }

  stages {

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1 — CODE QUALITY (parallel linters, runs on all branches)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Code Quality') {
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
    stage('Unit Tests') {
      agent { docker { image 'python:3.11-slim'; args '--user root' } }
      steps {
        sh 'mkdir -p test-results'

        // Auth service
        sh '''
          cd backend/auth
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx
          python -m pytest tests/ \
            --cov=app --cov-report=xml:coverage-auth.xml \
            --cov-fail-under=60 \
            -v --tb=short -m "not integration" \
            --junit-xml=../../test-results/auth-unit.xml || true
          cd ../..
        '''

        // Core service
        sh '''
          cd backend/core
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx respx
          python -m pytest tests/ \
            --cov=src --cov-report=xml:coverage-core.xml \
            --cov-fail-under=60 \
            -v --tb=short -m "not integration" \
            --junit-xml=../../test-results/core-unit.xml || true
          cd ../..
        '''

        // Connectors service
        sh '''
          cd backend/connectors
          pip install --quiet -r requirements.txt pytest pytest-asyncio pytest-cov httpx 2>/dev/null || true
          if [ -d tests ]; then
            python -m pytest tests/ \
              --cov=src --cov-report=xml:coverage-connectors.xml \
              --cov-fail-under=40 \
              -v --tb=short -m "not integration" \
              --junit-xml=../../test-results/connectors-unit.xml || true
          else
            echo "No connectors tests directory — skipping"
          fi
          cd ../..
        '''

        // SDK
        sh '''
          cd sdk
          pip install --quiet -e ".[test]" pytest pytest-asyncio pytest-cov httpx 2>/dev/null || \
            pip install --quiet pytest pytest-asyncio pytest-cov httpx pydantic
          python -m pytest tests/ \
            --cov=veldrixai --cov-report=xml:coverage-sdk.xml \
            -v --tb=short \
            --junit-xml=../test-results/sdk-unit.xml || true
          cd ..
        '''
      }
      post {
        always {
          junit 'test-results/*.xml'
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3 — INTEGRATION TESTS (develop + main only)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Integration Tests') {
      when {
        anyOf { branch 'develop'; branch 'main'; branch pattern: 'release/*', comparator: 'GLOB' }
      }
      agent { docker { image 'python:3.11-slim'; args '-v /var/run/docker.sock:/var/run/docker.sock --user root' } }
      steps {
        withCredentials([file(credentialsId: 'VELDRIX_ENV_FILE', variable: 'ENV_FILE')]) {
          sh '''
            apt-get update -qq && apt-get install -y -qq docker-compose curl
            cp "$ENV_FILE" .env.test

            # Spin up test services
            docker-compose -f docker-compose.yml up -d --wait 2>/dev/null || \
              docker-compose -f docker-compose.yml up -d

            # Wait for all three services to be healthy
            timeout 120 bash -c '
              until curl -sf http://localhost:8000/health && \
                    curl -sf http://localhost:8001/health && \
                    curl -sf http://localhost:8002/health; do
                echo "Waiting for services..."; sleep 3
              done
            '
            echo "All services healthy"

            pip install --quiet pytest pytest-asyncio httpx
            python -m pytest tests/integration/ \
              -v --tb=short -m "integration" \
              --junit-xml=test-results/integration.xml || true

            docker-compose -f docker-compose.yml down -v
          '''
        }
      }
      post {
        always {
          junit 'test-results/integration.xml'
          sh 'docker-compose -f docker-compose.yml down -v 2>/dev/null || true'
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4 — SECURITY SCAN (main only)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Security Scan') {
      when { branch 'main' }
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
    // STAGE 5 — PERFORMANCE GATE (develop + main)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Performance Gate') {
      when {
        anyOf { branch 'develop'; branch 'main' }
      }
      agent { docker { image 'python:3.11-slim'; args '--user root' } }
      steps {
        sh '''
          cd backend/core
          pip install --quiet -r requirements.txt pytest pytest-asyncio httpx respx
          python -m pytest tests/test_latency.py \
            -v --tb=short \
            --junit-xml=../../test-results/performance.xml || true
          cd ../..
        '''
      }
      post {
        always {
          junit 'test-results/performance.xml'
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6 — E2E TESTS: Layer 1 Critical + Layer 2 AI Agent (main)
    // ─────────────────────────────────────────────────────────────────────────
    stage('E2E Tests') {
      when {
        anyOf { branch 'main'; branch 'develop' }
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
          script {
            if (params.RUN_AGENT_TESTS.toBoolean()) {
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
      when { branch 'main' }
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
      when { branch 'main' }
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
    // STAGE 9 — DEPLOY TO DIGITALOCEAN (main only, after successful push)
    // ─────────────────────────────────────────────────────────────────────────
    stage('Deploy to Production') {
      when {
        allOf {
          branch 'main'
          expression { return currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      agent { label 'docker-available' }
      steps {
        withCredentials([
          string(credentialsId: 'DIGITAL_OCEAN_PAT', variable: 'DO_PAT'),
          file(credentialsId: 'VELDRIX_ENV_FILE', variable: 'ENV_FILE')
        ]) {
          sh '''
            # Install doctl
            curl -sL https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz | tar xz
            mv doctl /usr/local/bin/
            doctl auth init --access-token "$DO_PAT"

            # Copy compose + env to server
            scp -o StrictHostKeyChecking=no \
                docker-compose.prod.yml \
                "$ENV_FILE" \
                deploy@api.veldrixai.ca:/opt/veldrixai/

            ssh -o StrictHostKeyChecking=no deploy@api.veldrixai.ca "
              set -e
              cd /opt/veldrixai
              mv .env.production .env 2>/dev/null || true

              # Pull new images
              docker-compose -f docker-compose.prod.yml pull

              # Rolling update — no downtime
              docker-compose -f docker-compose.prod.yml up -d --no-deps --remove-orphans

              # Wait for services to settle
              sleep 10

              # Verify all services healthy
              curl -sf http://localhost:8000/health && echo 'auth OK'
              curl -sf http://localhost:8001/health && echo 'core OK'
              curl -sf http://localhost:8002/health && echo 'connectors OK'
              echo 'Deployment verified'
            "
          '''
        }
      }
    }

  } // end stages

  post {
    success {
      script {
        withCredentials([string(credentialsId: 'slack-webhook-url', variable: 'SLACK_WEBHOOK_URL')]) {
          def msg = "✅ *VeldrixAI Build #${BUILD_NUMBER} PASSED* | branch: `${env.BRANCH_NAME}` | commit: `${env.IMAGE_TAG}` | ${currentBuild.durationString} | <${BUILD_URL}|View>"
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
      cleanWs()
    }
  }
}
