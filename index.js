import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Init Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Init OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AES encryption setup
const algorithm = "aes-256-gcm";
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, "hex");

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

// Webhook endpoint for Fillout
app.post("/fillout-webhook", async (req, res) => {
  try {
    const data = req.body;

    // 🧾 Get fields from Fillout payload (update these to match actual form field names)
    const email = data.email;
    const jobTitle = data.job_title;
    const responsibilities = data.responsibilities;

    // 🔐 Encrypt sensitive fields
    const encryptedEmail = encrypt(email);
    const encryptedResponsibilities = encrypt(responsibilities);

    // 🧠 Generate OpenAI embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: responsibilities,
    });
    const embeddingVector = embeddingResponse.data[0].embedding;

    // 💾 Insert public profile into Supabase
    const { error: pubError } = await supabase.from("candidate_profiles_public").insert({
      job_title: jobTitle,
      experience_years: 5,
      skills: ["Python", "AWS", "PostgreSQL"],
      region: "Remote",
      education_level: "Bachelor",
      salary_band: "90k–110k",
      embedding: embeddingVector,
    });
    if (pubError) throw pubError;

    // 💾 Insert encrypted fields into second table
    const { error: encError } = await supabase.from("candidate_profiles_encrypted").insert({
      email_ciphertext: encryptedEmail.ciphertext,
      responsibilities_ciphertext: encryptedResponsibilities.ciphertext,
      aspirations_ciphertext: "",
      iv: encryptedEmail.iv,
      tag: encryptedEmail.tag,
    });
    if (encError) throw encError;

    res.status(200).send("Success");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Webhook failed");
  }
});

// Start server
app.listen(3000, () => {
  console.log("✅ Webhook server running on port 3000");
});
