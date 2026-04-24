-- Smaž duplikáty data_sources, zachovej nejnižší id pro každý (module_id, type)
DELETE FROM "data_sources"
WHERE id NOT IN (
  SELECT MIN(id) FROM "data_sources" GROUP BY module_id, type
);

-- Přidej unique index
CREATE UNIQUE INDEX IF NOT EXISTS "data_sources_module_type_idx" ON "data_sources" (module_id, type);
