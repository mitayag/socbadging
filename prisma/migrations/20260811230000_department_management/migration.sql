CREATE TABLE `departments` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `normalized_name` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `departments_normalized_name_key`(`normalized_name`),
  INDEX `departments_status_name_idx`(`status`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `departments` (`id`, `name`, `normalized_name`, `updated_at`)
SELECT UUID(), MIN(TRIM(`department`)), LOWER(REGEXP_REPLACE(TRIM(`department`), '[[:space:]]+', ' ')), CURRENT_TIMESTAMP(3)
FROM `faculty_profiles`
WHERE `department` IS NOT NULL AND TRIM(`department`) <> ''
GROUP BY LOWER(REGEXP_REPLACE(TRIM(`department`), '[[:space:]]+', ' '));

ALTER TABLE `faculty_profiles` ADD COLUMN `department_id` VARCHAR(191) NULL;

UPDATE `faculty_profiles` fp
JOIN `departments` d ON d.`normalized_name` = LOWER(REGEXP_REPLACE(TRIM(fp.`department`), '[[:space:]]+', ' '))
SET fp.`department_id` = d.`id`
WHERE fp.`department` IS NOT NULL AND TRIM(fp.`department`) <> '';

ALTER TABLE `faculty_profiles` DROP COLUMN `department`;
CREATE INDEX `faculty_profiles_department_id_idx` ON `faculty_profiles`(`department_id`);
ALTER TABLE `faculty_profiles`
  ADD CONSTRAINT `faculty_profiles_department_id_fkey`
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
