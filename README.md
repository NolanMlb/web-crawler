# Web Crawler Project

A distributed web crawler system built with Node.js, MongoDB, RabbitMQ, and Kubernetes.

## Architecture

The system consists of several components:

- **Frontend**: React application for managing crawl jobs
- **API**: Express.js service handling job management and results
- **Workers**: Node.js services that perform the actual crawling
- **MongoDB**: Database for storing crawl jobs and results
- **RabbitMQ**: Message queue for job distribution
- **Elasticsearch & Kibana**: Logging and monitoring system

## Prerequisites

- Docker
- Kubernetes (minikube or other cluster)
- Node.js 18+
- npm or yarn

## Setup

1. Start your Kubernetes cluster:

```bash
minikube start
```

2. Build and load Docker images:

```bash
# Build images
docker build -t frontend:latest frontend/
docker build -t api:latest api/
docker build -t worker:latest worker/

# Load images into minikube
minikube image load frontend:latest
minikube image load api:latest
minikube image load worker:latest
```

3. Deploy the application:

```bash
kubectl apply -f k8s/
```

4. Access the application:

```bash
# Get the frontend URL
minikube service frontend --url

# Get the API URL
minikube service api --url
```

5. Port Forwarding (for local development):

```bash
# Forward Kibana port
kubectl port-forward service/kibana 5601:5601

# Forward Elasticsearch port
kubectl port-forward service/elasticsearch 9200:9200

# Forward MongoDB port (if needed)
kubectl port-forward service/mongodb 27017:27017

# Forward RabbitMQ management port (if needed)
kubectl port-forward service/rabbitmq 15672:15672
```

Note: Keep these port-forwarding sessions running in separate terminals while working with the services.

## Components

### Frontend

- React application
- Manages crawl jobs
- Views crawl results
- Monitors worker status

### API

- Express.js service
- RESTful endpoints for job management
- MongoDB integration
- RabbitMQ integration

### Worker

- Node.js service
- Processes crawl jobs from RabbitMQ
- Implements crawling logic
- Sends results to API
- Logs to Elasticsearch

### MongoDB

- Stores crawl jobs and results
- Collections:
  - jobs
  - results

### RabbitMQ

- Message queue for job distribution
- Queues:
  - crawl-jobs
  - crawl-results

### Elasticsearch & Kibana

- Centralized logging system
- Index pattern: `worker-logs-*`
- Fields:
  - timestamp
  - level
  - message
  - jobId
  - url
  - status
  - service

## Monitoring

### Logs

Access Kibana at `http://localhost:5601` to view logs:

1. Go to "Stack Management" > "Index Patterns"
2. Create index pattern `worker-logs-*`
3. Select `timestamp` as the time field
4. View logs in "Discover" section

### Metrics

- Worker status in frontend dashboard
- Job progress tracking
- Error monitoring in Kibana

## Development

### Local Development

1. Install dependencies:

```bash
cd frontend && npm install
cd ../api && npm install
cd ../worker && npm install
```

2. Start services:

```bash
# Frontend
cd frontend && npm start

# API
cd api && npm start

# Worker
cd worker && npm start
```

### Environment Variables

#### API

- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `PORT`: API port (default: 3001)

#### Worker

- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `ELASTICSEARCH_URL`: Elasticsearch connection string (default: http://elasticsearch.elastic.svc.cluster.local:9200)

## Troubleshooting

### Common Issues

1. **Worker not processing jobs**

   - Check RabbitMQ connection
   - Verify worker logs in Kibana
   - Check MongoDB connection

2. **No logs in Kibana**

   - Verify Elasticsearch connection
   - Check worker deployment
   - Ensure index pattern is created

3. **API connection issues**
   - Verify service URLs
   - Check network policies
   - Verify MongoDB connection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
