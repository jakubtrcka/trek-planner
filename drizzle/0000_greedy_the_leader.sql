CREATE TABLE "peaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"altitude" real,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"mountain_link" varchar(512),
	"source" varchar(128),
	"country_code" varchar(8),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ascents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"peak_id" integer NOT NULL,
	"ascent_date" timestamp,
	"notes" text,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(128),
	"hory_username" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user_ascents" ADD CONSTRAINT "user_ascents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ascents" ADD CONSTRAINT "user_ascents_peak_id_peaks_id_fk" FOREIGN KEY ("peak_id") REFERENCES "public"."peaks"("id") ON DELETE no action ON UPDATE no action;