CREATE TABLE `faculty_profiles` (
  `user_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(100) NULL,
  `department` VARCHAR(191) NULL,
  `title` VARCHAR(191) NULL,
  `bio` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `faculty_profiles_employee_id_key`(`employee_id`),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `faculty_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `classes` (
  `id` VARCHAR(191) NOT NULL,
  `owner_user_id` VARCHAR(191) NOT NULL,
  `course_code` VARCHAR(100) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `section` VARCHAR(100) NOT NULL,
  `term` VARCHAR(100) NOT NULL,
  `academic_year` VARCHAR(20) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `classes_owner_user_id_status_idx`(`owner_user_id`, `status`),
  INDEX `classes_course_code_idx`(`course_code`),
  INDEX `classes_title_idx`(`title`),
  PRIMARY KEY (`id`),
  CONSTRAINT `classes_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
