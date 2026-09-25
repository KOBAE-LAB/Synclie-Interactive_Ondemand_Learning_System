#!/usr/bin/env node
/**
 * Supabase移行用スクリプト(export / import)。
 *
 * Supabase CLIを使わず、supabase-js(service roleキー)だけで
 * publicスキーマの全テーブルとStorage(materials/handwriting/audio)を
 * 別プロジェクトへ複製する。データが数十行程度の開発中プロジェクト向けの簡易版。
 *
 * 使い方:
 *   1. migration-backup/.env に OLD_SUPABASE_URL / OLD_SERVICE_ROLE_KEY
 *      (書き出し用)と NEW_SUPABASE_URL / NEW_SERVICE_ROLE_KEY(投入用)を書く。
 *   2. 書き出し: node --env-file=migration-backup/.env scripts/migrate-supabase.mjs export
 *   3. (新プロジェクトで migration-backup/all_migrations.sql を実行してスキーマを作る)
 *   4. 投入:   node --env-file=migration-backup/.env scripts/migrate-supabase.mjs import
 *
 * 注意:
 *   - キー(SERVICE_ROLE_KEY)は絶対にログに出力しない。
 *   - テーブルは外部キーの依存順に並べてある(親→子の順で投入する)。
 *   - material_chunks.embedding(vector型)は、supabase-jsが返す文字列表現
 *     ("[0.01,0.02,...]")をそのまま書き戻せば、pgvectorが再度vector型として
 *     解釈してくれる(要素を数値配列にパースし直す必要はない)。
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 外部キーの依存順(親テーブルが先)。0001〜0018のマイグレーションを参照して決めた。
const TABLES_IN_DEPENDENCY_ORDER = [
  "organizations",
  "profiles",
  "courses",
  "course_materials",
  "material_chunks",
  "personas",
  "learning_sessions",
  "dialogue_turns",
  "argument_evaluations",
  "portfolio_entries",
  "submissions",
  "evaluation_criteria",
  "submission_feedback",
  "reflections",
  "student_profiles",
  "consent_records",
  "learner_corpus_entries",
  "personalization_suggestions",
  "handwriting_uploads",
  "audio_uploads",
];

const STORAGE_BUCKETS = ["materials", "handwriting", "audio"];

const BACKUP_DIR = path.resolve(process.cwd(), "migration-backup");
const DATA_DIR = path.join(BACKUP_DIR, "data");
const STORAGE_DIR = path.join(BACKUP_DIR, "storage");
const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 200;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `環境変数 ${name} が設定されていません。migration-backup/.env を確認し、` +
        `node --env-file=migration-backup/.env scripts/migrate-supabase.mjs <export|import> の形で実行してください。`,
    );
    process.exit(1);
  }
  return value;
}

function makeClient(urlEnv, keyEnv) {
  const url = requireEnv(urlEnv);
  const key = requireEnv(keyEnv);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchAllRows(client, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} の読み取りに失敗しました: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function listAllObjects(client, bucket, prefix = "") {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`バケット ${bucket}(${prefix || "/"}) の一覧取得に失敗しました: ${error.message}`);

  const files = [];
  for (const entry of data ?? []) {
    // Supabase Storageは「id が無い = フォルダ」として区別する。
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      files.push(...(await listAllObjects(client, bucket, entryPath)));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

async function exportData() {
  const oldClient = makeClient("OLD_SUPABASE_URL", "OLD_SERVICE_ROLE_KEY");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  console.log("=== テーブルの書き出し ===");
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    const rows = await fetchAllRows(oldClient, table);
    fs.writeFileSync(path.join(DATA_DIR, `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`${table}: ${rows.length}件 → data/${table}.json`);
  }

  console.log("\n=== Storageの書き出し ===");
  for (const bucket of STORAGE_BUCKETS) {
    const files = await listAllObjects(oldClient, bucket);
    const bucketDir = path.join(STORAGE_DIR, bucket);
    for (const filePath of files) {
      const { data: blob, error } = await oldClient.storage.from(bucket).download(filePath);
      if (error) throw new Error(`${bucket}/${filePath} のダウンロードに失敗しました: ${error.message}`);
      const destPath = path.join(bucketDir, filePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, Buffer.from(await blob.arrayBuffer()));
    }
    console.log(`${bucket}: ${files.length}件 → storage/${bucket}/`);
  }

  console.log("\n書き出し完了。migration-backup/all_migrations.sql を新プロジェクトのSQL Editorで実行してから import を実行してください。");
}

async function importData() {
  const newClient = makeClient("NEW_SUPABASE_URL", "NEW_SERVICE_ROLE_KEY");

  console.log("=== テーブルへの投入(外部キーの依存順) ===");
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    const filePath = path.join(DATA_DIR, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`${table}: data/${table}.json が無いためスキップ`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (rows.length === 0) {
      console.log(`${table}: 0件(スキップ)`);
      continue;
    }
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
      // upsertにしておくと、失敗して途中から再実行する場合も安全(同じidは上書きになるだけ)。
      const { error } = await newClient.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw new Error(`${table} への投入に失敗しました: ${error.message}`);
    }
    console.log(`${table}: ${rows.length}件を投入`);
  }

  console.log("\n=== Storageへのアップロード ===");
  for (const bucket of STORAGE_BUCKETS) {
    await newClient.storage.createBucket(bucket, { public: false }).catch(() => {
      // 既に存在する場合はエラーになるが無視してよい。
    });
    const bucketDir = path.join(STORAGE_DIR, bucket);
    if (!fs.existsSync(bucketDir)) {
      console.log(`${bucket}: storage/${bucket}/ が無いためスキップ`);
      continue;
    }
    const files = listLocalFilesRecursive(bucketDir);
    for (const relativePath of files) {
      const buffer = fs.readFileSync(path.join(bucketDir, relativePath));
      const { error } = await newClient.storage
        .from(bucket)
        .upload(relativePath, buffer, { upsert: true });
      if (error) throw new Error(`${bucket}/${relativePath} のアップロードに失敗しました: ${error.message}`);
    }
    console.log(`${bucket}: ${files.length}件をアップロード`);
  }

  console.log("\n=== 行数の比較(旧=JSONファイル / 新=投入後のDB) ===");
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    const filePath = path.join(DATA_DIR, `${table}.json`);
    const oldCount = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")).length : 0;
    const { count, error } = await newClient.from(table).select("*", { count: "exact", head: true });
    const newCount = error ? `ERROR: ${error.message}` : count;
    const mark = newCount === oldCount ? "OK" : "!!";
    console.log(`[${mark}] ${table}: 旧${oldCount}件 / 新${newCount}件`);
  }
}

function listLocalFilesRecursive(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listLocalFilesRecursive(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}

async function main() {
  const mode = process.argv[2];
  if (mode === "export") {
    await exportData();
  } else if (mode === "import") {
    await importData();
  } else {
    console.error("使い方: node --env-file=migration-backup/.env scripts/migrate-supabase.mjs <export|import>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
