// Edge Function "ocr-payslip": legge un documento busta paga già caricato
// (Storage bucket privato "payslips") e ne estrae, tramite un modello Claude
// con vision, le ore dichiarate di ferie/ROL/permesso. Richiede il secret
// ANTHROPIC_API_KEY sul progetto Supabase (dashboard → Edge Functions →
// Secrets, o `supabase secrets set ANTHROPIC_API_KEY=...`): senza quella
// chiave la funzione risponde 501 e il pulsante "Leggi automaticamente
// (OCR)" nell'app degrada all'inserimento manuale senza bloccare l'utente.
//
// Non imposta MAI verified=true: un umano deve sempre controllare e
// confermare i numeri prima che contino nel confronto (vedi commento sulla
// colonna "verified" in SUPABASE_SCHEMA.sql).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// supabase.functions.invoke() dal browser è una chiamata cross-origin (l'app
// gira su un altro dominio rispetto a *.supabase.co): senza questi header e
// senza gestire la preflight OPTIONS, il browser blocca la risposta ancora
// prima che arrivi al codice della pagina — la funzione fallirebbe sempre,
// indipendentemente da ANTHROPIC_API_KEY.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo non supportato." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Autenticazione richiesta." }, 401);
  }

  // Client autenticato come l'utente chiamante: la RLS su payslip_documents
  // e storage.objects garantisce che possa leggere/aggiornare solo il
  // proprio documento (o un documento qualsiasi se admin).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  let documentId: string | undefined;
  try {
    const body = await req.json();
    documentId = body?.documentId;
  } catch {
    // gestito sotto come documentId mancante
  }
  if (!documentId) {
    return jsonResponse({ error: "documentId mancante." }, 400);
  }

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse(
      { error: "OCR non configurato: manca il secret ANTHROPIC_API_KEY sul progetto Supabase." },
      501
    );
  }

  const { data: doc, error: docError } = await supabase
    .from("payslip_documents")
    .select("id, file_path, file_mime")
    .eq("id", documentId)
    .maybeSingle();
  if (docError || !doc) {
    return jsonResponse({ error: docError?.message || "Documento non trovato." }, 404);
  }

  await supabase.from("payslip_documents").update({ ocr_status: "in_corso" }).eq("id", documentId);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("payslips")
      .download(doc.file_path);
    if (downloadError || !fileBlob) {
      throw new Error(downloadError?.message || "Impossibile scaricare il file dal bucket payslips.");
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const mime = doc.file_mime || fileBlob.type || "application/pdf";
    const isPdf = mime.includes("pdf");

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mime, data: base64 } };

    const prompt = `Questa è una busta paga italiana. Estrai SOLO queste informazioni e rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo aggiuntivo prima o dopo:
{
  "ferie_ore_dichiarate": <ore di ferie indicate in busta come numero, o null se non presenti>,
  "rol_ore_dichiarate": <ore di ROL/riduzione orario lavoro indicate in busta come numero, o null se non presenti>,
  "permesso_ore_dichiarate": <ore di permesso indicate in busta come numero, o null se non presenti>,
  "note": "<breve nota su cosa hai trovato o eventuali ambiguità, max 200 caratteri>"
}
Se in busta i valori sono espressi in giorni invece che in ore, convertili in ore assumendo 8 ore per giorno lavorativo e scrivilo nella nota.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      throw new Error(`Errore API modello (${anthropicResponse.status}): ${errText.slice(0, 300)}`);
    }

    const anthropicData = await anthropicResponse.json();
    const rawText = (anthropicData.content || [])
      .map((block: { text?: string }) => block.text || "")
      .join("")
      .trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Risposta del modello non contiene JSON valido.");
    const extracted = JSON.parse(jsonMatch[0]);

    const update = {
      ocr_status: "completato",
      ocr_raw_text: rawText.slice(0, 5000),
      ferie_ore_dichiarate: typeof extracted.ferie_ore_dichiarate === "number" ? extracted.ferie_ore_dichiarate : null,
      rol_ore_dichiarate: typeof extracted.rol_ore_dichiarate === "number" ? extracted.rol_ore_dichiarate : null,
      permesso_ore_dichiarate:
        typeof extracted.permesso_ore_dichiarate === "number" ? extracted.permesso_ore_dichiarate : null,
    };
    const { error: updateError } = await supabase.from("payslip_documents").update(update).eq("id", documentId);
    if (updateError) throw new Error(updateError.message);

    return jsonResponse(update, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("OCR busta paga:", message);
    await supabase
      .from("payslip_documents")
      .update({ ocr_status: "fallito", ocr_raw_text: message.slice(0, 2000) })
      .eq("id", documentId);
    return jsonResponse({ error: message }, 500);
  }
});
