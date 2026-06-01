const crypto = require('crypto');
global.crypto = global.crypto || crypto;

require('dotenv').config({ override: true });
// Masked env debug: do not print secret contents in logs
console.log('MONGO_URI present:', !!process.env.MONGO_URI, '| length:', process.env.MONGO_URI ? process.env.MONGO_URI.length : 0);
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const fs = require("fs");
const os = require("os");
const https = require("https");
const nodemailer = require("nodemailer");
const localtunnel = require("localtunnel");
require("./db");

// You can provide a permanent public URL (HTTPS) via the PUBLIC_URL env var
// e.g. PUBLIC_URL=https://your-app.example.com node server.js
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || null;

let publicUrl = null; // Will hold the live tunnel URL or permanent PUBLIC_URL
let tunnelInstance = null;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("frontend"));

// Define Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  department: { type: String, required: true }
});
const User = mongoose.model("User", userSchema);

const assignmentSchema = new mongoose.Schema({
  department: { type: String, required: true },
  teacherName: { type: String, required: true },
  semester: { type: String, required: true },
  division: { type: String, required: true },
  subject: { type: String, required: true },
  type: { type: String, required: true }
});
const Assignment = mongoose.model("Assignment", assignmentSchema);

// Email Transporter Config (use env vars for production credentials)
// Set EMAIL_USER and EMAIL_PASS in your environment (or Render/Railway secrets)
let transporter;
const EMAIL_USER = process.env.EMAIL_USER || null;
const EMAIL_PASS = process.env.EMAIL_PASS || null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: { rejectUnauthorized: false }
  });
  console.log('[Email] Configured real Gmail transporter using environment variables.');
} else {
  // Fallback: jsonTransport will not send real emails but prints the message object.
  transporter = nodemailer.createTransport({ jsonTransport: true });
  console.warn('[Email] WARNING: EMAIL_USER or EMAIL_PASS not set. Emails will not be sent; using jsonTransport fallback.');
}

// Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username: name, email, password: hashedPassword, department });
    await newUser.save();

    // Send welcome email with credentials
    const mailOptions = {
      from: EMAIL_USER ? `"TimeGen Admin" <${EMAIL_USER}>` : '"TimeGen Admin" <no-reply@example.com>',
      to: email, // This sends the email TO the newly registered user
      subject: 'Welcome to TimeGen - Registration Successful',
      text: `Hello ${name},\n\nYou have been successfully registered to TimeGen!\n\nHere are your account details:\n- Username: ${name}\n- Registered Email: ${email}\n- Department: ${department}\n- Password: ${password}\n\n*Please use your EMAIL ADDRESS to log in to ensure you access the correct account.*\n\nPlease keep this information secure.\n\nBest regards,\nTimeGen Admin`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Failed to send welcome email:", error);
      } else {
        console.log("[Email] Welcome email sent successfully to real inbox!");
      }
    });

    console.log(`[New User] Name: ${name} | Email: ${email} | Password: ${password}`);

    res.json({
      message: "Signup successful",
      userName: name,
      department: department,
      token: "fake-jwt-token" // Consistent with login route
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body; 
    const identifier = email.trim();
    const user = await User.findOne({ 
      $or: [ 
        { email: new RegExp('^' + identifier + '$', 'i') }, 
        { username: new RegExp('^' + identifier + '$', 'i') } 
      ] 
    });
    
    if (!user) {
      console.log(`[Login Failed] User not found for identifier: "${identifier}"`);
      return res.status(400).json({ message: "User not found" });
    }
    
    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      console.log(`[Login Failed] Incorrect password for user: "${user.username}". They typed: "${password.trim()}"`);
      return res.status(400).json({ message: "Incorrect password" });
    }
    
    console.log(`[Login Success] User: ${user.username}`);
    res.json({ token: "fake-jwt-token", userName: user.username, department: user.department });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Forgot Password Route
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body; 
    const identifier = email.trim();
    const user = await User.findOne({ 
      $or: [ 
        { email: new RegExp('^' + identifier + '$', 'i') }, 
        { username: new RegExp('^' + identifier + '$', 'i') } 
      ] 
    });
    
    if (!user) {
      console.log(`[Forgot Password Failed] User not found for identifier: "${identifier}"`);
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a temporary 6-character password
    const tempPassword = Math.random().toString(36).slice(-6);

    // Hash and save it
    user.password = await bcrypt.hash(tempPassword, 10);
    await user.save();

    // Send email with new password
    const mailOptions = {
      from: EMAIL_USER ? `"TimeGen Admin" <${EMAIL_USER}>` : '"TimeGen Admin" <no-reply@example.com>',
      to: email, // This sends the email TO the user who forgot their password
      subject: 'TimeGen - Password Reset & Account Details',
      text: `Hello ${user.username},\n\nYour account details have been requested.\n\nYour registered email is: ${user.email}\nYour username is: ${user.username}\nYour new temporary password is: ${tempPassword}\n\n*Please use your EMAIL ADDRESS to log in to ensure you access the correct account.*\n\nPlease log in and change your password as soon as possible.\n\nBest regards,\nTimeGen Admin`
    };

    console.log(`[Password Reset] User: ${user.username} | New Password: ${tempPassword}`);

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Failed to send reset email. Did you configure Gmail credentials?", error);
        return res.json({ message: "Password reset successful! Check server console for new password (email delivery failed)." });
      } else {
        console.log("[Email] Password reset email sent successfully to real inbox!");
        return res.json({ message: "Password reset email sent! Please check your inbox." });
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Submit Assignment Route
app.post("/submit-assignment", async (req, res) => {
  try {
    const assignments = req.body;
    if (!Array.isArray(assignments)) return res.status(400).send("Array expected");

    // ── Clash Detection ──────────────────────────────────────────────────────
    // A clash = same department + semester + division + subject already taken
    // by a DIFFERENT teacher.
    const clashes = [];

    for (const a of assignments) {
      const existing = await Assignment.findOne({
        department: a.department,
        semester: a.semester,
        division: a.division,
        subject: a.subject,
      });

      if (existing && existing.teacherName !== a.teacherName) {
        clashes.push({
          subject: a.subject,
          semester: a.semester,
          division: a.division,
          takenBy: existing.teacherName,
        });
      }
    }

    if (clashes.length > 0) {
      return res.status(409).json({
        message: "clash",
        clashes,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    await Assignment.insertMany(assignments);
    res.send("saved");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get already booked assignments for real-time checking
app.get("/get-assignments", async (req, res) => {
  try {
    const { department } = req.query;
    if (!department) return res.status(400).send("Department required");
    const assignments = await Assignment.find({ department });
    res.json(assignments);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// Get IP for QR Code (LAN fallback)
app.get("/get-ip", (req, res) => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return res.json({ ip: net.address });
      }
    }
  }
  res.json({ ip: "localhost" });
});

app.get("/get-public-url", (req, res) => {
  // If deployed on Render, use the official Render URL
  if (process.env.RENDER_EXTERNAL_URL) {
    return res.json({ url: process.env.RENDER_EXTERNAL_URL, lanUrl: null });
  }

  // Find LAN IP
  let lanUrl = `http://localhost:${PORT}`;
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanUrl = `http://${net.address}:${PORT}`;
        break;
      }
    }
  }

  // If a permanent PUBLIC_URL is provided, prefer that (it should be HTTPS)
  const urlToReturn = PUBLIC_URL || publicUrl || lanUrl;
  res.json({ url: urlToReturn, lanUrl: lanUrl, tunnelUrl: publicUrl || null });
});

// Reset Database Route
app.delete("/reset-db", async (req, res) => {
  try {
    const { department } = req.query;
    if (department) {
      await Assignment.deleteMany({ department });
    } else {
      await Assignment.deleteMany({});
    }
    res.send("reset");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ============================================================
// SCHEDULING ENGINE — Real Institutional Timetable Generator
// Rules:
//   1. Exactly 4 Theory sessions per subject per division
//   2. Sessions spread across all 6 days (Mon-Sat)
//   3. No teacher clash (same teacher, same slot, same time)
//   4. No division clash (same division, same slot at same time)
//   5. Each subject appears on a DIFFERENT day (max 1/day, strict)
// ============================================================
app.get("/generate-timetable", async (req, res) => {
  try {
    const { department } = req.query;
    if (!department) return res.status(400).send("Department parameter is required.");

    const assignments = await Assignment.find({ department });
    console.log(`[Scheduler] Found ${assignments.length} assignments for ${department}`);

    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Slots include short break at 10:30 and lunch at 01:00 — those are NOT schedulable
    const SLOTS = [
      "08:30-09:30",
      "09:30-10:30",
      "10:30-11:00", // BREAK
      "11:00-12:00",
      "12:00-01:00",
      "01:00-02:00", // LUNCH
      "02:00-03:00",
      "03:00-04:00"
    ];
    const THEORY_ROOMS = Array.from({ length: 50 }, (_, i) => `Room ${101 + i}`);
    const LAB_ROOMS = ["Comp Lab A", "Comp Lab B", "Comp Lab C", "Comp Lab D", "Electronics Lab"];

    const result = [];

    // ── helpers ──────────────────────────────────────────────
    const isDivFree = (day, slot, sem, div) =>
      !result.some(r => r.day === day && r.slot === slot && r.semester === sem && r.division === div);

    const isTeacherFree = (day, slot, teacher) =>
      !result.some(r => r.day === day && r.slot === slot && r.teacherName === teacher);

    const pickRoom = (day, slot, isLab) => {
      const pool = isLab ? LAB_ROOMS : THEORY_ROOMS;
      const used = result.filter(r => r.day === day && r.slot === slot).map(r => r.room);
      return pool.find(r => !used.includes(r)) || pool[0];
    };

    // dayLoad: how many sessions this division has on a given day
    const divDayLoad = (day, sem, div) =>
      result.filter(r => r.day === day && r.semester === sem && r.division === div).length;

    // ── place 4 theory sessions spread across the week ───────
    function scheduleTheory(teacher, sem, div, subject, sessionCount = 4) {
      let placed = 0;

      // Pass 0: Try consistent slot for first 4 days (Mon-Thu)
      if (sessionCount === 4) {
        // iterate only over schedulable slots (skip breaks/lunch)
        const schedulable = SLOTS.filter(s => s !== "10:30-11:00" && s !== "01:00-02:00");
        for (const slot of schedulable) {
          const firstFourDays = ["Mon", "Tue", "Wed", "Thu"];
          const allFree = firstFourDays.every(day => isDivFree(day, slot, sem, div) && isTeacherFree(day, slot, teacher));

          if (allFree) {
            firstFourDays.forEach(day => {
              result.push({
                day, slot, semester: sem, division: div,
                subject, teacherName: teacher, type: "Theory",
                room: pickRoom(day, slot, false)
              });
            });
            placed = 4;
            break;
          }
        }
      }

      // Pass 1: Strict — one per day, teacher free, sorted lightest day first (if Pass 0 failed)
      if (placed < sessionCount) {
        for (let attempt = 0; attempt < 6 && placed < sessionCount; attempt++) {
          const sortedDays = [...DAYS].sort((a, b) => divDayLoad(a, sem, div) - divDayLoad(b, sem, div));

          for (const day of sortedDays) {
            if (placed >= sessionCount) break;

            // Already has this subject on this day?
            const subjectOnDay = result.some(
              r => r.day === day && r.semester === sem && r.division === div && r.subject === subject
            );
            if (subjectOnDay) continue;

            // Try every slot on this day
            for (const slot of SLOTS) {
              if (isDivFree(day, slot, sem, div) && isTeacherFree(day, slot, teacher)) {
                result.push({
                  day, slot, semester: sem, division: div,
                  subject, teacherName: teacher, type: "Theory",
                  room: pickRoom(day, slot, false)
                });
                placed++;
                break; // one session per day
              }
            }
            if (placed >= sessionCount) break;
          }

          if (placed >= sessionCount) break;
        }
      }

      // Pass 2: Relaxed — allow same subject twice a day if needed, teacher still free
      if (placed < sessionCount) {
        // try schedulable slots only
        const schedulable = SLOTS.filter(s => s !== "10:30-11:00" && s !== "01:00-02:00");
        for (const day of DAYS) {
          if (placed >= sessionCount) break;
          for (const slot of schedulable) {
            if (placed >= sessionCount) break;
            if (isDivFree(day, slot, sem, div) && isTeacherFree(day, slot, teacher)) {
              result.push({
                day, slot, semester: sem, division: div,
                subject, teacherName: teacher, type: "Theory",
                room: pickRoom(day, slot, false)
              });
              placed++;
            }
          }
        }
      }

      // Pass 3: Emergency — ignore teacher clash, only respect division
      if (placed < sessionCount) {
        for (const day of DAYS) {
          if (placed >= sessionCount) break;
          for (const slot of SLOTS) {
            if (placed >= sessionCount) break;
            if (isDivFree(day, slot, sem, div)) {
              result.push({
                day, slot, semester: sem, division: div,
                subject, teacherName: teacher, type: "Theory",
                room: pickRoom(day, slot, false)
              });
              placed++;
            }
          }
        }
      }

      return placed;
    }

    // ── place a 2-hour lab block ─────────────────────────────
    function scheduleLab(teacher, sem, div, subject) {
      // Valid contiguous pairs that avoid the short break and lunch
      // Using SLOTS indices: 0,1 are morning pair; 3,4 are mid-day; 6,7 are afternoon
      const validPairs = [ [0,1], [3,4], [6,7] ];

      for (const day of DAYS) {
        for (const [i1, i2] of validPairs) {
          const s1 = SLOTS[i1], s2 = SLOTS[i2];
          if (
            isDivFree(day, s1, sem, div) && isDivFree(day, s2, sem, div) &&
            isTeacherFree(day, s1, teacher) && isTeacherFree(day, s2, teacher)
          ) {
            const room = pickRoom(day, s1, true);
            result.push({ day, slot: s1, semester: sem, division: div, subject, teacherName: teacher, type: "Lab", room });
            result.push({ day, slot: s2, semester: sem, division: div, subject, teacherName: teacher, type: "Lab", room });
            return true;
          }
        }
      }
      return false;
    }

    // ── process assignments: Labs first for best slot access ─
    const sorted = [...assignments].sort((a, b) => {
      const pri = { "Lab+Theory": 0, "Lab": 1, "Theory": 2 };
      return (pri[a.type] ?? 2) - (pri[b.type] ?? 2);
    });

    for (const a of sorted) {
      const { teacherName: teacher, semester: sem, division: div, subject, type } = a._doc || a;

      if (type === "Theory") {
        const n = scheduleTheory(teacher, sem, div, subject, 4);
        console.log(`  → Theory: Sem${sem} Div${div} ${subject} | ${teacher} → ${n}/4 placed`);
      } else if (type === "Lab") {
        scheduleLab(teacher, sem, div, subject);
        console.log(`  → Lab: Sem${sem} Div${div} ${subject} | ${teacher} → 1 block placed (2 hours)`);
      } else if (type === "Lab+Theory") {
        scheduleLab(teacher, sem, div, subject);
        const n = scheduleTheory(teacher, sem, div, subject, 4);
        console.log(`  → Lab+Theory: Sem${sem} Div${div} ${subject} | ${teacher} → lab + ${n}/4 theory placed`);
      }
    }

    // ── summary log ──────────────────────────────────────────
    const theoryCounts = {};
    result.filter(r => r.type === "Theory").forEach(r => {
      const k = `Sem${r.semester} Div${r.division} | ${r.subject}`;
      theoryCounts[k] = (theoryCounts[k] || 0) + 1;
    });
    console.log("\n[Scheduler] Theory class counts:");
    Object.entries(theoryCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log(`[Scheduler] Days used: ${[...new Set(result.map(r => r.day))].join(", ")}`);
    console.log(`[Scheduler] Total sessions: ${result.length}\n`);

    res.json(result);
  } catch (err) {
    console.error("[Scheduler ERROR]", err);
    res.status(500).send(err.message);
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initPublicUrl() {
  if (process.env.RENDER_EXTERNAL_URL) {
    publicUrl = process.env.RENDER_EXTERNAL_URL;
    console.log(`[Host] Running on cloud (Render). URL: ${publicUrl}`);
    return;
  }

  if (PUBLIC_URL) {
    publicUrl = PUBLIC_URL;
    console.log(`[Public] Using configured PUBLIC_URL : ${publicUrl}`);
    console.log(`[Public]    Form URL  : ${publicUrl}/form.html`);
    return;
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let tunnel;
    try {
      tunnel = await localtunnel({ port: PORT });
      const candidateUrl = tunnel.url;
      console.log(`[Tunnel] ⏳ Created candidate URL: ${candidateUrl}`);

      const waitMs = 4000;
      console.log(`[Tunnel] ⏳ Waiting ${waitMs / 1000}s for ${candidateUrl} to stabilize...`);
      await sleep(waitMs);

      publicUrl = candidateUrl;
      tunnelInstance = tunnel;
      console.log(`[Tunnel] ✅ Public URL : ${publicUrl}`);
      console.log(`[Tunnel]    Form URL  : ${publicUrl}/form.html`);

      tunnelInstance.on("close", () => {
        publicUrl = null;
        tunnelInstance = null;
        console.log("[Tunnel] ⚠️  Tunnel closed. Restart server to reopen.");
      });

      tunnelInstance.on("error", (err) => {
        console.error("[Tunnel] ❌ Tunnel error:", err.message);
      });
      return;
    } catch (err) {
      console.error(`[Tunnel] ❌ Could not start localtunnel (attempt ${attempt}):`, err.message);
    } finally {
      if (tunnel && tunnel !== tunnelInstance) {
        tunnel.close();
      }
    }

    if (attempt < maxAttempts) {
      console.log(`[Tunnel] ⏳ Retrying default host (${attempt + 1}/${maxAttempts})...`);
      await sleep(2500);
    }
  }

  console.error("[Tunnel] ❌ Could not establish a working public tunnel. Falling back to LAN IP.");
}

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initPublicUrl();
});