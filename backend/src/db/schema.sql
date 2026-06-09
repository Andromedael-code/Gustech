CREATE DATABASE IF NOT EXISTS gustech CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gustech;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(50) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  cpf VARCHAR(14) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  phone_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_cpf (cpf)
);

SET @has_users_phone_verified_at := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'phone_verified_at'
);
SET @sql_users_phone_verified_at := IF(
  @has_users_phone_verified_at = 0,
  'ALTER TABLE users ADD COLUMN phone_verified_at DATETIME NULL AFTER phone',
  'SELECT 1'
);
PREPARE stmt_users_phone_verified_at FROM @sql_users_phone_verified_at;
EXECUTE stmt_users_phone_verified_at;
DEALLOCATE PREPARE stmt_users_phone_verified_at;

CREATE TABLE IF NOT EXISTS user_addresses (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  label VARCHAR(80) NOT NULL,
  street VARCHAR(150) NOT NULL,
  number VARCHAR(20) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  zip VARCHAR(9) NOT NULL,
  complement VARCHAR(120) DEFAULT '',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_addresses_user (user_id, is_default),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(255) PRIMARY KEY,
  uid VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_admins_uid (uid)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  status ENUM('pending','paid','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20) NOT NULL,
  payment_details_json JSON NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  customer_username VARCHAR(50) NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_cpf VARCHAR(14) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  invoice_number VARCHAR(40) NULL,
  invoice_status VARCHAR(20) NULL,
  invoice_issued_at DATETIME NULL,
  shipping_label_code VARCHAR(40) NULL,
  shipping_carrier VARCHAR(80) NULL,
  shipping_generated_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_orders_user_created (user_id, created_at DESC),
  KEY idx_orders_status_created (status, created_at DESC),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(80) NOT NULL,
  street VARCHAR(150) NOT NULL,
  number VARCHAR(20) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  zip VARCHAR(9) NOT NULL,
  complement VARCHAR(120) DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_order_addresses_order (order_id),
  CONSTRAINT fk_order_addresses_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(100) NULL,
  name VARCHAR(120) NOT NULL,
  image_url VARCHAR(500) NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_timeline (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL,
  changed_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_order_timeline_order (order_id, created_at),
  CONSTRAINT fk_order_timeline_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  author_name VARCHAR(80) NOT NULL,
  rating DECIMAL(2,1) NOT NULL,
  comment TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_reviews_user_product (user_id, product_id),
  KEY idx_reviews_product_created (product_id, created_at DESC),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(100) PRIMARY KEY,
  slug VARCHAR(140) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  category VARCHAR(60) NOT NULL,
  categories_json JSON NULL,
  brand VARCHAR(80) NULL,
  badge VARCHAR(80) NULL,
  image_url VARCHAR(500) NULL,
  gallery_json JSON NULL,
  highlights_json JSON NULL,
  specs_json JSON NULL,
  variants_json JSON NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  condition_label VARCHAR(40) NULL,
  sales INT NOT NULL DEFAULT 0,
  rating DECIMAL(2,1) NOT NULL DEFAULT 0,
  reviews_count INT NOT NULL DEFAULT 0,
  relevance_score INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_category (category, is_active),
  KEY idx_products_relevance (relevance_score DESC, sales DESC),
  KEY idx_products_rating (rating DESC, reviews_count DESC),
  FULLTEXT KEY ft_products_search (name, description, brand, category) -- fix: CODE-3
);

SET @has_products_brand := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'brand'
);
SET @sql_products_brand := IF(
  @has_products_brand = 0,
  'ALTER TABLE products ADD COLUMN brand VARCHAR(80) NULL',
  'SELECT 1'
);
PREPARE stmt_products_brand FROM @sql_products_brand;
EXECUTE stmt_products_brand;
DEALLOCATE PREPARE stmt_products_brand;

SET @has_products_badge := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'badge'
);
SET @sql_products_badge := IF(
  @has_products_badge = 0,
  'ALTER TABLE products ADD COLUMN badge VARCHAR(80) NULL',
  'SELECT 1'
);
PREPARE stmt_products_badge FROM @sql_products_badge;
EXECUTE stmt_products_badge;
DEALLOCATE PREPARE stmt_products_badge;

SET @has_products_categories_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'categories_json'
);
SET @sql_products_categories_json := IF(
  @has_products_categories_json = 0,
  'ALTER TABLE products ADD COLUMN categories_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt_products_categories_json FROM @sql_products_categories_json;
EXECUTE stmt_products_categories_json;
DEALLOCATE PREPARE stmt_products_categories_json;

SET @has_products_gallery_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'gallery_json'
);
SET @sql_products_gallery_json := IF(
  @has_products_gallery_json = 0,
  'ALTER TABLE products ADD COLUMN gallery_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt_products_gallery_json FROM @sql_products_gallery_json;
EXECUTE stmt_products_gallery_json;
DEALLOCATE PREPARE stmt_products_gallery_json;

SET @has_products_highlights_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'highlights_json'
);
SET @sql_products_highlights_json := IF(
  @has_products_highlights_json = 0,
  'ALTER TABLE products ADD COLUMN highlights_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt_products_highlights_json FROM @sql_products_highlights_json;
EXECUTE stmt_products_highlights_json;
DEALLOCATE PREPARE stmt_products_highlights_json;

SET @has_products_specs_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'specs_json'
);
SET @sql_products_specs_json := IF(
  @has_products_specs_json = 0,
  'ALTER TABLE products ADD COLUMN specs_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt_products_specs_json FROM @sql_products_specs_json;
EXECUTE stmt_products_specs_json;
DEALLOCATE PREPARE stmt_products_specs_json;

SET @has_products_variants_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'variants_json'
);
SET @sql_products_variants_json := IF(
  @has_products_variants_json = 0,
  'ALTER TABLE products ADD COLUMN variants_json JSON NULL',
  'SELECT 1'
);
PREPARE stmt_products_variants_json FROM @sql_products_variants_json;
EXECUTE stmt_products_variants_json;
DEALLOCATE PREPARE stmt_products_variants_json;

SET @has_products_search_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'ft_products_search'
);
SET @sql_products_search_index := IF(
  @has_products_search_index = 0,
  'ALTER TABLE products ADD FULLTEXT KEY ft_products_search (name, description, brand, category)',
  'SELECT 1'
); -- fix: CODE-3
PREPARE stmt_products_search_index FROM @sql_products_search_index;
EXECUTE stmt_products_search_index;
DEALLOCATE PREPARE stmt_products_search_index;

CREATE TABLE IF NOT EXISTS cart_items (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(100) NULL,
  name VARCHAR(120) NOT NULL,
  image_url VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_cart_user_product (user_id, product_id),
  KEY idx_cart_user (user_id, created_at DESC),
  KEY idx_cart_product (product_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

UPDATE cart_items ci
JOIN (
  SELECT *
  FROM (
    SELECT MIN(id) AS keep_id, user_id, product_id, SUM(quantity) AS total_quantity
    FROM cart_items
    WHERE product_id IS NOT NULL
    GROUP BY user_id, product_id
    HAVING COUNT(*) > 1
  ) duplicate_groups
) duplicates ON duplicates.keep_id = ci.id
SET ci.quantity = LEAST(duplicates.total_quantity, 99), ci.updated_at = UTC_TIMESTAMP();

DELETE ci
FROM cart_items ci
JOIN (
  SELECT *
  FROM (
    SELECT MIN(id) AS keep_id, user_id, product_id
    FROM cart_items
    WHERE product_id IS NOT NULL
    GROUP BY user_id, product_id
    HAVING COUNT(*) > 1
  ) duplicate_groups
) duplicates
  ON duplicates.user_id = ci.user_id
 AND duplicates.product_id = ci.product_id
 AND duplicates.keep_id <> ci.id;

SET @has_cart_user_product_unique := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cart_items'
    AND INDEX_NAME = 'uq_cart_user_product'
);
SET @sql_cart_user_product_unique := IF(
  @has_cart_user_product_unique = 0,
  'ALTER TABLE cart_items ADD UNIQUE KEY uq_cart_user_product (user_id, product_id)',
  'SELECT 1'
);
PREPARE stmt_cart_user_product_unique FROM @sql_cart_user_product_unique;
EXECUTE stmt_cart_user_product_unique;
DEALLOCATE PREPARE stmt_cart_user_product_unique;

CREATE TABLE IF NOT EXISTS wishlist_items (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_wishlist_user_product (user_id, product_id),
  KEY idx_wishlist_user_created (user_id, created_at DESC),
  CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storefront_settings (
  settings_key VARCHAR(80) PRIMARY KEY,
  settings_json JSON NOT NULL,
  updated_at DATETIME NOT NULL
);
