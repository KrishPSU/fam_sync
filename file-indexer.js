// Extracts text from card attachments and stores it as searchable chunks so the
// AI assistant can answer questions about file contents. Writes use the admin
// (service-role) client — RLS is enforced later on the READ path via userSupabase.
const path = require('path');
// Import the lib entry directly: the package index runs a debug block that reads
// a sample PDF off disk when required as a "main" module, which throws in prod.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');

const TEXT_EXTS  = new Set(['.txt', '.md', '.csv', '.json', '.log']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic']);

// ~1000-token chunks with ~100-token overlap, approximated by word count.
const WORDS_PER_CHUNK = 800;
const WORD_OVERLAP    = 80;

function chunkText(text) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const chunks = [];
  if (words.length === 0) return chunks;
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(' '));
    if (i + WORDS_PER_CHUNK >= words.length) break;
    i += WORDS_PER_CHUNK - WORD_OVERLAP;
  }
  return chunks;
}

// Returns extracted text, or null if the type isn't supported in V1.
async function extractText(buffer, ext) {
  if (TEXT_EXTS.has(ext)) return buffer.toString('utf8');
  if (ext === '.pdf')  { const r = await pdfParse(buffer);                 return r.text  || ''; }
  if (ext === '.docx') { const r = await mammoth.extractRawText({ buffer }); return r.value || ''; }
  return null;
}

async function setStatus(supabaseAdmin, documentId, status, error = null) {
  await supabaseAdmin.from('ai_file_documents').update({ status, error }).eq('id', documentId);
}

// Index a single card_files row ({ id, file_name, file_path, family_id }).
// Idempotent: re-running replaces the document's chunks. Never throws — failures
// are recorded on the document row so the upload path can fire-and-forget.
async function indexCardFile(supabaseAdmin, cardFile) {
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('ai_file_documents')
    .upsert(
      { card_file_id: cardFile.id, family_id: cardFile.family_id, status: 'pending', error: null },
      { onConflict: 'card_file_id' }
    )
    .select()
    .single();
  if (docErr || !doc) return;

  // Clear any prior chunks so a re-index doesn't duplicate content.
  await supabaseAdmin.from('ai_file_chunks').delete().eq('document_id', doc.id);

  const ext = path.extname(cardFile.file_name || cardFile.file_path || '').toLowerCase();

  try {
    if (IMAGE_EXTS.has(ext)) { await setStatus(supabaseAdmin, doc.id, 'image'); return; }

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('card-attachments')
      .download(cardFile.file_path);
    if (dlErr || !blob) throw new Error('download failed: ' + (dlErr && dlErr.message));

    const buffer = Buffer.from(await blob.arrayBuffer());
    const text = await extractText(buffer, ext);
    if (text === null) { await setStatus(supabaseAdmin, doc.id, 'unsupported'); return; }

    const chunks = chunkText(text);
    if (chunks.length > 0) {
      const rows = chunks.map((content, idx) => ({
        document_id: doc.id, family_id: cardFile.family_id, chunk_index: idx, content
      }));
      const { error: insErr } = await supabaseAdmin.from('ai_file_chunks').insert(rows);
      if (insErr) throw insErr;
    }
    await setStatus(supabaseAdmin, doc.id, 'done');
  } catch (err) {
    // Failure is recorded on the document row (status + error), not the console.
    await setStatus(supabaseAdmin, doc.id, 'error', err.message);
  }
}

module.exports = { indexCardFile, chunkText, extractText };
