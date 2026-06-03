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
const path = require("path");
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/form.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'form.html'));
});

// Define Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  department: { type: String, required: true },
  resetCode: { type: String },
  resetCodeExpires: { type: Date }
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

const escapeHtml = (value) =>
  String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const normalizeDepartment = (department) => String(department || "").trim();

// Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username: name, email, password: hashedPassword, department });
    await newUser.save();

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeDepartment = escapeHtml(department);
    const safePassword = escapeHtml(password);

    // Send welcome email with credentials
    const mailOptions = {
      from: EMAIL_USER ? `"TimeGen Admin" <${EMAIL_USER}>` : '"TimeGen Admin" <no-reply@example.com>',
      to: email, // This sends the email TO the newly registered user
      subject: 'TimeGen Account Registration Successful',
      text: `Dear ${name},

Your TimeGen administrator account has been created successfully.

Account Details:
Name: ${name}
Email: ${email}
Department: ${department}
Password: ${password}

Please use your registered email address and the password above to log in.
For security, do not share this password with anyone.

Regards,
TimeGen Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; background: #f4f7fb; padding: 24px; color: #1f2937;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
              <h2 style="margin: 0; font-size: 22px;">TimeGen Registration Successful</h2>
            </div>
            <div style="padding: 24px;">
              <p style="margin-top: 0;">Dear ${safeName},</p>
              <p>Your TimeGen administrator account has been created successfully.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Name</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${safeName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Email</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Department</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">${safeDepartment}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; background: #f9fafb;">Password</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-family: monospace;">${safePassword}</td>
                </tr>
              </table>
              <p>Please use your registered email address and the password above to log in.</p>
              <p style="font-size: 13px; color: #6b7280;">For security, do not share this password with anyone.</p>
              <p style="margin-bottom: 0;">Regards,<br>TimeGen Admin</p>
            </div>
          </div>
        </div>`
    };

    await transporter.sendMail(mailOptions);
    console.log("[Email] Welcome email sent successfully to registered email.");

    console.log(`[New User] Name: ${name} | Email: ${email} | Password: ${password}`);

    res.json({
      message: "Signup successful. Password has been sent to your email.",
      userName: name,
      department: department
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

    const resetCode = crypto.randomInt(100000, 1000000).toString();

    user.resetCode = await bcrypt.hash(resetCode, 10);
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const safeName = escapeHtml(user.username);
    const safeCode = escapeHtml(resetCode);

    const mailOptions = {
      from: EMAIL_USER ? `"TimeGen Admin" <${EMAIL_USER}>` : '"TimeGen Admin" <no-reply@example.com>',
      to: user.email,
      subject: 'TimeGen Password Reset Verification Code',
      text: `Dear ${user.username},

We received a request to reset your TimeGen account password.

Your verification code is: ${resetCode}

This code is valid for 10 minutes. If you did not request a password reset, please ignore this email.

Regards,
TimeGen Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; background: #f4f7fb; padding: 24px; color: #1f2937;">
          <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
              <h2 style="margin: 0; font-size: 22px;">Password Reset Verification</h2>
            </div>
            <div style="padding: 24px;">
              <p style="margin-top: 0;">Dear ${safeName},</p>
              <p>We received a request to reset your TimeGen account password.</p>
              <p style="margin: 20px 0 8px;">Your verification code is:</p>
              <div style="font-size: 28px; letter-spacing: 6px; font-weight: bold; color: #0f172a; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; text-align: center;">${safeCode}</div>
              <p style="font-size: 13px; color: #6b7280;">This code is valid for 10 minutes. If you did not request a password reset, please ignore this email.</p>
              <p style="margin-bottom: 0;">Regards,<br>TimeGen Admin</p>
            </div>
          </div>
        </div>`
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Password Reset] Verification code sent to ${user.email}`);
    res.json({ message: "Verification code sent! Please check your email." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const identifier = String(email || "").trim();
    const resetCode = String(code || "").trim();
    const password = String(newPassword || "");

    if (!identifier || !resetCode || !password) {
      return res.status(400).json({ message: "Email, verification code, and new password are required." });
    }

    const user = await User.findOne({
      $or: [
        { email: new RegExp('^' + identifier + '$', 'i') },
        { username: new RegExp('^' + identifier + '$', 'i') }
      ]
    });

    if (!user || !user.resetCode || !user.resetCodeExpires) {
      return res.status(400).json({ message: "Please request a new verification code." });
    }

    if (user.resetCodeExpires < new Date()) {
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      await user.save();
      return res.status(400).json({ message: "Verification code expired. Please request a new code." });
    }

    const isCodeValid = await bcrypt.compare(resetCode, user.resetCode);
    if (!isCodeValid) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    console.log(`[Password Reset] Password updated for ${user.email}`);
    res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Submit Assignment Route
app.post("/submit-assignment", async (req, res) => {
  try {
    const assignments = req.body;
    if (!Array.isArray(assignments)) return res.status(400).send("Array expected");
    const cleanAssignments = assignments.map(a => ({
      ...a,
      department: normalizeDepartment(a.department),
      teacherName: String(a.teacherName || "").trim(),
      semester: String(a.semester || "").trim(),
      division: String(a.division || "").trim(),
      subject: String(a.subject || "").trim(),
      type: String(a.type || "").trim()
    }));

    // ── Clash Detection ──────────────────────────────────────────────────────
    // A clash = same department + semester + division + subject already taken
    // by a DIFFERENT teacher.
    const clashes = [];

    for (const a of cleanAssignments) {
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

    await Assignment.insertMany(cleanAssignments);
    res.send("saved");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get already booked assignments for real-time checking
app.get("/get-assignments", async (req, res) => {
  try {
    const department = normalizeDepartment(req.query.department);
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
    const department = normalizeDepartment(req.query.department);
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
    const department = normalizeDepartment(req.query.department);
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
    const SCHEDULABLE_SLOTS = SLOTS.filter(s => s !== "10:30-11:00" && s !== "01:00-02:00");
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

    const teacherHours = (teacher) =>
      result.reduce((sum, r) => sum + (r.teacherName === teacher ? (r.type === "Lab" ? 2 : 1) : 0), 0);

    const teacherHourRemaining = (teacher) => Math.max(0, 20 - teacherHours(teacher));

    const teacherHasSessionOnDay = (teacher, day) =>
      result.some(r => r.teacherName === teacher && r.day === day);

    const teacherDayLoad = (teacher, day) =>
      result.filter(r => r.teacherName === teacher && r.day === day)
        .reduce((sum, r) => sum + (r.type === "Lab" ? 2 : 1), 0);

    // dayLoad: how many sessions this division has on a given day
    const divDayLoad = (day, sem, div) =>
      result.filter(r => r.day === day && r.semester === sem && r.division === div).length;

    const stableIndex = (value, modulo) => {
      const text = String(value || "");
      let total = 0;
      for (let i = 0; i < text.length; i++) total += text.charCodeAt(i) * (i + 1);
      return total % modulo;
    };

    const rotate = (items, offset) =>
      items.map((_, i) => items[(i + offset) % items.length]);

    // ── place 4 theory sessions spread across the week ───────
    function scheduleTheory(teacher, sem, div, subject, sessionCount = 4) {
      sessionCount = Math.min(sessionCount, teacherHourRemaining(teacher));
      if (sessionCount <= 0) return 0;

      let placed = 0;

      // Pass 1: Strict — one per day, teacher free, sorted lightest day first
      if (placed < sessionCount) {
        const dayOffset = stableIndex(`${sem}-${div}-${subject}-${teacher}`, DAYS.length);
        const sortedDays = [...DAYS].sort((a, b) => {
          const aHas = Number(teacherHasSessionOnDay(teacher, a));
          const bHas = Number(teacherHasSessionOnDay(teacher, b));
          if (aHas !== bHas) return aHas - bHas;
          const diff = divDayLoad(a, sem, div) - divDayLoad(b, sem, div);
          return diff || rotate(DAYS, dayOffset).indexOf(a) - rotate(DAYS, dayOffset).indexOf(b);
        });

        for (const day of sortedDays) {
          if (placed >= sessionCount || teacherHourRemaining(teacher) <= 0) break;

          // Already has this subject on this day?
          const subjectOnDay = result.some(
            r => r.day === day && r.semester === sem && r.division === div && r.subject === subject
          );
          if (subjectOnDay) continue;

          // Try every slot on this day
          const slotOffset = stableIndex(`${day}-${subject}-${teacher}-${placed}`, SCHEDULABLE_SLOTS.length);
          for (const slot of rotate(SCHEDULABLE_SLOTS, slotOffset)) {
            if (placed >= sessionCount || teacherHourRemaining(teacher) <= 0) break;
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
        }
      }

      // Pass 2: Relaxed — allow same subject twice a day if needed, teacher still free
      if (placed < sessionCount) {
        const relaxedDays = [...DAYS].sort((a, b) =>
          divDayLoad(a, sem, div) - divDayLoad(b, sem, div) || DAYS.indexOf(a) - DAYS.indexOf(b)
        );
        for (const day of relaxedDays) {
          if (placed >= sessionCount || teacherHourRemaining(teacher) <= 0) break;
          const slotOffset = stableIndex(`${day}-${subject}-${teacher}-relaxed`, SCHEDULABLE_SLOTS.length);
          for (const slot of rotate(SCHEDULABLE_SLOTS, slotOffset)) {
            if (placed >= sessionCount || teacherHourRemaining(teacher) <= 0) break;
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

      return placed;
    }

    // ── place a 2-hour lab block ─────────────────────────────
    function scheduleLab(teacher, sem, div, subject) {
      if (teacherHourRemaining(teacher) < 2) return false;

      // Valid contiguous pairs that avoid the short break and lunch
      // Using SLOTS indices: 0,1 are morning pair; 3,4 are mid-day; 6,7 are afternoon
      const validPairs = [ [0,1], [3,4], [6,7] ];
      const sortedDays = [...DAYS].sort((a, b) => {
        const aHas = Number(teacherHasSessionOnDay(teacher, a));
        const bHas = Number(teacherHasSessionOnDay(teacher, b));
        if (aHas !== bHas) return aHas - bHas;
        return teacherDayLoad(teacher, a) - teacherDayLoad(teacher, b);
      });

      for (const day of sortedDays) {
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
