export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  timezone: process.env.APP_TIMEZONE || 'Asia/Dhaka',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'BDT',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-super-secret-key-at-least-32-chars-long',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-super-secret-key-different-and-32-chars-long',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: process.env.JWT_ISSUER || 'erp-pos',
    audience: process.env.JWT_AUDIENCE || 'erp-pos-api',
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_dev_password',
    bucket: process.env.MINIO_BUCKET || 'pos-erp',
    region: process.env.MINIO_REGION || 'us-east-1',
    publicUrl: process.env.MINIO_PUBLIC_URL || 'http://localhost:9000',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_SECONDS || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  upload: {
    maxSizeBytes: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10) * 1024 * 1024,
  },
});
