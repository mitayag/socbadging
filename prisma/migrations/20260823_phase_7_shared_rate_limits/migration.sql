CREATE TABLE `rate_limit_buckets` (
  `id` CHAR(64) NOT NULL,
  `policy` VARCHAR(32) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `window_start` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `request_count` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `rate_limit_buckets_policy_key_hash_window_start_key` (`policy`, `key_hash`, `window_start`),
  INDEX `rate_limit_buckets_expires_at_id_idx` (`expires_at`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
