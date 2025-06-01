# Worker Service

The worker service is responsible for processing crawl jobs from RabbitMQ and performing the actual web crawling operations.

## Features

- Processes crawl jobs from RabbitMQ queue
- Implements web crawling logic
- Sends results back to API
- Logs operations to Elasticsearch
- Handles errors and retries
- Supports concurrent crawling

## Configuration

### Environment Variables

- `MONGO_URI`: MongoDB connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `ELASTICSEARCH_URL`: Elasticsearch connection string (default: http://elasticsearch.elastic.svc.cluster.local:9200)

### Logging

The worker uses Winston for logging with two transports:

1. Console transport for development
2. Elasticsearch transport for production

Log fields:

- `timestamp`: When the log was created
- `level`: Log level (info, error, etc.)
- `message`: Log message
- `jobId`: Associated crawl job ID
- `url`: URL being crawled
- `status`: Crawl status
- `service`: Service name (worker)

## Development

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
docker build -t worker:latest .
```

## Kubernetes

The worker is deployed as a Kubernetes deployment with:

- Multiple replicas for scalability
- Resource limits and requests
- Health checks
- Volume mounts for results

### Deployment

```bash
kubectl apply -f k8s/worker-deployment.yaml
```

### Scaling

Scale the worker:

```bash
kubectl scale deployment worker --replicas=3
```

## Monitoring

### Accessing Services

To access the monitoring services locally, you'll need to set up port forwarding:

```bash
# Forward Kibana port for log viewing
kubectl port-forward service/kibana 5601:5601

# Forward Elasticsearch port for direct log access
kubectl port-forward service/elasticsearch 9200:9200
```

Keep these port-forwarding sessions running in separate terminals while working with the logs.

### Logs

View logs in Kibana:

1. Go to "Stack Management" > "Index Patterns"
2. Create index pattern `worker-logs-*`
3. Select `timestamp` as the time field
4. View logs in "Discover" section

### Metrics

- Job processing rate
- Error rate
- Response times
- Queue length

## Troubleshooting

### Common Issues

1. **No logs in Elasticsearch**

   - Check Elasticsearch connection
   - Verify index pattern exists
   - Check worker logs for connection errors

2. **Jobs not processing**

   - Check RabbitMQ connection
   - Verify queue exists
   - Check worker logs

3. **High error rate**
   - Check target website availability
   - Verify rate limiting settings
   - Check network connectivity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
