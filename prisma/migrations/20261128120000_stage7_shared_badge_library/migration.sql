-- AlterTable
ALTER TABLE `classes` ADD COLUMN `course_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `badge_templates` ADD COLUMN `shared_definition_version_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `courses` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `normalized_code` VARCHAR(100) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `programs_json` JSON NULL,
    `programs_text` TEXT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `courses_normalized_code_key`(`normalized_code`),
    INDEX `courses_status_code_idx`(`status`, `code`),
    INDEX `courses_title_idx`(`title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badge_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `badge_definitions_course_id_status_idx`(`course_id`, `status`),
    INDEX `badge_definitions_name_idx`(`name`),
    INDEX `badge_definitions_created_by_user_id_idx`(`created_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badge_definition_versions` (
    `id` VARCHAR(191) NOT NULL,
    `badge_definition_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `competencies` TEXT NOT NULL,
    `assessment_criteria` TEXT NOT NULL,
    `grading_period` VARCHAR(100) NULL,
    `issuing_institution` VARCHAR(191) NOT NULL,
    `validity_days` INTEGER NULL,
    `image_path` VARCHAR(500) NOT NULL,
    `criteria` TEXT NOT NULL,
    `metadata_json` JSON NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `approved_by_user_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `rejection_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `badge_definition_versions_badge_definition_id_status_idx`(`badge_definition_id`, `status`),
    INDEX `badge_definition_versions_status_idx`(`status`),
    UNIQUE INDEX `badge_definition_versions_badge_definition_id_version_key`(`badge_definition_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badge_definition_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `badge_definition_version_id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NOT NULL,
    `decision` ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED', 'VERSION_CREATED') NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `badge_definition_reviews_badge_definition_version_id_created_idx`(`badge_definition_version_id`, `created_at`),
    INDEX `badge_definition_reviews_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_badge_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `badge_definition_id` VARCHAR(191) NOT NULL,
    `badge_definition_version_id` VARCHAR(191) NOT NULL,
    `badge_template_id` VARCHAR(191) NULL,
    `assigned_by_user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_badge_assignments_badge_template_id_key`(`badge_template_id`),
    INDEX `class_badge_assignments_class_id_status_idx`(`class_id`, `status`),
    INDEX `class_badge_assignments_badge_definition_version_id_idx`(`badge_definition_version_id`),
    UNIQUE INDEX `class_badge_assignments_class_id_badge_definition_id_key`(`class_id`, `badge_definition_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `classes_course_id_idx` ON `classes`(`course_id`);

-- CreateIndex
CREATE INDEX `badge_templates_shared_definition_version_id_idx` ON `badge_templates`(`shared_definition_version_id`);

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_templates` ADD CONSTRAINT `badge_templates_shared_definition_version_id_fkey` FOREIGN KEY (`shared_definition_version_id`) REFERENCES `badge_definition_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definitions` ADD CONSTRAINT `badge_definitions_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definitions` ADD CONSTRAINT `badge_definitions_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definition_versions` ADD CONSTRAINT `badge_definition_versions_badge_definition_id_fkey` FOREIGN KEY (`badge_definition_id`) REFERENCES `badge_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definition_versions` ADD CONSTRAINT `badge_definition_versions_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definition_versions` ADD CONSTRAINT `badge_definition_versions_approved_by_user_id_fkey` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definition_reviews` ADD CONSTRAINT `badge_definition_reviews_badge_definition_version_id_fkey` FOREIGN KEY (`badge_definition_version_id`) REFERENCES `badge_definition_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_definition_reviews` ADD CONSTRAINT `badge_definition_reviews_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_badge_assignments` ADD CONSTRAINT `class_badge_assignments_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_badge_assignments` ADD CONSTRAINT `class_badge_assignments_badge_definition_id_fkey` FOREIGN KEY (`badge_definition_id`) REFERENCES `badge_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_badge_assignments` ADD CONSTRAINT `class_badge_assignments_badge_definition_version_id_fkey` FOREIGN KEY (`badge_definition_version_id`) REFERENCES `badge_definition_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_badge_assignments` ADD CONSTRAINT `class_badge_assignments_badge_template_id_fkey` FOREIGN KEY (`badge_template_id`) REFERENCES `badge_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_badge_assignments` ADD CONSTRAINT `class_badge_assignments_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
