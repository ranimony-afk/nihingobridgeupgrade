import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Existing learner reward aggregate. This model remains stable so the feather
 * dashboard API keeps its original storage contract.
 */
export const featherProgress = pgTable("feather_progress", {
  userId: text("user_id").primaryKey(),
  feathers: integer("feathers").notNull().default(126),
  weeklyFeathers: integer("weekly_feathers").notNull().default(38),
  streak: integer("streak").notNull().default(12),
  lessonsCompleted: integer("lessons_completed").notNull().default(8),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    role: varchar("role", { length: 32 }).notNull().default("student"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
  ],
);

/** Auth.js OAuth account links. */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

/** Opaque web sessions shared by Auth.js OAuth/magic links and password login. */
export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 128 }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expires),
  ],
);

/** Auth.js magic-link verification tokens. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token] }),
    index("verification_tokens_expires_idx").on(table.expires),
  ],
);

/** Reserved for passkey/WebAuthn support through the Auth.js adapter. */
export const authenticators = pgTable(
  "authenticators",
  {
    credentialID: text("credential_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    credentialPublicKey: text("credential_public_key").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credential_device_type").notNull(),
    credentialBackedUp: boolean("credential_backed_up").notNull(),
    transports: text("transports"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.credentialID] }),
    index("authenticators_user_id_idx").on(table.userId),
  ],
);

/** Password authentication state, stored separately from profile metadata. */
export const userCredentials = pgTable(
  "user_credentials",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("user_credentials_locked_until_idx").on(table.lockedUntil)],
);

/** Hashed, single-use action tokens for email verification, reset, and MFA challenge. */
export const authActionTokens = pgTable(
  "auth_action_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    type: varchar("type", { length: 48 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_action_tokens_hash_unique").on(table.tokenHash),
    index("auth_action_tokens_user_type_idx").on(table.userId, table.type),
    index("auth_action_tokens_expires_idx").on(table.expiresAt),
  ],
);

/** Encrypted TOTP material and hashed recovery codes. */
export const twoFactorCredentials = pgTable("two_factor_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEncrypted: text("secret_encrypted").notNull(),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  lastUsedStep: integer("last_used_step"),
  recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Rotating opaque refresh tokens used exclusively by mobile/API clients. */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: text("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 128 }),
  },
  (table) => [
    uniqueIndex("refresh_tokens_hash_unique").on(table.tokenHash),
    index("refresh_tokens_user_idx").on(table.userId),
    index("refresh_tokens_family_idx").on(table.familyId),
    index("refresh_tokens_expires_idx").on(table.expiresAt),
  ],
);

/** Institution tenancy and subscription context. */
export const institutions = pgTable(
  "institutions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    subscriptionStatus: varchar("subscription_status", { length: 32 })
      .notNull()
      .default("trialing"),
    plan: varchar("plan", { length: 64 }).notNull().default("starter"),
    subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("institutions_slug_unique").on(table.slug),
    index("institutions_subscription_status_idx").on(table.subscriptionStatus),
  ],
);

export const institutionMembers = pgTable(
  "institution_members",
  {
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("student"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.institutionId, table.userId] }),
    index("institution_members_user_idx").on(table.userId),
  ],
);

/** Product catalog; amounts are always recorded in the currency's minor units. */
export const billingPlans = pgTable(
  "billing_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull(),
    kind: varchar("kind", { length: 32 }).notNull().default("subscription"),
    interval: varchar("interval", { length: 32 }).notNull().default("month"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    amountMinor: integer("amount_minor").notNull(),
    gstRateBps: integer("gst_rate_bps").notNull().default(1800),
    stripePriceId: varchar("stripe_price_id", { length: 255 }),
    stripeProductId: varchar("stripe_product_id", { length: 255 }),
    razorpayPlanId: varchar("razorpay_plan_id", { length: 255 }),
    active: boolean("active").notNull().default(true),
    premium: boolean("premium").notNull().default(true),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_plans_code_unique").on(table.code),
    index("billing_plans_active_idx").on(table.active),
  ],
);

/** Individual or institution subscription records for entitlement history. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("trialing"),
    plan: varchar("plan", { length: 64 }).notNull().default("starter"),
    billingPlanId: text("billing_plan_id").references(() => billingPlans.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).notNull().default("manual"),
    providerCustomerId: varchar("provider_customer_id", { length: 255 }),
    providerSubscriptionId: varchar("provider_subscription_id", { length: 255 }),
    latestInvoiceReference: varchar("latest_invoice_reference", { length: 255 }),
    seatCount: integer("seat_count").notNull().default(1),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("subscriptions_user_idx").on(table.userId),
    index("subscriptions_institution_idx").on(table.institutionId),
    index("subscriptions_status_idx").on(table.status),
    uniqueIndex("subscriptions_provider_external_unique").on(table.provider, table.providerSubscriptionId),
    index("subscriptions_billing_plan_idx").on(table.billingPlanId),
  ],
);

/** Explicit grants/revocations supplement static role permissions. */
export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 128 }).notNull(),
    granted: boolean("granted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_permission_override_unique").on(table.userId, table.permission),
    index("user_permission_overrides_user_idx").on(table.userId),
  ],
);

/** Immutable security event stream used for incident response and admin audit. */
export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    event: varchar("event", { length: 96 }).notNull(),
    ipAddress: varchar("ip_address", { length: 128 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_audit_events_user_idx").on(table.userId),
    index("auth_audit_events_event_created_idx").on(table.event, table.createdAt),
  ],
);

/** Provider-customer mapping is kept separate from user and tenant profile data. */
export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerCustomerId: varchar("provider_customer_id", { length: 255 }).notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_customers_provider_external_unique").on(table.provider, table.providerCustomerId),
    index("billing_customers_user_provider_idx").on(table.userId, table.provider),
    index("billing_customers_institution_provider_idx").on(table.institutionId, table.provider),
  ],
);

/** GST buyer details are opt-in and only stored for billing purposes. */
export const billingTaxProfiles = pgTable(
  "billing_tax_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "cascade" }),
    legalName: varchar("legal_name", { length: 160 }).notNull(),
    gstin: varchar("gstin", { length: 32 }),
    stateCode: varchar("state_code", { length: 3 }).notNull(),
    billingAddress: jsonb("billing_address").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_tax_profiles_user_unique").on(table.userId),
    uniqueIndex("billing_tax_profiles_institution_unique").on(table.institutionId),
  ],
);

/** Promotion codes are server-calculated and never trusted from client totals. */
export const billingCoupons = pgTable(
  "billing_coupons",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    active: boolean("active").notNull().default(true),
    percentOffBps: integer("percent_off_bps"),
    amountOffMinor: integer("amount_off_minor"),
    currency: varchar("currency", { length: 3 }),
    maxRedemptions: integer("max_redemptions"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    billingPlanId: text("billing_plan_id").references(() => billingPlans.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_coupons_code_unique").on(table.code),
    index("billing_coupons_active_expires_idx").on(table.active, table.expiresAt),
  ],
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    active: boolean("active").notNull().default(true),
    percentOffBps: integer("percent_off_bps").notNull().default(1000),
    maxUses: integer("max_uses"),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("referral_codes_code_unique").on(table.code),
    uniqueIndex("referral_codes_user_unique").on(table.userId),
  ],
);

/** Server-priced checkout quote and provider session/order linkage. */
export const billingCheckouts = pgTable(
  "billing_checkouts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
    billingPlanId: text("billing_plan_id")
      .notNull()
      .references(() => billingPlans.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    client: varchar("client", { length: 32 }).notNull().default("web"),
    providerCheckoutId: varchar("provider_checkout_id", { length: 255 }),
    providerCustomerId: varchar("provider_customer_id", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("created"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxableMinor: integer("taxable_minor").notNull(),
    gstRateBps: integer("gst_rate_bps").notNull(),
    cgstMinor: integer("cgst_minor").notNull().default(0),
    sgstMinor: integer("sgst_minor").notNull().default(0),
    igstMinor: integer("igst_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    billingCouponId: text("billing_coupon_id").references(() => billingCoupons.id, { onDelete: "set null" }),
    referralCodeId: text("referral_code_id").references(() => referralCodes.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_checkouts_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("billing_checkouts_provider_external_unique").on(table.provider, table.providerCheckoutId),
    index("billing_checkouts_user_created_idx").on(table.userId, table.createdAt),
    index("billing_checkouts_status_idx").on(table.status),
  ],
);

export const billingCouponRedemptions = pgTable(
  "billing_coupon_redemptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billingCouponId: text("billing_coupon_id")
      .notNull()
      .references(() => billingCoupons.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingCheckoutId: text("billing_checkout_id")
      .notNull()
      .references(() => billingCheckouts.id, { onDelete: "cascade" }),
    discountMinor: integer("discount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_coupon_redemptions_checkout_unique").on(table.billingCheckoutId),
    index("billing_coupon_redemptions_coupon_user_idx").on(table.billingCouponId, table.userId),
  ],
);

export const billingReferrals = pgTable(
  "billing_referrals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    referralCodeId: text("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "restrict" }),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingCheckoutId: text("billing_checkout_id").references(() => billingCheckouts.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("billing_referrals_referred_unique").on(table.referredUserId),
    index("billing_referrals_referrer_idx").on(table.referrerUserId),
  ],
);

export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    billingCheckoutId: text("billing_checkout_id").references(() => billingCheckouts.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerInvoiceId: varchar("provider_invoice_id", { length: 255 }),
    invoiceNumber: varchar("invoice_number", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxableMinor: integer("taxable_minor").notNull(),
    gstRateBps: integer("gst_rate_bps").notNull(),
    cgstMinor: integer("cgst_minor").notNull().default(0),
    sgstMinor: integer("sgst_minor").notNull().default(0),
    igstMinor: integer("igst_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    amountPaidMinor: integer("amount_paid_minor").notNull().default(0),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdfUrl: text("invoice_pdf_url"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_invoices_provider_external_unique").on(table.provider, table.providerInvoiceId),
    index("billing_invoices_user_created_idx").on(table.userId, table.createdAt),
    index("billing_invoices_status_idx").on(table.status),
  ],
);

export const billingPayments = pgTable(
  "billing_payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billingCheckoutId: text("billing_checkout_id")
      .notNull()
      .references(() => billingCheckouts.id, { onDelete: "cascade" }),
    billingInvoiceId: text("billing_invoice_id").references(() => billingInvoices.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_payments_provider_external_unique").on(table.provider, table.providerPaymentId),
    index("billing_payments_checkout_idx").on(table.billingCheckoutId),
    index("billing_payments_status_idx").on(table.status),
  ],
);

export const billingRefunds = pgTable(
  "billing_refunds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billingPaymentId: text("billing_payment_id")
      .notNull()
      .references(() => billingPayments.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    reason: varchar("reason", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_refunds_provider_external_unique").on(table.provider, table.providerRefundId),
    index("billing_refunds_payment_idx").on(table.billingPaymentId),
    index("billing_refunds_status_idx").on(table.status),
  ],
);

/** Raw webhook payloads are retained for replay-safe, auditable processing. */
export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processingError: text("processing_error"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("billing_webhook_events_provider_event_unique").on(table.provider, table.providerEventId),
    index("billing_webhook_events_status_idx").on(table.status),
  ],
);
