import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

app.post("/fillout-webhook", async (req, res) => {
  const data = req.body;

  const email = data.email;
  const jobTitle = data.job_title;
  const responsibilities = data.responsibilities;

  const encryptedEmail = encrypt(email);
  const encryptedResponsibilities = encrypt(responsibilities);

  await supabase.from("candidate_profiles_public").insert({
    job_title: jobTitle,
    experience_years: 5,
    skills: ["Python", "AWS", "PostgreSQL"],
    region: "Remote",
    education_level: "Bachelor",
    salary_band: "90k–110k",
    embedding: null,
  });

  await supabase.from("candidate_profiles_encrypted").insert({
    email_ciphertext: encryptedEmail.ciphertext,
    responsibilities_ciphertext: encryptedResponsibilities.ciphertext,
    aspirations_ciphertext: "",
    iv: encryptedEmail.iv,
    tag: encryptedEmail.tag,
  });

  res.status(200).send("Success");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
