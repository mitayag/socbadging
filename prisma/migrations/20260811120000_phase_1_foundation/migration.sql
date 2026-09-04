CREATE TABLE `users` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `normalized_email` VARCHAR(191) NOT NULL,
  `email_verified` DATETIME(3) NULL,
  `image` TEXT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'FACULTY') NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `session_version` INTEGER NOT NULL DEFAULT 0,
  `last_login_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `users_email_key`(`email`),
  UNIQUE INDEX `users_normalized_email_key`(`normalized_email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `accounts` (
  `id` VARCHAR(191) NOT NULL, `user_id` VARCHAR(191) NOT NULL, `type` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL, `provider_account_id` VARCHAR(191) NOT NULL,
  `refresh_token` TEXT NULL, `access_token` TEXT NULL, `expires_at` INTEGER NULL,
  `token_type` VARCHAR(191) NULL, `scope` VARCHAR(191) NULL, `id_token` TEXT NULL,
  `session_state` VARCHAR(191) NULL,
  INDEX `accounts_user_id_idx`(`user_id`),
  UNIQUE INDEX `accounts_provider_provider_account_id_key`(`provider`, `provider_account_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sessions` (
  `id` VARCHAR(191) NOT NULL, `session_token` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL, `expires` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sessions_session_token_key`(`session_token`), INDEX `sessions_user_id_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `verification_tokens` (
  `identifier` VARCHAR(191) NOT NULL, `token` VARCHAR(191) NOT NULL, `expires` DATETIME(3) NOT NULL,
  UNIQUE INDEX `verification_tokens_token_key`(`token`),
  UNIQUE INDEX `verification_tokens_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `id` VARCHAR(191) NOT NULL, `user_id` VARCHAR(191) NOT NULL, `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL, `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
  INDEX `password_reset_tokens_user_id_idx`(`user_id`), INDEX `password_reset_tokens_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` VARCHAR(191) NOT NULL, `actor_user_id` VARCHAR(191) NULL, `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL, `entity_id` VARCHAR(191) NULL, `context_json` JSON NULL,
  `ip_address` VARCHAR(45) NULL, `user_agent` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
  INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
