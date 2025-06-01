const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const winston = require("winston");
const path = require("path");
const fs = require("fs");
const amqp = require("amqplib");

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/crawler";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = "crawl_jobs";

// Logger setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(cors());
app.use(express.json());

// RabbitMQ setup
let rabbitChannel = null;

async function connectRabbitMQ() {
  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await conn.createChannel();
    await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });
    logger.info("Connected to RabbitMQ");
  } catch (err) {
    logger.error("RabbitMQ connection error:", err);
  }
}

// Call this before starting the server
connectRabbitMQ();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Mongoose schema and model for crawl jobs
const crawlJobSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "error"],
      default: "pending",
    },
    resultZipPath: { type: String },
  },
  { timestamps: true }
);

const CrawlJob = mongoose.model("CrawlJob", crawlJobSchema);

// POST /crawl - Submit a new URL to crawl
app.post("/crawl", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  try {
    // Check for duplicate
    let job = await CrawlJob.findOne({ url });
    if (job) {
      return res.status(409).json({ error: "URL already submitted", job });
    }
    job = await CrawlJob.create({ url });
    // Publish to RabbitMQ
    if (rabbitChannel) {
      rabbitChannel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify({ id: job._id, url: job.url })),
        { persistent: true }
      );
      logger.info(`Job ${job._id} published to queue`);
    } else {
      logger.error("RabbitMQ channel not available. Job not queued.");
    }
    return res.status(201).json({ message: "Crawl job created", job });
  } catch (err) {
    logger.error("Error creating crawl job:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /status - List all crawl jobs
app.get("/status", async (req, res) => {
  try {
    const jobs = await CrawlJob.find().sort({ createdAt: -1 });
    return res.json(jobs);
  } catch (err) {
    logger.error("Error fetching crawl jobs:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /download/:id - Download the zipped crawl result
app.get("/download/:id", async (req, res) => {
  try {
    const job = await CrawlJob.findById(req.params.id);
    if (!job || !job.resultZipPath) {
      return res.status(404).json({ error: "Result not found" });
    }
    const zipPath = path.resolve(job.resultZipPath);
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.download(zipPath);
  } catch (err) {
    logger.error("Error downloading file:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// MongoDB connection
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    logger.info("Connected to MongoDB");
    app.listen(PORT, () => {
      logger.info(`API server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error("MongoDB connection error:", err);
    process.exit(1);
  });
