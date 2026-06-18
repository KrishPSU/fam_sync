// One-time backfill: index every existing card attachment for the AI assistant.
// Run once from the project root after applying db/07_ai_file_index.sql:
//   node scripts/backfill-ai-chunks.js
// Safe to re-run — files already marked 'done' are skipped; others are re-tried.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { indexCardFile } = require('../file-indexer');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  const PAGE = 100;
  let from = 0, processed = 0, skipped = 0;

  for (;;) {
    const { data: files, error } = await supabaseAdmin
      .from('card_files')
      .select('id, file_name, file_path, family_id')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error('Failed to read card_files:', error.message); process.exit(1); }
    if (!files || files.length === 0) break;

    for (const f of files) {
      const { data: existing } = await supabaseAdmin
        .from('ai_file_documents')
        .select('status')
        .eq('card_file_id', f.id)
        .maybeSingle();
      if (existing && existing.status === 'done') { skipped++; continue; }

      console.log('Indexing:', f.file_name);
      await indexCardFile(supabaseAdmin, f);
      processed++;
    }

    if (files.length < PAGE) break;
    from += PAGE;
  }

  console.log(`Done. Indexed ${processed} file(s), skipped ${skipped} already-indexed.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
