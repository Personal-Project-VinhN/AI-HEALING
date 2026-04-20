/**
 * Jenkins Pipeline for AI-Driven Self-Healing Test Automation.
 *
 * Pipeline stages:
 * 1. Install - dependencies for both main-app and automation-test
 * 2. Start App - launch main-app dev server
 * 3. Run Tests - execute Playwright tests (expect failures)
 * 4. Self-Healing - auto-detect and fix broken locators
 * 5. Verify - rerun tests to confirm fixes
 * 6. Publish Reports - archive healing reports and artifacts
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

pipeline {
    agent any

    environment {
        NODE_VERSION = '18'
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

        stage('Self-Healing Flow') {
            steps {
                echo '=== Running Self-Healing Automation ==='
                echo 'Flow: Start App → Run Tests → Fail → Collect → Fix → Verify → Report'
                dir('automation-test') {
                    script {
                        def result = sh(
                            script: 'npm run heal 2>&1',
                            returnStatus: true
                        )
                        env.HEAL_RESULT = result == 0 ? 'PASS' : 'FAIL'
                        echo "Healing result: ${env.HEAL_RESULT}"
                    }
                }
            }
        }

        stage('Publish Reports') {
            steps {
                echo '=== Publishing healing reports ==='

                dir('automation-test') {
                    archiveArtifacts(
                        artifacts: 'healing-reports/**/*',
                        allowEmptyArchive: true
                    )

                    archiveArtifacts(
                        artifacts: 'healing-context/**/*',
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
            echo "Healing result: ${env.HEAL_RESULT ?: 'N/A'}"
        }

        success {
            echo 'Pipeline completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check healing reports for details.'
        }

        cleanup {
            cleanWs()
        }
    }
}
