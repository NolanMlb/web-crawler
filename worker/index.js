const amqp = require("amqplib");
const mongoose = require("mongoose");
const axios = require("axios");
const cheerio = require("cheerio");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const cluster = require("cluster");
const logger = require("./logger");
const numCPUs = 2; // Exactly 2 crawling processes

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const QUEUE_NAME = "crawl_jobs";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/crawler";

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
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    };
    logger.info(`Starting crawler for ${baseUrl} in directory ${jobDir}`);
  }

  getFilePath(urlObj, isHtml = true) {
    let pathname = urlObj.pathname;

    // Handle trailing slash
    if (pathname.endsWith("/")) {
      pathname = pathname + "index.html";
    }
    // Add .html extension if no extension is present and it's an HTML file
    else if (isHtml && !pathname.includes(".")) {
      pathname = pathname + ".html";
    }

    return path.join(this.jobDir, pathname);
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
          headers: this.headers,
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
          timeout: 10000, // 10 second timeout
        });

        const $ = cheerio.load(response.data);
        const urlObj = new URL(url);
        const filePath = this.getFilePath(urlObj);

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
        logger.error(`Error crawling ${url}:`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          headers: error.response?.headers,
        });
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
          headers: this.headers,
          responseType: "arraybuffer",
          maxRedirects: 5,
          validateStatus: (status) => status < 400,
          timeout: 10000, // 10 second timeout
        });

        const urlObj = new URL(resourceUrl);
        const filePath = this.getFilePath(urlObj, false);

        logger.info(`Saving resource to: ${filePath}`);
        // Ensure directory exists
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        // Save the resource
        fs.writeFileSync(filePath, response.data);
        logger.info(`Successfully saved resource: ${resourceUrl}`);
      } catch (error) {
        logger.error(`Error downloading resource ${resourceUrl}:`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
        });
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
  logger.info(`Worker ${process.pid} connected to MongoDB`);

  const conn = await amqp.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  try {
    // Try to create queue with our desired settings
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        "x-message-ttl": 3600000, // Messages expire after 1 hour
        "x-max-length": 1000, // Maximum queue size
      },
    });
    logger.info(
      `Worker ${process.pid} connected to RabbitMQ queue ${QUEUE_NAME}`
    );
  } catch (error) {
    logger.error(`Worker ${process.pid} error setting up queue:`, error);
    // Don't exit, try to use existing queue
    try {
      await channel.checkQueue(QUEUE_NAME);
      logger.info(`Worker ${process.pid} using existing queue ${QUEUE_NAME}`);
    } catch (err) {
      logger.error(
        `Worker ${process.pid} fatal error: queue ${QUEUE_NAME} not available`
      );
      process.exit(1);
    }
  }

  // Set prefetch count to 1 to ensure fair distribution between workers
  await channel.prefetch(1);

  logger.info(`Worker ${process.pid} waiting for jobs...`);

  channel.consume(
    QUEUE_NAME,
    async (msg) => {
      if (msg !== null) {
        logger.info(
          `Worker ${
            process.pid
          } received raw message: ${msg.content.toString()}`
        );
        const jobData = JSON.parse(msg.content.toString());
        logger.info(
          `Worker ${process.pid} parsed job: ${JSON.stringify(jobData)}`
        );

        try {
          logger.info(
            `Worker ${process.pid} updating job ${jobData.id} status to processing`
          );
          await CrawlJob.findByIdAndUpdate(jobData.id, {
            status: "processing",
          });

          logger.info(
            `Worker ${process.pid} starting crawl for job ${jobData.id}`
          );
          await crawlAndZip(jobData);

          channel.ack(msg);
          logger.info(`Worker ${process.pid} completed job: ${jobData.id}`);
        } catch (error) {
          logger.error(
            `Worker ${process.pid} error processing job ${jobData.id}:`,
            {
              error: error.message,
              stack: error.stack,
            }
          );
          channel.nack(msg, false, false); // Don't requeue on error
          await CrawlJob.findByIdAndUpdate(jobData.id, { status: "error" });
        }
      } else {
        logger.warn(`Worker ${process.pid} received null message`);
      }
    },
    {
      noAck: false, // Explicitly set noAck to false to ensure manual acknowledgment
    }
  );

  // Handle channel errors
  channel.on("error", (err) => {
    logger.error(`Worker ${process.pid} channel error:`, err);
  });

  // Handle connection errors
  conn.on("error", (err) => {
    logger.error(`Worker ${process.pid} connection error:`, err);
  });
}

if (cluster.isMaster) {
  logger.info(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  // Log when a worker starts
  cluster.on("online", (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });
} else {
  // Workers can share any TCP connection
  startWorker().catch((err) => {
    logger.error(`Worker ${process.pid} error:`, err);
    process.exit(1);
  });
}
