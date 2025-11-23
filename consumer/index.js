// const { Kafka } = require('kafkajs');
// const log4js = require('log4js');
// require('dotenv').config();
// const client = require('prom-client');

// // ---------- log4js setup ----------
// log4js.configure({
//   appenders: {
//     out: {
//       type: 'stdout',
//       layout: {
//         type: 'pattern',
//         pattern:
//           '{"timestamp":"%d","level":"%p","category":"%c","message":%m}%n',
//       },
//     },
//   },
//   categories: {
//     default: { appenders: ['out'], level: 'info' },
//   },
// });

// const logger = log4js.getLogger('cdc-consumer');

// // ---------- env config ----------
// const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
// const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'db-changes';
// const CONSUMER_GROUP_ID =
//   process.env.CONSUMER_GROUP_ID || 'cdc-consumer-group';

// const kafka = new Kafka({
//   clientId: 'cdc-consumer',
//   brokers: [KAFKA_BROKER],
// });

// async function startConsumer() {
//   const consumer = kafka.consumer({ groupId: CONSUMER_GROUP_ID });

//   // small delay to give Kafka time to be ready (helps with startup races)
//   await new Promise((res) => setTimeout(res, 5000));

//   logger.info(
//     JSON.stringify({
//       event: 'consumer_starting',
//       broker: KAFKA_BROKER,
//       topic: KAFKA_TOPIC,
//       groupId: CONSUMER_GROUP_ID,
//     })
//   );

//   try {
//     await consumer.connect();
//     logger.info(JSON.stringify({ event: 'consumer_connected' }));

//     await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });
//     logger.info(
//       JSON.stringify({ event: 'consumer_subscribed', topic: KAFKA_TOPIC })
//     );

//     await consumer.run({
//       eachMessage: async ({ topic, partition, message }) => {
//         const value = message.value ? message.value.toString() : null;

//         let parsed;
//         try {
//           parsed = JSON.parse(value);
//         } catch {
//           parsed = { raw: value };
//         }

//         const logEntry = {
//           source: 'kafka',
//           topic,
//           partition,
//           offset: message.offset,
//           key: message.key?.toString() || null,
//           value: parsed,
//         };

//         logger.info(JSON.stringify(logEntry));
//       },
//     });

//     // consumer.run() normally never returns as long as it’s running
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         event: 'consumer_error',
//         error: err.message,
//       })
//     );

//     // Graceful retry instead of killing the container
//     try {
//       await consumer.disconnect();
//     } catch (_) {
//       // ignore
//     }

//     // wait a bit and restart
//     await new Promise((res) => setTimeout(res, 5000));
//     return startConsumer();
//   }
// }

// // Kick off the consumer, but do NOT exit the process on failure
// startConsumer().catch((err) => {
//   logger.error(
//     JSON.stringify({
//       event: 'fatal_consumer_error',
//       error: err.message,
//     })
//   );
// });

const express = require('express');
const { Kafka } = require('kafkajs');
const log4js = require('log4js');
require('dotenv').config();
const client = require('prom-client');

// ---------- log4js setup ----------
log4js.configure({
  appenders: {
    out: {
      type: 'stdout',
      layout: {
        type: 'pattern',
        pattern:
          '{"timestamp":"%d","level":"%p","category":"%c","message":%m}%n',
      },
    },
  },
  categories: {
    default: { appenders: ['out'], level: 'info' },
  },
});

const logger = log4js.getLogger('cdc-consumer');

// ---------- env config ----------
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'db-changes';
const CONSUMER_GROUP_ID =
  process.env.CONSUMER_GROUP_ID || 'cdc-consumer-group';

// ---------- PROMETHEUS METRICS ----------
const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: 'cdc_consumer_',
});

// Total messages consumed
const messagesConsumedTotal = new client.Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total number of Kafka messages consumed by this consumer',
});

// Errors during processing
const messageProcessingErrorsTotal = new client.Counter({
  name: 'kafka_message_processing_errors_total',
  help: 'Total number of errors during Kafka message processing',
});

// Processing duration per message
const messageProcessingDurationSeconds = new client.Histogram({
  name: 'kafka_message_processing_duration_seconds',
  help: 'Duration of processing a Kafka message in seconds',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 1, 5],
});

// Timestamp of last message
const lastMessageTimestamp = new client.Gauge({
  name: 'kafka_last_message_timestamp_millis',
  help: 'Unix timestamp (ms) of the last consumed Kafka message',
});

register.registerMetric(messagesConsumedTotal);
register.registerMetric(messageProcessingErrorsTotal);
register.registerMetric(messageProcessingDurationSeconds);
register.registerMetric(lastMessageTimestamp);

// ---------- Kafka setup ----------
const kafka = new Kafka({
  clientId: 'cdc-consumer',
  brokers: [KAFKA_BROKER],
});

async function startConsumer() {
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUP_ID });

  // small delay to give Kafka time to be ready (helps with startup races)
  await new Promise((res) => setTimeout(res, 5000));

  logger.info(
    JSON.stringify({
      event: 'consumer_starting',
      broker: KAFKA_BROKER,
      topic: KAFKA_TOPIC,
      groupId: CONSUMER_GROUP_ID,
    })
  );

  try {
    await consumer.connect();
    logger.info(JSON.stringify({ event: 'consumer_connected' }));

    await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });
    logger.info(
      JSON.stringify({ event: 'consumer_subscribed', topic: KAFKA_TOPIC })
    );

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const timerEnd = messageProcessingDurationSeconds.startTimer();
        const value = message.value ? message.value.toString() : null;

        let parsed;
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = { raw: value };
        }

        const logEntry = {
          source: 'kafka',
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString() || null,
          value: parsed,
        };

        try {
          logger.info(JSON.stringify(logEntry));
          messagesConsumedTotal.inc();
          lastMessageTimestamp.set(Date.now());
        } catch (err) {
          messageProcessingErrorsTotal.inc();
          logger.error(
            JSON.stringify({
              event: 'message_processing_error',
              error: err.message,
            })
          );
        } finally {
          timerEnd();
        }
      },
    });

    // consumer.run() normally never returns as long as it’s running
  } catch (err) {
    logger.error(
      JSON.stringify({
        event: 'consumer_error',
        error: err.message,
      })
    );

    // Graceful retry instead of killing the container
    try {
      await consumer.disconnect();
    } catch (_) {
      // ignore
    }

    // wait a bit and restart
    await new Promise((res) => setTimeout(res, 5000));
    return startConsumer();
  }
}

// Kick off the consumer, but do NOT exit the process on failure
startConsumer().catch((err) => {
  logger.error(
    JSON.stringify({
      event: 'fatal_consumer_error',
      error: err.message,
    })
  );
});

// ---------- METRICS HTTP SERVER ----------
const app = express();
const METRICS_PORT = process.env.METRICS_PORT || 9100;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    console.error('Failed to generate metrics', err.message);
    res.status(500).end();
  }
});

app.listen(METRICS_PORT, () => {
  console.log(`Metrics server listening on port ${METRICS_PORT}`);
});
