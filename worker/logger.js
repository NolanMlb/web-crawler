const winston = require("winston");
const { ElasticsearchTransport } = require("winston-elasticsearch");

// Config Elasticsearch transport
const esTransport = new ElasticsearchTransport({
  level: "info",
  clientOpts: {
    node:
      process.env.ELASTICSEARCH_URL ||
      "http://elasticsearch.elastic.svc.cluster.local:9200",
    maxRetries: 5,
    requestTimeout: 10000,
    sniffOnStart: true,
  },
  indexPrefix: "worker-logs",
  indexSuffixPattern: "YYYY.MM.DD",
  ensureIndexTemplate: true,
  indexTemplate: {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      properties: {
        timestamp: { type: "date" },
        level: { type: "keyword" },
        message: { type: "text" },
        jobId: { type: "keyword" },
        url: { type: "keyword" },
        status: { type: "keyword" },
      },
    },
  },
});

// Create logger
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "worker" },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Elasticsearch transport
    esTransport,
  ],
});

// Handle Elasticsearch transport errors
esTransport.on("error", (error) => {
  console.error("Elasticsearch transport error:", error);
});

// Force index creation on startup
esTransport.on("connected", () => {
  console.log("Connected to Elasticsearch");
  // Send a test log to create the index
  logger.info("Worker started and connected to Elasticsearch", {
    timestamp: new Date().toISOString(),
    level: "info",
    message: "Initial log to create index",
    service: "worker",
  });
});

module.exports = logger;
