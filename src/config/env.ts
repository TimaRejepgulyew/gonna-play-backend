import { config } from "dotenv";

config();

export default {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  HOST: process.env.HOST || "localhost",
  JWT_SECRET: process.env.JWT_SECRET || "fallback_secret_key_for_dev_only",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
};
