import {
  boolean, integer, jsonb, pgTable, real, serial, text,
  timestamp, uniqueIndex, varchar,
} from "drizzle-orm/pg-core";

// ── Better Auth ───────────────────────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: varchar("image", { length: 512 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Modul systém ──────────────────────────────────────────────────────────────

export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 64 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const locationTypes = pgTable("location_types", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
});

export const dataSources = pgTable("data_sources", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(), // "scraper" | "api" | "manual"
  config: jsonb("config"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Lokality ──────────────────────────────────────────────────────────────────

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  typeId: integer("type_id").notNull().references(() => locationTypes.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  altitude: real("altitude"),
  externalUrl: varchar("external_url", { length: 512 }),
  externalId: varchar("external_id", { length: 255 }),
  sourceId: integer("source_id").references(() => dataSources.id, { onDelete: "set null" }),
  countryCode: varchar("country_code", { length: 8 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("locations_lat_lon_idx").on(table.lat, table.lon),
]);

// ── Uživatelská nastavení modulů ──────────────────────────────────────────────

export const userModuleSettings = pgTable("user_module_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: integer("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_module_settings_user_module_idx").on(table.userId, table.moduleId),
]);

// ── Evidence návštěv ──────────────────────────────────────────────────────────

export const userVisits = pgTable("user_visits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  visitedAt: timestamp("visited_at"),
  count: integer("count").notNull().default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_visits_user_location_idx").on(table.userId, table.locationId),
]);

// ── Výzvy ─────────────────────────────────────────────────────────────────────

export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => modules.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sourceUrl: varchar("source_url", { length: 512 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const challengeLocations = pgTable("challenge_locations", {
  challengeId: integer("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("challenge_locations_pk").on(table.challengeId, table.locationId),
]);

export const userChallenges = pgTable("user_challenges", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  challengeId: integer("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("user_challenges_user_challenge_idx").on(table.userId, table.challengeId),
]);

// ── Oblasti ───────────────────────────────────────────────────────────────────

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sourceUrl: varchar("source_url", { length: 512 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("areas_module_slug_idx").on(table.moduleId, table.slug),
]);

export const locationAreas = pgTable("location_areas", {
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  areaId: integer("area_id").notNull().references(() => areas.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("location_areas_pk").on(table.locationId, table.areaId),
]);

// ── Plánování tras ────────────────────────────────────────────────────────────

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  notes: text("notes"),
  aiSummary: text("ai_summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tripWaypoints = pgTable("trip_waypoints", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  name: varchar("name", { length: 255 }),
  order: integer("order").notNull(),
});
