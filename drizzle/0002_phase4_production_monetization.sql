CREATE TABLE "billing_checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" text,
	"billing_plan_id" text NOT NULL,
	"provider" varchar(32) NOT NULL,
	"client" varchar(32) DEFAULT 'web' NOT NULL,
	"provider_checkout_id" varchar(255),
	"provider_customer_id" varchar(255),
	"status" varchar(32) DEFAULT 'created' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"taxable_minor" integer NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"cgst_minor" integer DEFAULT 0 NOT NULL,
	"sgst_minor" integer DEFAULT 0 NOT NULL,
	"igst_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"billing_coupon_id" text,
	"referral_code_id" text,
	"idempotency_key" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_coupon_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_coupon_id" text NOT NULL,
	"user_id" text NOT NULL,
	"billing_checkout_id" text NOT NULL,
	"discount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"percent_off_bps" integer,
	"amount_off_minor" integer,
	"currency" varchar(3),
	"max_redemptions" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"billing_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"institution_id" text,
	"provider" varchar(32) NOT NULL,
	"provider_customer_id" varchar(255) NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text,
	"billing_checkout_id" text,
	"user_id" text,
	"institution_id" text,
	"provider" varchar(32) NOT NULL,
	"provider_invoice_id" varchar(255),
	"invoice_number" varchar(128),
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"taxable_minor" integer NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"cgst_minor" integer DEFAULT 0 NOT NULL,
	"sgst_minor" integer DEFAULT 0 NOT NULL,
	"igst_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"amount_paid_minor" integer DEFAULT 0 NOT NULL,
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_checkout_id" text NOT NULL,
	"billing_invoice_id" text,
	"provider" varchar(32) NOT NULL,
	"provider_payment_id" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount_minor" integer NOT NULL,
	"captured_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"kind" varchar(32) DEFAULT 'subscription' NOT NULL,
	"interval" varchar(32) DEFAULT 'month' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"amount_minor" integer NOT NULL,
	"gst_rate_bps" integer DEFAULT 1800 NOT NULL,
	"stripe_price_id" varchar(255),
	"stripe_product_id" varchar(255),
	"razorpay_plan_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"premium" boolean DEFAULT true NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"referral_code_id" text NOT NULL,
	"referrer_user_id" text NOT NULL,
	"referred_user_id" text NOT NULL,
	"billing_checkout_id" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rewarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_payment_id" text NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_refund_id" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"amount_minor" integer NOT NULL,
	"reason" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_tax_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"institution_id" text,
	"legal_name" varchar(160) NOT NULL,
	"gstin" varchar(32),
	"state_code" varchar(3) NOT NULL,
	"billing_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id" varchar(255) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"percent_off_bps" integer DEFAULT 1000 NOT NULL,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_plan_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider" varchar(32) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_subscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "latest_invoice_reference" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_billing_coupon_id_billing_coupons_id_fk" FOREIGN KEY ("billing_coupon_id") REFERENCES "public"."billing_coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_coupon_redemptions" ADD CONSTRAINT "billing_coupon_redemptions_billing_coupon_id_billing_coupons_id_fk" FOREIGN KEY ("billing_coupon_id") REFERENCES "public"."billing_coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_coupon_redemptions" ADD CONSTRAINT "billing_coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_coupon_redemptions" ADD CONSTRAINT "billing_coupon_redemptions_billing_checkout_id_billing_checkouts_id_fk" FOREIGN KEY ("billing_checkout_id") REFERENCES "public"."billing_checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_coupons" ADD CONSTRAINT "billing_coupons_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_billing_checkout_id_billing_checkouts_id_fk" FOREIGN KEY ("billing_checkout_id") REFERENCES "public"."billing_checkouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_billing_checkout_id_billing_checkouts_id_fk" FOREIGN KEY ("billing_checkout_id") REFERENCES "public"."billing_checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_billing_invoice_id_billing_invoices_id_fk" FOREIGN KEY ("billing_invoice_id") REFERENCES "public"."billing_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_referrals" ADD CONSTRAINT "billing_referrals_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_referrals" ADD CONSTRAINT "billing_referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_referrals" ADD CONSTRAINT "billing_referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_referrals" ADD CONSTRAINT "billing_referrals_billing_checkout_id_billing_checkouts_id_fk" FOREIGN KEY ("billing_checkout_id") REFERENCES "public"."billing_checkouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_billing_payment_id_billing_payments_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "public"."billing_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tax_profiles" ADD CONSTRAINT "billing_tax_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tax_profiles" ADD CONSTRAINT "billing_tax_profiles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_idempotency_unique" ON "billing_checkouts" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_provider_external_unique" ON "billing_checkouts" USING btree ("provider","provider_checkout_id");--> statement-breakpoint
CREATE INDEX "billing_checkouts_user_created_idx" ON "billing_checkouts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_checkouts_status_idx" ON "billing_checkouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_coupon_redemptions_checkout_unique" ON "billing_coupon_redemptions" USING btree ("billing_checkout_id");--> statement-breakpoint
CREATE INDEX "billing_coupon_redemptions_coupon_user_idx" ON "billing_coupon_redemptions" USING btree ("billing_coupon_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_coupons_code_unique" ON "billing_coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "billing_coupons_active_expires_idx" ON "billing_coupons" USING btree ("active","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_provider_external_unique" ON "billing_customers" USING btree ("provider","provider_customer_id");--> statement-breakpoint
CREATE INDEX "billing_customers_user_provider_idx" ON "billing_customers" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "billing_customers_institution_provider_idx" ON "billing_customers" USING btree ("institution_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_provider_external_unique" ON "billing_invoices" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_user_created_idx" ON "billing_invoices" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_provider_external_unique" ON "billing_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "billing_payments_checkout_idx" ON "billing_payments" USING btree ("billing_checkout_id");--> statement-breakpoint
CREATE INDEX "billing_payments_status_idx" ON "billing_payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_plans_code_unique" ON "billing_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "billing_plans_active_idx" ON "billing_plans" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_referrals_referred_unique" ON "billing_referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "billing_referrals_referrer_idx" ON "billing_referrals" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_refunds_provider_external_unique" ON "billing_refunds" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE INDEX "billing_refunds_payment_idx" ON "billing_refunds" USING btree ("billing_payment_id");--> statement-breakpoint
CREATE INDEX "billing_refunds_status_idx" ON "billing_refunds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_tax_profiles_user_unique" ON "billing_tax_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_tax_profiles_institution_unique" ON "billing_tax_profiles" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_event_unique" ON "billing_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "billing_webhook_events_status_idx" ON "billing_webhook_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_user_unique" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_plan_id_billing_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_external_unique" ON "subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_billing_plan_idx" ON "subscriptions" USING btree ("billing_plan_id");