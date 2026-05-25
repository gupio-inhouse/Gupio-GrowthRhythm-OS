pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        timestamps()
    }

    triggers {
        // Fallback: Poll the repository every minute for changessssssss
        pollSCM('* * * * *')
    }

    environment {
        PATH = "/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        PNPM_HOME = "${HOME}/.pnpm-global"

        // AWS & ECR Configuration
        ECR_REGISTRY = "920372991367.dkr.ecr.ap-south-1.amazonaws.com"
        ECR_REPO = "task-manager"
        AWS_REGION = "ap-south-1"
        EC2_USER = "ubuntu"
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
                echo "🚚 Performing shallow branch checkout for branch: ${env.TARGET_BRANCH}..."

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

                    git fetch --depth 1 origin "refs/heads/$BRANCH"
                    git checkout -B "$BRANCH" FETCH_HEAD
                    git reset --hard FETCH_HEAD
                    git clean -fd
                    '''
                }

                sh '''
                echo "📌 Branch: $(git rev-parse --abbrev-ref HEAD)"
                echo "📌 Commit: $(git rev-parse HEAD)"
                git log -1 --oneline
                '''
            }
        }

        stage('Generate Image Tag') {
            steps {
                script {
                    def today = new Date().format('yyyy-MM-dd')
                    def counterDir = "${HOME}/.jenkins/task-manager-counter"
                    def counterFile = "${counterDir}/${today}.txt"
                    
                    sh "mkdir -p ${counterDir}"
                    
                    // Read current count or start atttttttt 0
                    def countStr = sh(script: "cat ${counterFile} 2>/dev/null || echo 0", returnStdout: true).trim()
                    def currentCount = (countStr.isInteger() ? countStr.toInteger() : 0) + 1
                    
                    // Save the new count
                    sh "echo ${currentCount} > ${counterFile}"
                    
                    // Set the tag with 'v' prefix
                    env.IMAGE_TAG = "${today}.v${currentCount}"
                    
                    echo "======================================"
                    echo "🚀 Generated IMAGE_TAG: ${env.IMAGE_TAG}"
                    echo "======================================"
                }
            }
        }

        stage('Build & Push to ECR') {
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
        success {
            echo '✅ Pipeline succeeded!'
        }
        failure {
            echo '❌ Pipeline failed! Check logs.'
        }
        always {
            echo '📦 Pipeline finished.'
        }
    }
}
