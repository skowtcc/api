-- Hand-labelled generate output (reliable-apply notes, cf. 0010/0011).
-- asset.query now orders and keyset-compares `name` with COLLATE NOCASE:
-- legacy wanderer.moe assets have lowercase slug names while modern uploads
-- are Title Case, and under BINARY collation the lowercase block sorts after
-- the entire uppercase alphabet -- "sort by name" visually split the library
-- into two eras. A BINARY name index can't serve a NOCASE ORDER BY, so this
-- mirrors the asset_status_download_idx shape for the name sort.
CREATE INDEX IF NOT EXISTS `asset_status_name_nocase_idx` ON `asset` (`status`,"name" COLLATE NOCASE,`id`);
