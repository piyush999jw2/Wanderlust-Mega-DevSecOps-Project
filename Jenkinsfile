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
                dir('backend') {
                    sh '''
                        npm ci
                        npm test -- --runInBand
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
                        --timeout 10m
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    kubectl rollout status \
                        deployment/wanderlust-backend \
                        -n ${NAMESPACE} \
                        --timeout=5m

                    kubectl rollout status \
                        deployment/wanderlust-frontend \
                        -n ${NAMESPACE} \
                        --timeout=5m

                    echo "===== PODS ====="
                    kubectl get pods -n ${NAMESPACE}

                    echo "===== SERVICES ====="
                    kubectl get svc -n ${NAMESPACE}
                '''
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
            echo "========================================"
            echo "CI/CD PIPELINE SUCCESS"
            echo "========================================"
            echo "Backend:"
            echo "${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}"
            echo ""
            echo "Frontend:"
            echo "${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}"
            echo ""
            echo "Helm Release: ${HELM_RELEASE}"
            echo "Namespace: ${NAMESPACE}"
            echo "========================================"
        }

        failure {
            echo "========================================"
            echo "CI/CD PIPELINE FAILED"
            echo "========================================"
        }
    }
}
