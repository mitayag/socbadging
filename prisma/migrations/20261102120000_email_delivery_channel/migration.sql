ALTER TABLE `notification_deliveries`
  ADD COLUMN `delivery_channel` VARCHAR(20) NOT NULL DEFAULT 'mailpit';

CREATE INDEX `notification_deliveries_channel_status_next_idx`
  ON `notification_deliveries`(`delivery_channel`, `status`, `next_attempt_at`);
