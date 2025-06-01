const amqp = require("amqplib");
const mongoose = require("mongoose");
const winston = require("winston");
const axios = require("axios");
const cheerio = require("cheerio");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = "crawl_jobs";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/crawler";

// Logger setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Mongoose schema and model
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

class Crawler {
  constructor(baseUrl, jobDir) {
    this.baseUrl = new URL(baseUrl);
    this.jobDir = jobDir;
    this.visitedUrls = new Set();
    this.resourceUrls = new Set();
    this.pendingUrls = new Set([baseUrl]);
    logger.info(`Starting crawler for ${baseUrl} in directory ${jobDir}`);
  }

  async crawl() {
    logger.info(`Starting crawl with ${this.pendingUrls.size} URLs to process`);
    while (this.pendingUrls.size > 0) {
      const url = Array.from(this.pendingUrls)[0];
      this.pendingUrls.delete(url);

      if (this.visitedUrls.has(url)) {
        logger.info(`Skipping already visited URL: ${url}`);
        continue;
      }
      this.visitedUrls.add(url);
      logger.info(`Processing URL: ${url}`);

      try {
        const response = await axios.get(url, {
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });

        const $ = cheerio.load(response.data);
        const urlObj = new URL(url);
        const relativePath =
          urlObj.pathname === "/" ? "/index.html" : urlObj.pathname;
        const filePath = path.join(this.jobDir, relativePath);

        logger.info(`Saving HTML to: ${filePath}`);
        // Ensure directory exists
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        // Save the HTML
        fs.writeFileSync(filePath, response.data);
        logger.info(`Successfully saved HTML for ${url}`);

        // Extract and process resources
        await this.processResources($, urlObj);

        // Extract and queue new URLs
        this.extractLinks($, urlObj);
        logger.info(`Current pending URLs: ${this.pendingUrls.size}`);
      } catch (error) {
        logger.error(`Error crawling ${url}:`, error.message);
      }
    }
    logger.info(
      `Crawl completed. Visited ${this.visitedUrls.size} URLs, processed ${this.resourceUrls.size} resources`
    );
  }

  async processResources($, baseUrl) {
    logger.info(`Processing resources for ${baseUrl.href}`);
    const resourceSelectors = {
      "img[src]": "src",
      'link[rel="stylesheet"]': "href",
      "script[src]": "src",
      'link[rel="icon"]': "href",
      'link[rel="shortcut icon"]': "href",
      'link[rel="apple-touch-icon"]': "href",
      "video[src]": "src",
      "audio[src]": "src",
      "source[src]": "src",
      "embed[src]": "src",
      "object[data]": "data",
    };

    for (const [selector, attr] of Object.entries(resourceSelectors)) {
      $(selector).each((_, el) => {
        const resourceUrl = $(el).attr(attr);
        if (resourceUrl && !resourceUrl.startsWith("data:")) {
          const resolvedUrl = this.resolveUrl(resourceUrl, baseUrl);
          if (resolvedUrl) {
            this.resourceUrls.add(resolvedUrl);
            logger.info(`Found resource: ${resolvedUrl}`);
          }
        }
      });
    }

    // Process all collected resources
    for (const resourceUrl of this.resourceUrls) {
      if (this.visitedUrls.has(resourceUrl)) {
        logger.info(`Skipping already processed resource: ${resourceUrl}`);
        continue;
      }
      this.visitedUrls.add(resourceUrl);
      logger.info(`Downloading resource: ${resourceUrl}`);

      try {
        const response = await axios.get(resourceUrl, {
          responseType: "arraybuffer",
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
        });

        const urlObj = new URL(resourceUrl);
        const relativePath = urlObj.pathname;
        const filePath = path.join(this.jobDir, relativePath);

        logger.info(`Saving resource to: ${filePath}`);
        // Ensure directory exists
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        // Save the resource
        fs.writeFileSync(filePath, response.data);
        logger.info(`Successfully saved resource: ${resourceUrl}`);
      } catch (error) {
        logger.error(
          `Error downloading resource ${resourceUrl}:`,
          error.message
        );
      }
    }
  }

  extractLinks($, baseUrl) {
    let newLinks = 0;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !href.startsWith("#")) {
        const newUrl = this.resolveUrl(href, baseUrl);
        if (this.isValidUrl(newUrl)) {
          this.pendingUrls.add(newUrl);
          newLinks++;
        }
      }
    });
    logger.info(`Found ${newLinks} new links to process`);
  }

  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      logger.warn(`Failed to resolve URL: ${url}`);
      return null;
    }
  }

  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === this.baseUrl.hostname;
    } catch {
      logger.warn(`Invalid URL: ${url}`);
      return false;
    }
  }
}

async function crawlAndZip(job) {
  const jobDir = path.join("/app/results", job.id);
  const zipDir = "/app/results";
  const zipPath = path.join(zipDir, `${job.id}.zip`);

  try {
    logger.info(`Starting job ${job.id} for URL ${job.url}`);
    // Ensure results directory exists
    fs.mkdirSync(jobDir, { recursive: true });
    fs.mkdirSync(zipDir, { recursive: true });
    logger.info(`Created directories: ${jobDir} and ${zipDir}`);

    // Start crawling
    const crawler = new Crawler(job.url, jobDir);
    await crawler.crawl();

    // List files before zipping
    const files = fs.readdirSync(jobDir, { recursive: true });
    logger.info(`Files to be zipped: ${JSON.stringify(files)}`);

    // Zip the directory
    logger.info(`Creating zip file at ${zipPath}`);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        logger.info(
          `Zip file created successfully. Size: ${archive.pointer()} bytes`
        );
        resolve();
      });

      archive.on("error", (err) => {
        logger.error(`Error creating zip: ${err.message}`);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(jobDir, false);
      archive.finalize();
    });

    // Update job status to done
    await CrawlJob.findByIdAndUpdate(job.id, {
      status: "done",
      resultZipPath: zipPath,
    });
    logger.info(`Job ${job.id} completed and zipped at ${zipPath}`);
  } catch (err) {
    logger.error(`Error processing job ${job.id}:`, err);
    await CrawlJob.findByIdAndUpdate(job.id, { status: "error" });
  }
}

async function startWorker() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  logger.info("Worker connected to MongoDB");

  const conn = await amqp.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  logger.info("Worker connected to RabbitMQ, waiting for jobs...");

  channel.consume(QUEUE_NAME, async (msg) => {
    if (msg !== null) {
      const jobData = JSON.parse(msg.content.toString());
      logger.info(`Received job: ${JSON.stringify(jobData)}`);
      // Update job status to 'processing'
      await CrawlJob.findByIdAndUpdate(jobData.id, { status: "processing" });
      await crawlAndZip(jobData);
      channel.ack(msg);
    }
  });
}

startWorker().catch((err) => {
  logger.error("Worker error:", err);
  process.exit(1);
});
