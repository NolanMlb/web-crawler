# Frontend Application

A React-based web interface for managing and monitoring web crawler jobs.

## Features

- Create and manage crawl jobs
- View crawl results and statistics
- Monitor worker status
- Real-time job progress updates
- Responsive design

## Components

### Job Management

- Job creation form
- Job list with filtering
- Job details view
- Job cancellation

### Results View

- Results table with pagination
- Results filtering
- Export functionality
- Statistics dashboard

### Monitoring

- Worker status indicators
- Job progress bars
- Error notifications
- System health status

## Configuration

### Environment Variables

- `REACT_APP_API_URL`: API service URL
- `REACT_APP_WS_URL`: WebSocket URL for real-time updates

### API Integration

The frontend communicates with the API service for:

- Job management
- Result retrieval
- Worker status
- System metrics

## Development

### Setup

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm start
```

### Testing

Run tests:

```bash
npm test
```

### Building

Build for production:

```bash
npm run build
```

## Docker

Build the image:

```bash
docker build -t frontend:latest .
```

## Kubernetes

The frontend is deployed as a Kubernetes service with:

- Load balancing
- SSL termination
- Resource limits
- Health checks

### Deployment

```bash
kubectl apply -f k8s/frontend-deployment.yaml
```

## User Interface

### Pages

1. **Dashboard**

   - System overview
   - Active jobs
   - Worker status
   - Recent results

2. **Jobs**

   - Job creation
   - Job list
   - Job details
   - Job management

3. **Results**

   - Results browser
   - Statistics
   - Export options
   - Filtering

4. **Settings**
   - System configuration
   - User preferences
   - API settings

## Monitoring

### Metrics

- Page load times
- API response times
- Error rates
- User interactions

### Error Handling

- API error display
- Network error recovery
- User feedback
- Error logging

## Troubleshooting

### Common Issues

1. **API Connection Issues**

   - Check API URL configuration
   - Verify network connectivity
   - Check CORS settings

2. **Real-time Updates Not Working**

   - Check WebSocket connection
   - Verify worker status
   - Check browser console

3. **Performance Issues**
   - Check resource limits
   - Verify caching
   - Monitor API response times

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
