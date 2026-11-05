ALTER TABLE `users` MODIFY `role` ENUM('ADMIN', 'FACULTY', 'STUDENT') NOT NULL;

ALTER TABLE `notification_deliveries`
  ADD COLUMN `badge_image_url` VARCHAR(2048) NULL,
  ADD COLUMN `expires_at` DATETIME(3) NULL,
  ADD COLUMN `resend_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `last_resend_at` DATETIME(3) NULL;

CREATE TABLE `student_accounts` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `activated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `student_accounts_user_id_key`(`user_id`),
  UNIQUE INDEX `student_accounts_student_id_key`(`student_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `student_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `type` ENUM('ACTIVATION', 'RECOVERY') NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `student_tokens_token_hash_key`(`token_hash`),
  INDEX `student_tokens_student_id_type_used_at_idx`(`student_id`, `type`, `used_at`),
  INDEX `student_tokens_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_accounts`
  ADD CONSTRAINT `student_accounts_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `student_accounts_student_id_fkey`
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `student_tokens`
  ADD CONSTRAINT `student_tokens_student_id_fkey`
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `student_tokens_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `student_tokens_created_by_user_id_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
