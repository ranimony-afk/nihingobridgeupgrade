# Supabase & Cloud Storage Provisioning Guide

**Document Version:** 4.0.0  
**Target Platform:** Supabase Cloud Services  

---

## 1. Database Provisioning

To hook your Nihongo Bridge platform up to a live, production-ready cloud PostgreSQL instance:

1. **Create Supabase Project**
   - Navigate to the [Supabase Dashboard](https://supabase.com) and create a new project.
   - Enter your database name (e.g. `app_db`) and copy the secure database password.

2. **Retrieve Connection String**
   - In Supabase, navigate to **Project Settings** &rarr; **Database**.
   - Copy the **URI Transaction Connection String** (using Port `6543`).
   - Append `?sslmode=require` to the end of your connection string:
     ```env
     DATABASE_URL="postgresql://postgres.yourproject:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
     ```

---

## 2. Cloud Storage Buckets (DAM)

Our Digital Asset Management (DAM) layer uses Supabase Storage. You must provision the following buckets inside your Supabase project:

1. Navigate to **Storage** inside the Supabase left navigation bar.
2. Click **Create New Bucket** and add the following 5 gated buckets:
   - `media`: Main responsive image and video variants.
   - `avatars`: Student profile pictures.
   - `documents`: Legal contracts, guidelines.
   - `downloads`: Printable PDF worksheets, workbooks.
   - `course-assets`: Modular curriculum resources.
3. Configure the buckets as **Public** if client-side downloads are enabled, or **Private** for gated, authenticated, signed-URL access.

*(Expected Storage Dashboard Screenshot Placeholder: [supabase_storage_buckets_list.png])*

---

## 3. Retrieve REST API Credentials
- Copy the public anonymous client key (`SUPABASE_ANON_KEY`) and the private service role administrator key (`SUPABASE_SERVICE_ROLE_KEY`) from **Settings** &rarr; **API** to supply inside your production environment variables.
