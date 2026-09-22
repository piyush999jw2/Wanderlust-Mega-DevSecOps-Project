pipeline {
    agent any

    environment {
        AWS_REGION = 'ap-south-1'

        ECR_REGISTRY = '268140506627.dkr.ecr.ap-south-1.amazonaws.com'
        BACKEND_REPO = 'mern-cicd-dev-backend'
        FRONTEND_REPO = 'mern-cicd-dev-frontend'

        NAMESPACE = 'wanderlust'
        HELM_CHART = './helm/wanderlust'

        IMAGE_TAG = "${BUILD_NUMBER}"

        GIT_CREDENTIALS = 'github-credentials'
        GIT_BRANCH = 'main'

        SKIP_PIPELINE = 'false'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check GitOps Commit') {
            steps {
                script {
                    def commitMessage = sh(
                        script: 'git log -1 --pretty=%B',
                        returnStdout: true
                    ).trim()

                    echo "Latest commit: ${commitMessage}"

                    if (commitMessage.contains('[skip ci]')) {
                        echo "GitOps commit detected. Skipping CI to prevent pipeline loop."
                        env.SKIP_PIPELINE = 'true'
                    }
                }
            }
        }

        stage('Backend Tests') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    echo "Starting MongoDB for CI tests..."

                    docker rm -f wanderlust-ci-mongo 2>/dev/null || true

                    docker run -d \
                        --name wanderlust-ci-mongo \
                        -p 27017:27017 \
                        mongo:6.0

                    echo "Waiting for MongoDB..."

                    for i in $(seq 1 30); do
                        if docker exec wanderlust-ci-mongo \
                            mongosh --quiet \
                            --eval 'db.adminCommand({ ping: 1 }).ok' \
                            | grep -q 1; then

                            echo "MongoDB is ready."
                            break
                        fi

                        if [ "$i" -eq 30 ]; then
                            echo "MongoDB failed to become ready."
                            docker logs wanderlust-ci-mongo
                            exit 1
                        fi

                        sleep 2
                    done

                    cd backend

                    npm ci

                    MONGODB_URI="mongodb://127.0.0.1:27017/wanderlust" \
                    npm test -- --runInBand
                '''
            }

            post {
                always {
                    sh '''
                        docker rm -f wanderlust-ci-mongo 2>/dev/null || true
                    '''
                }
            }
        }

        stage('Frontend Validation') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                dir('frontend') {
                    sh '''
                        set -e

                        npm ci
                        npm run lint
                        npm run build
                    '''
                }
            }
        }

        stage('Build Backend Image') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    docker build \
                        -t ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG} \
                        ./backend
                '''
            }
        }

        stage('Build Frontend Image') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    docker build \
                        -t ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG} \
                        ./frontend
                '''
            }
        }

        stage('Validate Helm') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    echo "Running Helm lint..."

                    helm lint ${HELM_CHART}

                    echo "Rendering Helm templates..."

                    helm template wanderlust ${HELM_CHART} \
                        --namespace ${NAMESPACE} \
                        --set backend.image.tag=${IMAGE_TAG} \
                        --set frontend.image.tag=${IMAGE_TAG} \
                        > /tmp/wanderlust-rendered.yaml

                    echo "Helm validation successful."
                '''
            }
        }

        stage('Login to ECR') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    aws ecr get-login-password \
                        --region ${AWS_REGION} |
                    docker login \
                        --username AWS \
                        --password-stdin ${ECR_REGISTRY}
                '''
            }
        }

        stage('Push Images to ECR') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    echo "Pushing backend image..."

                    docker push \
                        ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}

                    echo "Pushing frontend image..."

                    docker push \
                        ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
                '''
            }
        }

        stage('Update GitOps Image Tags') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    echo "Updating Helm image tags..."

                    python3 <<'PY'
from pathlib import Path
import os
import re

path = Path("helm/wanderlust/values.yaml")
image_tag = os.environ["IMAGE_TAG"]

lines = path.read_text().splitlines()

current_section = None
updated_backend = False
updated_frontend = False

for i, line in enumerate(lines):

    # Detect top-level YAML sections
    if re.match(r"^backend:$", line):
        current_section = "backend"

    elif re.match(r"^frontend:$", line):
        current_section = "frontend"

    elif re.match(r"^mongodb:$", line):
        current_section = "mongodb"

    elif re.match(r"^redis:$", line):
        current_section = "redis"

    # Only update the image tag inside backend/frontend sections
    if current_section in ("backend", "frontend"):

        if re.match(r'^    tag:\\s*".*"$', line):

            lines[i] = f'    tag: "{image_tag}"'

            if current_section == "backend":
                updated_backend = True

            elif current_section == "frontend":
                updated_frontend = True

            current_section = None

if not updated_backend:
    raise SystemExit("ERROR: Backend image tag was not found.")

if not updated_frontend:
    raise SystemExit("ERROR: Frontend image tag was not found.")

path.write_text("\\n".join(lines) + "\\n")

print(f"Backend image tag updated to: {image_tag}")
print(f"Frontend image tag updated to: {image_tag}")
PY

                    echo ""
                    echo "===== UPDATED IMAGE TAGS ====="

                    grep -A3 '^backend:' helm/wanderlust/values.yaml
                    echo ""
                    grep -A3 '^frontend:' helm/wanderlust/values.yaml
                '''
            }
        }

        stage('Verify GitOps Changes') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                sh '''
                    set -e

                    echo "===== GIT DIFF ====="

                    git diff -- helm/wanderlust/values.yaml

                    echo ""
                    echo "===== VERIFYING MONGODB TAG ====="

                    grep -A3 '^mongodb:' helm/wanderlust/values.yaml

                    echo ""
                    echo "===== VERIFYING REDIS TAG ====="

                    grep -A3 '^redis:' helm/wanderlust/values.yaml
                '''
            }
        }

        stage('Commit and Push GitOps Changes') {
            when {
                environment name: 'SKIP_PIPELINE', value: 'false'
            }

            steps {
                script {

                    sh '''
                        set -e

                        git config user.name "Jenkins"
                        git config user.email "jenkins@localhost"

                        git add helm/wanderlust/values.yaml

                        if git diff --cached --quiet; then
                            echo "No GitOps changes detected."
                            exit 0
                        fi

                        git commit \
                            -m "chore: update application images to ${IMAGE_TAG} [skip ci]"
                    '''

                    withCredentials([
                        gitUsernamePassword(
                            credentialsId: "${GIT_CREDENTIALS}",
                            gitToolName: 'Default'
                        )
                    ]) {
                        sh '''
                            set -e

                            echo "Pushing GitOps change to GitHub..."

                            git push origin HEAD:${GIT_BRANCH}
                        '''
                    }
                }
            }
        }
    }

    post {

        always {
            sh '''
                docker image prune -f || true
            '''
        }

        success {
            script {
                if (env.SKIP_PIPELINE == 'true') {
                    echo "========================================"
                    echo "GitOps commit detected."
                    echo "CI stages skipped."
                    echo "========================================"
                } else {
                    echo "========================================"
                    echo "CI PIPELINE SUCCESS"
                    echo "========================================"

                    echo "Backend image:"
                    echo "${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}"

                    echo ""

                    echo "Frontend image:"
                    echo "${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}"

                    echo ""

                    echo "GitOps:"
                    echo "Helm values updated and pushed to Git."

                    echo ""

                    echo "Argo CD:"
                    echo "Will detect the Git change and deploy it."

                    echo "========================================"
                }
            }
        }

        failure {
            echo "========================================"
            echo "CI PIPELINE FAILED"
            echo "========================================"
        }
    }
}
