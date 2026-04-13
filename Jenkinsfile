// ============================================================================
// VeldrixAI — Playwright + AI Agent CI/CD Pipeline
// Runs Layer 1 static specs (CI-blocking) then Layer 2 AI agent exploration.
// Only promotes to the production container when all checks pass.
// ============================================================================

pipeline {
  agent {
    docker {
      image 'mcr.microsoft.com/playwright:v1.49.0-jammy'
      args  '--shm-size=2gb --user root'
    }
  }

  options {
    timeout(time: 60, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    ansiColor('xterm')
  }

  parameters {
    booleanParam(
      name:         'RUN_AGENT_TESTS',
      defaultValue: true,
      description:  'Run the Layer 2 AI agent exploratory tests (requires ANTHROPIC_API_KEY)'
    )
    string(
      name:         'VELDRIX_BASE_URL',
      defaultValue: 'https://staging.veldrixai.ca',
      description:  'Target URL for the test run'
    )
  }

  environment {
    // Credentials are stored in Jenkins Credentials Store
    VELDRIX_TEST_EMAIL    = credentials('veldrix-ci-email')
    VELDRIX_TEST_PASSWORD = credentials('veldrix-ci-password')
    ANTHROPIC_API_KEY     = credentials('anthropic-api-key')
    SLACK_WEBHOOK_URL     = credentials('slack-webhook-url')

    VELDRIX_BASE_URL      = "${params.VELDRIX_BASE_URL}"
    VELDRIX_AUTH_API_URL  = "${params.VELDRIX_BASE_URL}".replace('app.', 'api.')
    VELDRIX_CORE_API_URL  = "${params.VELDRIX_BASE_URL}".replace('app.', 'api.')
    CI                    = 'true'
    NODE_ENV              = 'test'

    // Playwright output directories (relative to frontend/)
    PLAYWRIGHT_HTML_REPORT = 'tests/reports/html'
  }

  stages {

    // ── Stage 1: Checkout & Install ─────────────────────────────────────────
    stage('Checkout') {
      steps {
        checkout scm
        echo "Branch: ${env.GIT_BRANCH}  Commit: ${env.GIT_COMMIT}"
      }
    }

    stage('Install Dependencies') {
      steps {
        dir('frontend') {
          sh 'npm ci --prefer-offline'
          sh 'npx playwright install --with-deps chromium firefox webkit'
        }
      }
    }

    // ── Stage 2: Auth Setup ─────────────────────────────────────────────────
    stage('Auth Setup') {
      steps {
        dir('frontend') {
          sh '''
            export VELDRIX_BASE_URL=$VELDRIX_BASE_URL
            npx playwright test --project=setup \
              --config playwright.config.ts 2>&1
          '''
        }
      }
      post {
        failure {
          error 'Auth setup failed — check VELDRIX_TEST_EMAIL/VELDRIX_TEST_PASSWORD credentials'
        }
      }
    }

    // ── Stage 3: Layer 1 — Critical Path (Chrome, CI-blocking) ─────────────
    stage('Layer 1 — Critical Chrome') {
      steps {
        dir('frontend') {
          sh '''
            npx playwright test --project=critical-chrome \
              --config playwright.config.ts \
              --reporter=list,junit,html 2>&1
          '''
        }
      }
      post {
        always {
          junit 'frontend/tests/reports/junit.xml'
          publishHTML(target: [
            allowMissing:         false,
            alwaysLinkToLastBuild: true,
            keepAll:              true,
            reportDir:            'frontend/tests/reports/html',
            reportFiles:          'index.html',
            reportName:           'Playwright Critical (Chrome)',
          ])
        }
        failure {
          script {
            currentBuild.result = 'FAILURE'
            slackSend(
              channel:    '#veldrix-ci',
              color:      'danger',
              message:    "❌ Layer 1 Chrome FAILED — ${env.JOB_NAME} #${env.BUILD_NUMBER}\n${env.BUILD_URL}",
              webhookUrl: env.SLACK_WEBHOOK_URL,
            )
          }
        }
      }
    }

    stage('Layer 1 — Critical Firefox') {
      steps {
        dir('frontend') {
          sh '''
            npx playwright test --project=critical-firefox \
              --config playwright.config.ts \
              --reporter=list 2>&1
          '''
        }
      }
      post {
        failure {
          echo 'Firefox cross-browser check failed — review browser compatibility'
        }
      }
    }

    // ── Stage 4: Layer 2 — AI Agent Exploratory ─────────────────────────────
    stage('Layer 2 — AI Agent Explorer') {
      when {
        expression { return params.RUN_AGENT_TESTS.toBoolean() }
      }
      steps {
        dir('frontend') {
          sh '''
            # Start @playwright/mcp server in background
            npx @playwright/mcp --port 8931 &
            MCP_PID=$!
            sleep 3

            # Run the agent orchestrator
            export PLAYWRIGHT_MCP_URL=http://localhost:8931/sse
            npx tsx tests/agent/veldrix-test-agent.ts
            AGENT_EXIT=$?

            # Stop MCP server
            kill $MCP_PID 2>/dev/null || true

            # Propagate agent exit code
            exit $AGENT_EXIT
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'frontend/tests/reports/agent-*.json,frontend/tests/reports/agent-summary.md',
                           allowEmptyArchive: true
          archiveArtifacts artifacts: 'frontend/tests/screenshots/**/*.png',
                           allowEmptyArchive: true
        }
        failure {
          script {
            // Agent failures are warnings unless hasBlockingFailures is true
            def reportFile = 'frontend/tests/reports/agent-final.json'
            if (fileExists(reportFile)) {
              def report = readJSON file: reportFile
              if (report.hasBlockingFailures) {
                currentBuild.result = 'FAILURE'
                slackSend(
                  channel:    '#veldrix-ci',
                  color:      'danger',
                  message:    "🤖 Agent found BLOCKING failures — ${env.JOB_NAME} #${env.BUILD_NUMBER}\n${env.BUILD_URL}",
                  webhookUrl: env.SLACK_WEBHOOK_URL,
                )
              } else {
                currentBuild.result = 'UNSTABLE'
                slackSend(
                  channel:    '#veldrix-ci',
                  color:      'warning',
                  message:    "⚠️ Agent found non-blocking anomalies — ${env.JOB_NAME} #${env.BUILD_NUMBER}\n${env.BUILD_URL}",
                  webhookUrl: env.SLACK_WEBHOOK_URL,
                )
              }
            }
          }
        }
      }
    }

    // ── Stage 5: Production Promotion ────────────────────────────────────────
    stage('Promote to Production') {
      when {
        allOf {
          branch 'main'
          expression { return currentBuild.result == null || currentBuild.result == 'SUCCESS' }
        }
      }
      steps {
        script {
          echo "All checks passed — ready for production promotion"
          // Add your production deployment step here, e.g.:
          // sh 'docker build -t veldrixai/frontend:${GIT_COMMIT} ./frontend'
          // sh 'docker push veldrixai/frontend:${GIT_COMMIT}'
          // sh './scripts/deploy-prod.sh ${GIT_COMMIT}'
        }
      }
      post {
        success {
          slackSend(
            channel:    '#veldrix-deployments',
            color:      'good',
            message:    "✅ VeldrixAI promoted to production — ${env.GIT_COMMIT[0..7]}\n${env.BUILD_URL}",
            webhookUrl: env.SLACK_WEBHOOK_URL,
          )
        }
      }
    }

  } // end stages

  post {
    always {
      // Publish consolidated Playwright HTML report
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
    success {
      echo "✅ Pipeline complete — all stages passed"
    }
    failure {
      echo "❌ Pipeline failed — check stage logs above"
    }
  }
}
