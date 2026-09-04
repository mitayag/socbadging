CREATE TABLE `system_settings` (
  `id` VARCHAR(32) NOT NULL DEFAULT 'default',
  `issuer_name` VARCHAR(191) NULL,
  `issuer_url` VARCHAR(2048) NULL,
  `issuer_logo_path` VARCHAR(1024) NULL,
  `support_contact` VARCHAR(2048) NULL,
  `sharing_enabled` BOOLEAN NOT NULL DEFAULT true,
  `updated_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
