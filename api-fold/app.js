// const express = require('express');
// const log4js = require('log4js');
// const crypto = require('crypto');
// const { Kafka } = require('kafkajs'); 
// require('dotenv').config();
// const client = require('prom-client');

// // ---------- PROMETHEUS METRICS SETUP ----------
// const register = new client.Registry();

// // Collect default Node.js metrics (CPU, memory, event loop, etc.)
// client.collectDefaultMetrics({
//   register,
//   prefix: 'api_',
// });

// // HTTP request duration histogram
// const httpRequestDurationSeconds = new client.Histogram({
//   name: 'api_http_request_duration_seconds',
//   help: 'Duration of HTTP requests in seconds',
//   labelNames: ['method', 'route', 'status_code'],
//   buckets: [0.01, 0.05, 0.1, 0.3, 1, 2, 5],
// });

// register.registerMetric(httpRequestDurationSeconds);

// const {
//   testConnection,
//   findUserByUsernameAndPassword,
//   createToken,
//   findUserByToken,
// } = require('./db');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // ---------- Logger config ----------
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

// const logger = log4js.getLogger('api');

// app.use(express.static('front'));
// app.use(express.json());

// app.use((req, res, next) => {
//   logger.info(
//     JSON.stringify({
//       event: 'http_request',
//       method: req.method,
//       path: req.path,
//       ip: req.ip,
//     })
//   );
//   next();
// });

// function getClientIp(req) {
//   return (
//     req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
//     req.socket?.remoteAddress ||
//     req.ip ||
//     'unknown'
//   );
// }

// // ---------- KAFKA PRODUCER SETUP ----------

// const kafkaBroker = process.env.KAFKA_BROKER || 'kafka:9092';
// const kafkaTopic = process.env.KAFKA_TOPIC || 'db-changes';

// const kafka = new Kafka({
//   clientId: 'api-service',
//   brokers: [kafkaBroker],
// });

// const producer = kafka.producer();

// async function initKafka() {
//   try {
//     await producer.connect();
//     logger.info(
//       JSON.stringify({
//         event: 'kafka_producer_connected',
//         broker: kafkaBroker,
//         topic: kafkaTopic,
//       })
//     );
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         event: 'kafka_producer_connect_error',
//         error: err.message,
//       })
//     );
//   }
// }


// initKafka().catch((err) => {
//   logger.error(
//     JSON.stringify({
//       event: 'kafka_init_unhandled_error',
//       error: err.message,
//     })
//   );
// });


// async function publishLoginEventToKafka(user, req) {
//   const event = {
//     eventType: 'USER_LOGIN',
//     table: 'users',
//     userId: user.id,
//     username: user.username,
//     ip: getClientIp(req),
//     timestamp: new Date().toISOString(),
//   };

//   try {
//     await producer.connect();
//     await producer.send({
//       topic: kafkaTopic,
//       messages: [{ value: JSON.stringify(event) }],
//     });

//     logger.info(
//       JSON.stringify({
//         event: 'login_kafka_published',
//         topic: kafkaTopic,
//         userId: user.id,
//         username: user.username,
//       })
//     );
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         event: 'login_kafka_publish_error',
//         error: err.message,
//         userId: user.id,
//       })
//     );
//   }
// }

// // Measure every HTTP request duration and expose as a Prometheus metric
// app.use((req, res, next) => {
//   const end = httpRequestDurationSeconds.startTimer();
//   res.on('finish', () => {
//     end({
//       method: req.method,
//       route: req.path,
//       status_code: res.statusCode,
//     });
//   });
//   next();
// });


// // ---------- ROUTES ----------

// app.get('/', (req, res) => {
//   logger.info(JSON.stringify({ event: 'root_called' }));
//   res.json({ message: 'API is running' });
// });

// // ---------- POST /login ----------
// app.post('/login', async (req, res) => {
//   try {
//     const { username, password } = req.body || {};

//     if (!username || !password) {
//       logger.info(
//         JSON.stringify({
//           action: 'login_failed',
//           reason: 'missing_credentials',
//           username,
//           ip: getClientIp(req),
//         })
//       );
//       return res
//         .status(400)
//         .json({ error: 'Username and password are required' });
//     }

//     const user = await findUserByUsernameAndPassword(username, password);

//     if (!user) {
//       logger.info(
//         JSON.stringify({
//           action: 'login_failed',
//           reason: 'invalid_credentials',
//           username,
//           ip: getClientIp(req),
//         })
//       );
//       return res
//         .status(401)
//         .json({ error: 'Invalid username or password' });
//     }

//     // Generate simple random token
//     const token = crypto.randomBytes(16).toString('hex');

//     await createToken(user.id, token);

//     // Structured login log: timestamp, user ID, action, IP address
//     const logEntry = {
//       timestamp: new Date().toISOString(),
//       userId: user.id,
//       action: 'login',
//       ip: getClientIp(req),
//     };
//     logger.info(JSON.stringify(logEntry));

   
//     await publishLoginEventToKafka(user, req);

//     res.json({
//       message: 'Login successful',
//       token,
//     });
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         action: 'login_error',
//         error: err.message,
//       })
//     );
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // ---------- GET /me (protected) ----------
// app.get('/me', async (req, res) => {
//   try {
//     let token = null;

//     const authHeader = req.headers['authorization'];
//     if (authHeader && authHeader.startsWith('Bearer ')) {
//       token = authHeader.substring('Bearer '.length);
//     } else if (req.headers['x-auth-token']) {
//       token = req.headers['x-auth-token'];
//     }

//     if (!token) {
//       return res.status(401).json({ error: 'Missing auth token' });
//     }

//     const user = await findUserByToken(token);

//     if (!user) {
//       return res.status(401).json({ error: 'Invalid or expired token' });
//     }

//     logger.info(
//       JSON.stringify({
//         timestamp: new Date().toISOString(),
//         userId: user.id,
//         action: 'get_me',
//         ip: getClientIp(req),
//       })
//     );

//   // ---------- GET /metrics (Prometheus) ----------
// app.get('/metrics', async (req, res) => {
//   try {
//     res.set('Content-Type', register.contentType);
//     res.end(await register.metrics());
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         event: 'metrics_error',
//         error: err.message,
//       })
//     );
//     res.status(500).end('Error collecting metrics');
//   }
// });


//     // Return some basic user info
//     res.json({
//       id: user.id,
//       username: user.username,
//       created_at: user.created_at,
//     });
//   } catch (err) {
//     logger.error(
//       JSON.stringify({
//         action: 'me_error',
//         error: err.message,
//       })
//     );
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // ---------- Start server ----------
// app.listen(PORT, () => {
//   console.log(`API server listening on port ${PORT}`);
//   logger.info(
//     JSON.stringify({
//       event: 'server_started',
//       port: PORT,
//     })
//   );

//   testConnection();
// });


const express = require('express');
const log4js = require('log4js');
const crypto = require('crypto');
const { Kafka } = require('kafkajs');
require('dotenv').config();
const client = require('prom-client');

const {
  testConnection,
  findUserByUsernameAndPassword,
  createToken,
  findUserByToken,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- PROMETHEUS METRICS SETUP ----------
const register = new client.Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'api_',
});

// HTTP request duration histogram
const httpRequestDurationSeconds = new client.Histogram({
  name: 'api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 2, 5],
});

register.registerMetric(httpRequestDurationSeconds);

// ---------- Logger config ----------
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

const logger = log4js.getLogger('api');

app.use(express.static('front'));
app.use(express.json());

// Structured request logs
app.use((req, res, next) => {
  logger.info(
    JSON.stringify({
      event: 'http_request',
      method: req.method,
      path: req.path,
      ip: req.ip,
    })
  );
  next();
});

// Measure every HTTP request duration and expose as a Prometheus metric
app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

// ---------- Helper: client IP ----------
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

// ---------- KAFKA PRODUCER SETUP ----------
const kafkaBroker = process.env.KAFKA_BROKER || 'kafka:9092';
const kafkaTopic = process.env.KAFKA_TOPIC || 'db-changes';

const kafka = new Kafka({
  clientId: 'api-service',
  brokers: [kafkaBroker],
});

const producer = kafka.producer();

async function initKafka() {
  try {
    await producer.connect();
    logger.info(
      JSON.stringify({
        event: 'kafka_producer_connected',
        broker: kafkaBroker,
        topic: kafkaTopic,
      })
    );
  } catch (err) {
    logger.error(
      JSON.stringify({
        event: 'kafka_producer_connect_error',
        error: err.message,
      })
    );
  }
}

initKafka().catch((err) => {
  logger.error(
    JSON.stringify({
      event: 'kafka_init_unhandled_error',
      error: err.message,
    })
  );
});

async function publishLoginEventToKafka(user, req) {
  const event = {
    eventType: 'USER_LOGIN',
    table: 'users',
    userId: user.id,
    username: user.username,
    ip: getClientIp(req),
    timestamp: new Date().toISOString(),
  };

  try {
    await producer.connect();
    await producer.send({
      topic: kafkaTopic,
      messages: [{ value: JSON.stringify(event) }],
    });

    logger.info(
      JSON.stringify({
        event: 'login_kafka_published',
        topic: kafkaTopic,
        userId: user.id,
        username: user.username,
      })
    );
  } catch (err) {
    logger.error(
      JSON.stringify({
        event: 'login_kafka_publish_error',
        error: err.message,
        userId: user.id,
      })
    );
  }
}

// ---------- ROUTES ----------

// Health/info route
app.get('/', (req, res) => {
  logger.info(JSON.stringify({ event: 'root_called' }));
  res.json({ message: 'API is running' });
});

// ---------- POST /login ----------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      logger.info(
        JSON.stringify({
          action: 'login_failed',
          reason: 'missing_credentials',
          username,
          ip: getClientIp(req),
        })
      );
      return res
        .status(400)
        .json({ error: 'Username and password are required' });
    }

    const user = await findUserByUsernameAndPassword(username, password);

    if (!user) {
      logger.info(
        JSON.stringify({
          action: 'login_failed',
          reason: 'invalid_credentials',
          username,
          ip: getClientIp(req),
        })
      );
      return res
        .status(401)
        .json({ error: 'Invalid username or password' });
    }

    // Generate simple random token
    const token = crypto.randomBytes(16).toString('hex');

    await createToken(user.id, token);

    // Structured login log: timestamp, user ID, action, IP address
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: user.id,
      action: 'login',
      ip: getClientIp(req),
    };
    logger.info(JSON.stringify(logEntry));

    await publishLoginEventToKafka(user, req);

    res.json({
      message: 'Login successful',
      token,
    });
  } catch (err) {
    logger.error(
      JSON.stringify({
        action: 'login_error',
        error: err.message,
      })
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- GET /me (protected) ----------
app.get('/me', async (req, res) => {
  try {
    let token = null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring('Bearer '.length);
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    const user = await findUserByToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    logger.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        userId: user.id,
        action: 'get_me',
        ip: getClientIp(req),
      })
    );

    // Return some basic user info
    res.json({
      id: user.id,
      username: user.username,
      created_at: user.created_at,
    });
  } catch (err) {
    logger.error(
      JSON.stringify({
        action: 'me_error',
        error: err.message,
      })
    );
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- GET /metrics (Prometheus) ----------
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error(
      JSON.stringify({
        event: 'metrics_error',
        error: err.message,
      })
    );
    res.status(500).end('Error collecting metrics');
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
  logger.info(
    JSON.stringify({
      event: 'server_started',
      port: PORT,
    })
  );

  testConnection();
});
