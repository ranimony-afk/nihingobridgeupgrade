# Local Development Setup Guide

**Document Version:** 4.0.0  
**Scope:** Running the Nihongo Bridge Platform Locally  

---

## 1. Prerequisites

Ensure your system has the following core runtimes installed:
- **Node.js**: v22 LTS (or higher)
- **PostgreSQL**: v16 (or higher) running locally or remotely
- **npm**: v10 (or higher)

---

## 2. Step-by-Step Installation Runbook

### Step 1: Clone the Repository
Extract the ZIP archive and navigate to the project directory:
```bash
cd nihongobridge
```

### Step 2: Configure Environment Variables
Copy the template environment configuration:
```bash
cp .env.example .env
```
Open the `.env` file and verify or update the connection variables:
```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_db"
NEXTAUTH_SECRET="dev-secret-key-32-characters-long"
```

### Step 3: Run the Centralized Bootstrap Setup
Our custom setup script automates local database creation, migrations application, and seeding:
```bash
npm run setup
```
*(Expected Output Screenshot Placeholder: [setup_successful_terminal_output.png])*

### Step 4: Boot the Next.js Development Server
Start the Next.js App Router compiler in Turbopack mode:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000` to inspect the visual Japanese Learning Portal!

---

## 3. Local Verification Testing
Run the automated test suite to verify 100% liveness:
```bash
npm run test
```
*(Expected Output Screenshot Placeholder: [test_suite_passing_logs.png])*
