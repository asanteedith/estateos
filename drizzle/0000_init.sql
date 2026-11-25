CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tasks_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "agent_tasks_priority_range" CHECK ("agent_tasks"."priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"responsibilities" jsonb NOT NULL,
	"automation" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "agents_tenant_key_uq" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"currency" text,
	"amount_minor" integer,
	"entity_type" text,
	"entity_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "enquiries_contact_present" CHECK ("enquiries"."email" IS NOT NULL OR "enquiries"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"vendor" text,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"recurring" text DEFAULT 'none' NOT NULL,
	"approval_id" uuid,
	"incurred_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"proposal_id" uuid,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "invoices_tenant_number_uq" UNIQUE("tenant_id","number"),
	CONSTRAINT "invoices_amount_positive" CHECK ("invoices"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"offer_type" text NOT NULL,
	"property_type" text NOT NULL,
	"currency" text NOT NULL,
	"price_minor" integer NOT NULL,
	"location" text NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "listings_price_nonneg" CHECK ("listings"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" text DEFAULT 'demo' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"target_value" integer NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objectives_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"subject" text,
	"body" text,
	"external_ref" text,
	"campaign" text,
	"occurred_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "outreach_tenant_external_ref_uq" UNIQUE("tenant_id","external_ref")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"evidence" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"verified_by_user_id" uuid NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "payments_tenant_reference_uq" UNIQUE("tenant_id","method","reference"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_minor" > 0),
	CONSTRAINT "payments_reference_present" CHECK (length(trim("payments"."reference")) >= 3),
	CONSTRAINT "payments_evidence_present" CHECK (length(trim("payments"."evidence")) >= 10)
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"deposit_percent" integer DEFAULT 50 NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "proposals_tenant_number_uq" UNIQUE("tenant_id","number"),
	CONSTRAINT "proposals_amount_positive" CHECK ("proposals"."amount_minor" > 0),
	CONSTRAINT "proposals_deposit_range" CHECK ("proposals"."deposit_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"website" text,
	"country" text,
	"city" text,
	"segment" text,
	"contact_name" text,
	"contact_role" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"source_url" text,
	"source_note" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"fit_score" integer,
	"score_reasons" jsonb,
	"stage" text DEFAULT 'new' NOT NULL,
	"dedupe_key" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "prospects_tenant_dedupe_uq" UNIQUE("tenant_id","dedupe_key"),
	CONSTRAINT "prospects_fit_score_range" CHECK ("prospects"."fit_score" IS NULL OR ("prospects"."fit_score" BETWEEN 0 AND 100))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'agency' NOT NULL,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_tenant_id_listing_id_listings_tenant_id_id_fk" FOREIGN KEY ("tenant_id","listing_id") REFERENCES "public"."listings"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_prospect_id_prospects_tenant_id_id_fk" FOREIGN KEY ("tenant_id","prospect_id") REFERENCES "public"."prospects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_proposal_id_proposals_tenant_id_id_fk" FOREIGN KEY ("tenant_id","proposal_id") REFERENCES "public"."proposals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_prospect_id_prospects_tenant_id_id_fk" FOREIGN KEY ("tenant_id","prospect_id") REFERENCES "public"."prospects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_tenant_id_prospect_id_prospects_tenant_id_id_fk" FOREIGN KEY ("tenant_id","prospect_id") REFERENCES "public"."prospects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_invoice_id_invoices_tenant_id_id_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."invoices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_prospect_id_prospects_tenant_id_id_fk" FOREIGN KEY ("tenant_id","prospect_id") REFERENCES "public"."prospects"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_tenant_created_idx" ON "activity_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_tenant_status_idx" ON "approvals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "listings_tenant_status_idx" ON "listings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "outreach_tenant_prospect_idx" ON "outreach" USING btree ("tenant_id","prospect_id");--> statement-breakpoint
CREATE INDEX "prospects_tenant_stage_idx" ON "prospects" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");