pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        timestamps()
        // Keep only last 20 builds to save disk space
        buildDiscarder(logRotator(numToKeepStr: '20'))
        // Prevent multiple builds of the same pipeline running simultaneously
        disableConcurrentBuilds()
    }

    triggers {
        // H spreads Jenkins load — effectively polls every 2 minutes
        // Each job gets a consistent random offset within the window
        pollSCM('H/2 * * * *')
    }

    environment {
        PATH         = "/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        PNPM_HOME    = "${HOME}/.pnpm-global"

        // AWS & ECR
        ECR_REGISTRY = "920372991367.dkr.ecr.ap-south-1.amazonaws.com"
        ECR_REPO     = "task-manager"
        AWS_REGION   = "ap-south-1"
        EC2_USER     = "ubuntu"

        // Path prefix this pipeline cares about
        WATCH_PATH   = "backend/"
    }

    stages {

        stage('Checkout') {
            steps {
                script {
                    def rawBranch = env.BRANCH_NAME ?: env.GIT_BRANCH
                    if (!rawBranch && scm && scm.branches && !scm.branches.isEmpty()) {
                        rawBranch = scm.branches[0].name
                    }
                    if (!rawBranch) {
                        error("No branch specified! Please ensure the branch is configured in Jenkins.")
                    }
                    env.TARGET_BRANCH = rawBranch.replace('origin/', '').replace('*/', '')
                }
                echo "🚚 Checking out branch: ${env.TARGET_BRANCH}..."

                retry(3) {
                    sh '''
                    set -eux

                    BRANCH="$TARGET_BRANCH"
                    REPO_URL="git@github.com:gupio-inhouse/Gupio-GrowthRhythm-OS.git"

                    export GIT_SSH_COMMAND="ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -o TCPKeepAlive=yes"

                    if [ ! -d .git ]; then
                      git init .
                    fi

                    if git remote get-url origin > /dev/null 2>&1; then
                      git remote set-url origin "$REPO_URL"
                    else
                      git remote add origin "$REPO_URL"
                    fi

                    # depth 2 required so we can diff HEAD~1 vs HEAD
                    git fetch --depth 2 origin "refs/heads/$BRANCH"
                    git checkout -B "$BRANCH" FETCH_HEAD
                    git reset --hard FETCH_HEAD
                    git clean -fd
                    '''
                }

                sh '''
                echo "📌 Branch : $(git rev-parse --abbrev-ref HEAD)"
                echo "📌 Commit : $(git rev-parse HEAD)"
                git log -1 --oneline
                '''
            }
        }

        stage('Detect Changes') {
            steps {
                script {
                    // Get files changed in this commit vs its parent
                    def changedFiles = sh(
                        script: '''
                            if git rev-parse HEAD~1 > /dev/null 2>&1; then
                                git diff --name-only HEAD~1 HEAD
                            else
                                # First commit — treat everything as changed
                                git show --name-only --format="" HEAD
                            fi
                        ''',
                        returnStdout: true
                    ).trim()

                    echo "📂 Changed files in this commit:\n${changedFiles}"

                    // Trigger full run if backend/ OR the backend Jenkinsfile itself changed
                    def lines = changedFiles ? changedFiles.split('\n') : []
                    def relevant = lines.any { f ->
                        f.startsWith('backend/') || f == 'Jenkinsfile'
                    }

                    if (relevant) {
                        env.BACKEND_CHANGED = 'true'
                        currentBuild.description = "🚀 backend/ changes — deploying"
                        echo "✅ Relevant changes detected — pipeline will run."
                    } else {
                        env.BACKEND_CHANGED = 'false'
                        currentBuild.description = "⏭️ No backend changes — skipped"
                        echo "⏭️ No backend changes detected — all build stages will be skipped."
                    }
                }
            }
        }

        stage('Generate Image Tag') {
            when {
                expression { env.BACKEND_CHANGED == 'true' }
            }
            steps {
                script {
                    def today = new Date().format('yyyy-MM-dd')
                    def counterDir = "${HOME}/.jenkins/task-manager-counter"
                    def counterFile = "${counterDir}/${today}.txt"

                    sh "mkdir -p ${counterDir}"

                    def countStr = sh(script: "cat ${counterFile} 2>/dev/null || echo 0", returnStdout: true).trim()
                    def currentCount = (countStr.isInteger() ? countStr.toInteger() : 0) + 1

                    sh "echo ${currentCount} > ${counterFile}"

                    env.IMAGE_TAG = "${today}.v${currentCount}"

                    echo "======================================"
                    echo "🚀 Generated IMAGE_TAG: ${env.IMAGE_TAG}"
                    echo "======================================"
                }
            }
        }

        stage('Build & Push to ECR') {
            when {
                expression { env.BACKEND_CHANGED == 'true' }
            }
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-creds',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh '''
                    set -eux

                    echo "🐳 Logging into Amazon ECR..."
                    aws ecr get-login-password --region $AWS_REGION \
                    | docker login --username AWS --password-stdin $ECR_REGISTRY

                    echo "🏗️ Building and pushing Docker image: $IMAGE_TAG"
                    docker buildx build \
                        --platform linux/amd64 \
                        --no-cache \
                        -f backend/Dockerfile \
                        -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
                        --push .
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            when {
                expression { env.BACKEND_CHANGED == 'true' }
            }
            steps {
                withCredentials([
                    string(credentialsId: 'growthrhythm-backend-ip', variable: 'EC2_HOST')
                ]) {
                    sshagent(credentials: ['ec2-ssh-key']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} '
                                set -e
                                cd /home/ubuntu
                                chmod +x deploy-taskmanager.sh
                                ./deploy-taskmanager.sh ${IMAGE_TAG}
                            '
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                // Mark as NOT_BUILT (grey) when skipped — keeps build history clean
                if (env.BACKEND_CHANGED == 'false') {
                    currentBuild.result = 'NOT_BUILT'
                }
            }
            echo "📦 Backend pipeline finished. Result: ${currentBuild.result ?: 'SUCCESS'}"
        }
        success {
            script {
                if (env.BACKEND_CHANGED == 'true') {
                    echo "✅ Backend deployed successfully! Image: ${env.IMAGE_TAG}"
                }
            }
        }
        failure {
            echo '❌ Backend pipeline failed! Check the logs above.'
        }
    }
}
