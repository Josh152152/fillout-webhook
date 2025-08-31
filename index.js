import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Encryption setup
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

// Webhook route
app.post("/fillout-webhook", async (req, res) => {
  try {
    const data = req.body;

    // 🔍 Extract fields (adjust to match Fillout form names)
    const email = data.email || "";
    const jobTitle = data.job_title || "";
    const responsibilities = data.responsibilities || "";

    console.log("📩 Incoming submission:", { email, jobTitle });

    // 🔐 Encrypt sensitive fields
    const encryptedEmail = encrypt(email);
    const encryptedResponsibilities = encrypt(responsibilities);

    // 🧠 Generate OpenAI embedding
    let embeddingVector = null;
    if (responsibilities.trim().length > 0) {
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: responsibilities,
      });
      embeddingVector = embeddingResponse.data[0].embedding;
    }

    // 💾 Insert public data into Supabase
    const { error: pubError } = await supabase.from("candidate_profiles_public").insert({
      job_title: jobTitle,
      experience_years: 5, // Replace with real value from form later
      skills: ["Python", "AWS", "PostgreSQL"], // Replace with real value
      region: "Remote", // Replace with real value
      education_level: "Bachelor", // Replace with real value
      salary_band: "90k–110k", // Replace with real value
      embedding: embeddingVector,
    });
    if (pubError) {
      console.error("❌ Public insert error:", pubError.message);
      throw pubError;
    }

    // 💾 Insert encrypted fields into second table
    const { error: encError } = await supabase.from("candidate_profiles_encrypted").insert({
      email_ciphertext: encryptedEmail.ciphertext,
      responsibilities_ciphertext: encryptedResponsibilities.ciphertext,
      aspirations_ciphertext: "", // Placeholder
      iv: encryptedEmail.iv,
      tag: encryptedEmail.tag,
    });
    if (encError) {
      console.error("❌ Encrypted insert error:", encError.message);
      throw encError;
    }

    console.log("✅ Submission processed and stored");
    res.status(200).send("Success");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).send("Webhook failed");
  }
});

// Start server
app.listen(3000, () => {
  console.log("🚀 Webhook server running on port 3000");
});
