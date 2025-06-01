# API Service

The API service provides RESTful endpoints for managing crawl jobs and retrieving results.

## Features

- Job management (create, read, update, delete)
- Result retrieval
- RabbitMQ integration for job distribution
- MongoDB integration for data storage
- Health monitoring

## API Endpoints

### Jobs

- `POST /api/jobs`

  - Create a new crawl job
  - Body: `{ "url": "https://example.com", "maxPages": 100 }`

- `GET /api/jobs`

  - List all jobs
  - Query params: `status`, `page`, `limit`

- `GET /api/jobs/:id`

  - Get job details
  - Returns job status and metadata

- `DELETE /api/jobs/:id`
  - Cancel a job
  - Returns success message

### Results

- `GET /api/results/:jobId`

  - Get crawl results for a job
  - Query params: `page`, `limit`

- `GET /api/results/:jobId/stats`
  - Get crawl statistics
  - Returns summary of crawl results

## Configuration

### Environment Variables

- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `PORT`: API port (default: 3001)

### MongoDB Collections

- `jobs`: Stores job metadata and status
- `results`: Stores crawl results

### RabbitMQ Queues

- `crawl-jobs`: Queue for new crawl jobs
- `crawl-results`: Queue for crawl results

## Development

### Local Access

To access the API and its dependencies locally:

```bash
# Forward API port
kubectl port-forward service/api 3001:3001

# Forward MongoDB port (if needed)
kubectl port-forward service/mongodb 27017:27017

# Forward RabbitMQ management port (if needed)
kubectl port-forward service/rabbitmq 15672:15672
```

Keep these port-forwarding sessions running in separate terminals while developing.

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the service:

   ```bash
   npm start
   ```

### Testing

Run tests:

```bash
npm test
```

## Docker

Build the image:

```bash
docker build -t api:latest .
```

## Kubernetes

The API is deployed as a Kubernetes service with:

- Load balancing
- Health checks
- Resource limits
- Service discovery

### Deployment

```bash
kubectl apply -f k8s/api-deployment.yaml
```

## Monitoring

### Health Check

- Endpoint: `GET /health`
- Returns service status
- Used by Kubernetes for liveness probe

### Metrics

- Request rate
- Response times
- Error rate
- Queue length

## Troubleshooting

### Common Issues

1. **MongoDB Connection Issues**

   - Check connection string
   - Verify network policies
   - Check MongoDB logs

2. **RabbitMQ Connection Issues**

   - Check connection string
   - Verify queue exists
   - Check RabbitMQ logs

3. **High Latency**
   - Check MongoDB performance
   - Verify resource limits
   - Check network latency

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
