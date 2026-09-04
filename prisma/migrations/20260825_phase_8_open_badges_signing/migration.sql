-- Phase 8 persists public signing metadata only. Private key material is intentionally absent.
CREATE TABLE `signing_keys` (
  `id` VARCHAR(191) NOT NULL,
  `verification_method_url` VARCHAR(2048) NOT NULL,
  `controller_url` VARCHAR(2048) NOT NULL,
  `algorithm` VARCHAR(64) NOT NULL,
  `cryptosuite` VARCHAR(100) NOT NULL,
  `public_multikey` TEXT NOT NULL,
  `fingerprint` VARCHAR(255) NOT NULL,
  `status` ENUM('ACTIVE', 'RETIRED', 'COMPROMISED') NOT NULL DEFAULT 'RETIRED',
  `activated_at` DATETIME(3) NULL,
  `retired_at` DATETIME(3) NULL,
  `compromised_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `signing_keys_verification_method_url_key`(`verification_method_url`),
  UNIQUE INDEX `signing_keys_fingerprint_key`(`fingerprint`),
  INDEX `signing_keys_status_activated_at_idx`(`status`, `activated_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `signing_keys_compromised_status_check`
    CHECK (`compromised_at` IS NULL OR `status` = 'COMPROMISED')
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `credential_status_lists` (
  `id` VARCHAR(191) NOT NULL,
  `public_url` VARCHAR(2048) NOT NULL,
  `purpose` VARCHAR(32) NOT NULL DEFAULT 'revocation',
  `capacity` INTEGER NOT NULL,
  `next_index` INTEGER NOT NULL DEFAULT 0,
  `signed_credential_json` JSON NULL,
  `version` INTEGER NOT NULL DEFAULT 0,
  `digest` VARCHAR(255) NULL,
  `signing_key_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `credential_status_lists_public_url_key`(`public_url`),
  INDEX `credential_status_lists_purpose_next_index_idx`(`purpose`, `next_index`),
  INDEX `credential_status_lists_signing_key_id_idx`(`signing_key_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `credential_status_lists_signing_key_id_fkey`
    FOREIGN KEY (`signing_key_id`) REFERENCES `signing_keys`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `credential_status_lists_capacity_check` CHECK (`capacity` > 0),
  CONSTRAINT `credential_status_lists_next_index_check` CHECK (`next_index` >= 0 AND `next_index` <= `capacity`),
  CONSTRAINT `credential_status_lists_purpose_check` CHECK (`purpose` = 'revocation')
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `badge_issuances`
  ADD COLUMN `signed_credential_json` JSON NULL,
  ADD COLUMN `signing_key_id` VARCHAR(191) NULL,
  ADD COLUMN `serializer_version` INTEGER NULL,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL,
  ADD COLUMN `superseded_by_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `badge_issuances_supersedes_id_key`(`supersedes_id`),
  ADD UNIQUE INDEX `badge_issuances_superseded_by_id_key`(`superseded_by_id`),
  ADD INDEX `badge_issuances_signing_key_id_idx`(`signing_key_id`),
  ADD INDEX `badge_issuances_supersedes_id_idx`(`supersedes_id`),
  ADD INDEX `badge_issuances_superseded_by_id_idx`(`superseded_by_id`),
  ADD CONSTRAINT `badge_issuances_signing_key_id_fkey`
    FOREIGN KEY (`signing_key_id`) REFERENCES `signing_keys`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `badge_issuances_supersedes_id_fkey`
    FOREIGN KEY (`supersedes_id`) REFERENCES `badge_issuances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `badge_issuances_superseded_by_id_fkey`
    FOREIGN KEY (`superseded_by_id`) REFERENCES `badge_issuances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `credential_status_allocations` (
  `id` VARCHAR(191) NOT NULL,
  `issuance_id` VARCHAR(191) NOT NULL,
  `status_list_id` VARCHAR(191) NOT NULL,
  `index` INTEGER NOT NULL,
  `is_revoked` BOOLEAN NOT NULL DEFAULT false,
  `revoked_at` DATETIME(3) NULL,
  `status_list_version` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `credential_status_allocations_issuance_id_key`(`issuance_id`),
  UNIQUE INDEX `credential_status_allocations_status_list_id_index_key`(`status_list_id`, `index`),
  INDEX `credential_status_allocations_status_list_id_is_revoked_idx`(`status_list_id`, `is_revoked`),
  PRIMARY KEY (`id`),
  CONSTRAINT `credential_status_allocations_issuance_id_fkey`
    FOREIGN KEY (`issuance_id`) REFERENCES `badge_issuances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `credential_status_allocations_status_list_id_fkey`
    FOREIGN KEY (`status_list_id`) REFERENCES `credential_status_lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `credential_status_allocations_index_check` CHECK (`index` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `credential_replacement_guards` (
  `id` TINYINT NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `credential_replacement_guards_singleton_check` CHECK (`id` = 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `credential_replacement_guards` (`id`) VALUES (1);

CREATE TRIGGER `badge_issuances_prevent_invalid_replacement_insert`
BEFORE INSERT ON `badge_issuances`
FOR EACH ROW
BEGIN
  DECLARE replacement_guard_id TINYINT;
  SELECT id INTO replacement_guard_id
  FROM `credential_replacement_guards`
  WHERE id = 1
  FOR UPDATE;
  IF NEW.supersedes_id = NEW.id OR NEW.superseded_by_id = NEW.id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot self-reference';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NEW.supersedes_id = NEW.superseded_by_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot use both directions for one peer';
  END IF;
END;

CREATE TRIGGER `badge_issuances_prevent_invalid_replacement_update`
BEFORE UPDATE ON `badge_issuances`
FOR EACH ROW
BEGIN
  DECLARE replacement_guard_id TINYINT;
  SELECT id INTO replacement_guard_id
  FROM `credential_replacement_guards`
  WHERE id = 1
  FOR UPDATE;
  IF NEW.supersedes_id = NEW.id OR NEW.superseded_by_id = NEW.id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot self-reference';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NEW.supersedes_id = NEW.superseded_by_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot use both directions for one peer';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM `badge_issuances`
    WHERE `id` = NEW.supersedes_id AND `supersedes_id` = NEW.id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot form a cycle';
  END IF;
  IF NEW.superseded_by_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM `badge_issuances`
    WHERE `id` = NEW.superseded_by_id AND `superseded_by_id` = NEW.id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Badge issuance replacement cannot form a cycle';
  END IF;
END;

CREATE TRIGGER `credential_status_allocations_prevent_historical_delete`
BEFORE DELETE ON `credential_status_allocations`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM `badge_issuances`
    WHERE `id` = OLD.issuance_id AND `signed_credential_json` IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Historical credential status allocations cannot be deleted';
  END IF;
END;
