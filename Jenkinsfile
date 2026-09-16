```groovy
pipeline {
    agent any

    environment {
        AWS_REGION = 'ap-south-1'

        ECR_REGISTRY = '268140506627.dkr.ecr.ap-south-1.amazonaws.com'
        BACKEND_REPO = 'mern-cicd-dev-backend'
        FRONTEND_REPO = 'mern-cicd-dev-frontend'

        EKS_CLUSTER = 'mern-cicd-dev'

        NAMESPACE = 'wanderlust'
        HELM_RELEASE = 'wanderlust'
        HELM_CHART = './helm/wanderlust'

        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Backend Tests') {
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
            steps {
                dir('frontend') {
                    sh '''
                        npm ci
                        npm run lint
                        npm run build
                    '''
                }
            }
        }

        stage('Build Backend Image') {
            steps {
                sh '''
                    docker build \
                        -t ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG} \
                        ./backend
                '''
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh '''
                    docker build \
                        -t ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG} \
                        ./frontend
                '''
            }
        }

        stage('Login to ECR') {
            steps {
                sh '''
                    aws ecr get-login-password \
                        --region ${AWS_REGION} |
                    docker login \
                        --username AWS \
                        --password-stdin ${ECR_REGISTRY}
                '''
            }
        }

        stage('Push Images to ECR') {
            steps {
                sh '''
                    docker push \
                        ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}

                    docker push \
                        ${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}
                '''
            }
        }

        stage('Validate Helm') {
            steps {
                sh '''
                    helm lint ${HELM_CHART}

                    helm template ${HELM_RELEASE} ${HELM_CHART} \
                        --namespace ${NAMESPACE} \
                        --set backend.image.tag=${IMAGE_TAG} \
                        --set frontend.image.tag=${IMAGE_TAG} \
                        > /tmp/wanderlust-rendered.yaml
                '''
            }
        }

        stage('Configure EKS Access') {
            steps {
                sh '''
                    aws eks update-kubeconfig \
                        --region ${AWS_REGION} \
                        --name ${EKS_CLUSTER}
                '''
            }
        }

        stage('Deploy with Helm') {
            steps {
                sh '''
                    helm upgrade --install ${HELM_RELEASE} ${HELM_CHART} \
                        --namespace ${NAMESPACE} \
                        --create-namespace \
                        --set backend.image.tag=${IMAGE_TAG} \
                        --set frontend.image.tag=${IMAGE_TAG} \
                        --wait \
```

