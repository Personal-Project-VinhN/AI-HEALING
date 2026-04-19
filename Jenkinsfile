/**
 * Jenkins Pipeline for AI-Driven Self-Healing Test Automation.
 *
 * Pipeline stages:
 * 1. Install - dependencies for both main-app and automation-test
 * 2. Run Tests - execute Playwright tests
 * 3. Detect Failures - check for failing tests
 * 4. Self-Repair - run AI-driven repair loop
 * 5. Rerun Tests - verify repaired tests pass
 * 6. Publish Reports - archive repair reports and artifacts
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

pipeline {
    agent any

    environment {
        NODE_VERSION = '18'
        UI_VERSION = '2'
        OPENAI_API_KEY = credentials('openai-api-key')
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {
        stage('Install Dependencies') {
            steps {
                echo '=== Installing main-app dependencies ==='
                dir('main-app') {
                    sh 'npm ci'
                }

                echo '=== Installing automation-test dependencies ==='
                dir('automation-test') {
                    sh 'npm ci'
                    sh 'npx playwright install chromium --with-deps'
                }
            }
        }

        stage('Run Tests (Initial)') {
            steps {
                echo '=== Running tests on UI V2 ==='
                dir('automation-test') {
                    script {
                        def result = sh(
                            script: 'npx cross-env UI_VERSION=2 npx playwright test tests/self-repair/ --reporter=list 2>&1',
                            returnStatus: true
                        )
                        env.INITIAL_TEST_RESULT = result == 0 ? 'PASS' : 'FAIL'
                        echo "Initial test result: ${env.INITIAL_TEST_RESULT}"
                    }
                }
            }
        }

        stage('Self-Repair (if tests failed)') {
            when {
                expression { env.INITIAL_TEST_RESULT == 'FAIL' }
            }
            steps {
                echo '=== Running Self-Repair Loop ==='
                echo 'The AI-driven repair loop will:'
                echo '  1. Detect which locators failed'
                echo '  2. Collect context (screenshot, DOM, code)'
                echo '  3. Send prompt to LLM for repair suggestion'
                echo '  4. Apply fix and rerun'
                echo '  5. Repeat up to 3 times'

                dir('automation-test') {
                    sh '''
                        npx cross-env UI_VERSION=2 \
                        npx playwright test tests/self-repair/ \
                        --reporter=list \
                        --retries=0 \
                        || true
                    '''
                }
            }
        }

        stage('Rerun Tests (Verification)') {
            when {
                expression { env.INITIAL_TEST_RESULT == 'FAIL' }
            }
            steps {
                echo '=== Verifying repaired tests ==='
                dir('automation-test') {
                    script {
                        def verifyResult = sh(
                            script: 'npx cross-env UI_VERSION=2 npx playwright test tests/self-repair/ --reporter=list 2>&1',
                            returnStatus: true
                        )
                        env.VERIFY_RESULT = verifyResult == 0 ? 'PASS' : 'FAIL'
                        echo "Verification result: ${env.VERIFY_RESULT}"
                    }
                }
            }
        }

        stage('Run Full Demo') {
            when {
                expression { params.RUN_FULL_DEMO == true }
            }
            steps {
                echo '=== Running full demo (all 6 scenarios) ==='
                dir('automation-test') {
                    sh 'node run-demo.js --include-repair || true'
                }
            }
        }

        stage('Publish Reports') {
            steps {
                echo '=== Publishing repair reports ==='

                dir('automation-test') {
                    archiveArtifacts(
                        artifacts: 'repair-reports/**/*',
                        allowEmptyArchive: true
                    )

                    archiveArtifacts(
                        artifacts: 'healed-locators/**/*',
                        allowEmptyArchive: true
                    )

                    archiveArtifacts(
                        artifacts: 'playwright-report/**/*',
                        allowEmptyArchive: true
                    )
                }

                publishHTML(target: [
                    allowMissing: true,
                    alwaysLinkToLastBuild: true,
                    keepAll: true,
                    reportDir: 'automation-test/playwright-report',
                    reportFiles: 'index.html',
                    reportName: 'Playwright Report'
                ])
            }
        }
    }

    post {
        always {
            echo '=== Pipeline Summary ==='
            echo "Initial test: ${env.INITIAL_TEST_RESULT ?: 'N/A'}"
            echo "After repair: ${env.VERIFY_RESULT ?: 'N/A'}"
        }

        success {
            echo 'Pipeline completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check repair reports for details.'
        }

        cleanup {
            cleanWs()
        }
    }

    parameters {
        booleanParam(
            name: 'RUN_FULL_DEMO',
            defaultValue: false,
            description: 'Run the full demo with all 6 scenarios'
        )
        choice(
            name: 'UI_VERSION',
            choices: ['2', '1'],
            description: 'UI version to test against'
        )
    }
}
