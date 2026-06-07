const crypto = require('crypto');
global.crypto = global.crypto || crypto;

require('dotenv').config({ override: true });
console.log('MONGO_URI present:', !!process.env.MONGO_URI, '| length:', process.env.MONGO_URI ? process.env.MONGO_URI.length : 0);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const os = require("os");
const path = require("path");
const nodemailer = require("nodemailer");
const localtunnel = require("localtunnel");

require("./db");

const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || null;

let publicUrl = null;
let tunnelInstance = null;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("frontend"));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
app.get('/form.html', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'form.html')));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  department: { type: String, required: true },
  resetCode: String,
  resetCodeExpires: Date
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

    if (!name || !email || !password || !department) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const username = String(name).trim();
    const userEmail = String(email).trim().toLowerCase();
    const userDepartment = normalizeDepartment(department);

    // Server-side validations
    const isValidName = /^[A-Za-z ]+$/.test(username);
    if (!isValidName) {
      return res.status(400).json({ success: false, message: 'Invalid name: use letters and spaces only.' });
    }

    const allowedDomains = ['yahoo.com', 'yahoo.co.in', 'gmail.com', 'gmail.co.in', 'co.edu.in'];
    const emailOkFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);

    if (!emailOkFormat) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email: enter a full valid email with a domain dot (example: name@yahoo.com).'
      });
    }

    const domainPart = userEmail.split('@')[1] || '';
    const emailOkDomain = allowedDomains.includes(domainPart);

    if (!emailOkDomain) {
      let message = 'Invalid email: Please use ' + allowedDomains.join(' or ') + '.';
      if (domainPart.includes('gmail.com')) {
        message = 'Invalid email: Gmail is not allowed. Use ' + allowedDomains.join(' or ') + '.';
      } else if (domainPart.includes('co.edu.in') || domainPart === 'co.edu.in') {
        message = 'Invalid email: co.edu.in is not allowed. Use ' + allowedDomains.join(' or ') + '.';
      }

      return res.status(400).json({
        success: false,
        message
      });
    }



    const safeName = escapeHtml(username);
    const safeEmail = escapeHtml(userEmail);
    const safeDepartment = escapeHtml(userDepartment);
    const safePassword = escapeHtml(password);


    const mailOptions = {
      from: EMAIL_USER ? `"TimeGen Admin" <${EMAIL_USER}>` : '"TimeGen Admin" <no-reply@example.com>',
      to: userEmail,
      subject: "TimeGen Account Registration Successful",
      text: `Dear ${name},\n\nYour TimeGen administrator account has been created successfully.\n\nAccount Details:\nName: ${name}\nEmail: ${email}\nDepartment: ${department}\nPassword: ${password}\n\nRegards,\nTimeGen Admin`,
      html: `
        <div style="font-family: Arial, sans-serif; background: #f4f7fb; padding: 24px; color: #1f2937;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="background: #0f172a; color: white; padding: 20px;">
              <h2>TimeGen Registration Successful</h2>
            </div>
            <div style="padding: 24px;">
              <p>Dear ${safeName},</p>
              <p>Your TimeGen administrator account has been created successfully.</p>
              <table style="width:100%; border-collapse:collapse;">
                <tr><td style="padding:10px; border:1px solid #ddd;"><b>Name</b></td><td style="padding:10px; border:1px solid #ddd;">${safeName}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd;"><b>Email</b></td><td style="padding:10px; border:1px solid #ddd;">${safeEmail}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd;"><b>Department</b></td><td style="padding:10px; border:1px solid #ddd;">${safeDepartment}</td></tr>
                <tr><td style="padding:10px; border:1px solid #ddd;"><b>Password</b></td><td style="padding:10px; border:1px solid #ddd;">${safePassword}</td></tr>
              </table>
              <p style="margin-top:20px;">Please use your registered email address and password to log in.</p>
              <p>Regards,<br>TimeGen Admin</p>
            </div>
          </div>
        </div>
      `
    };

    // Create the user in MongoDB
    const existing = await User.findOne({ email: userEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }


    const hashedPassword = await bcrypt.hash(String(password), 10);
    await User.create({
      username,
      email: userEmail,
      password: hashedPassword,
      department: userDepartment
    });

    // Don't block signup response on email sending (can be slow on some hosts)
    transporter.sendMail(mailOptions)
      .then(() => console.log("[Email] Welcome email sent successfully."))
      .catch((mailError) => console.error("[Email Error]", mailError.message));

    console.log(`[New User] Name: ${username} | Email: ${userEmail} | Department: ${userDepartment}`);


      return res.status(201).json({
        success: true,
        message: "Account created successfully",
        userName: username,
        department: userDepartment
      });

  } catch (err) {
    console.error("[Signup Error]", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email.trim();

    const user = await User.findOne({
      $or: [
        { email: new RegExp("^" + identifier + "$", "i") },
        { username: new RegExp("^" + identifier + "$", "i") }
      ]
    });

    if (!user) {
      console.log("[Login Failed] User not found:", identifier);
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);

    if (!isMatch) {
      console.log("[Login Failed] Incorrect password:", identifier);
      return res.status(400).json({ message: "Incorrect password" });
    }

    console.log("[Login Success]", user.username);

    res.json({
      token: "fake-jwt-token",
      userName: user.username,
      department: user.department
    });

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
    if (!isCodeValid) return res.status(400).json({ message: "Invalid verification code." });

    user.password = await bcrypt.hash(password, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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

    if (clashes.length > 0) return res.status(409).json({ message: "clash", clashes });

    await Assignment.insertMany(cleanAssignments);
    res.send("saved");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

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

app.get("/get-ip", (req, res) => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return res.json({ ip: net.address });
    }
  }
  res.json({ ip: "localhost" });
});

app.get("/get-public-url", (req, res) => {
  if (process.env.RENDER_EXTERNAL_URL) {
    return res.json({ url: process.env.RENDER_EXTERNAL_URL, lanUrl: null });
  }

  let lanUrl = 'http://localhost:' + PORT;
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanUrl = 'http://' + net.address + ':' + PORT;
        break;
      }
    }
  }

  const urlToReturn = PUBLIC_URL || publicUrl || lanUrl;
  res.json({ url: urlToReturn, lanUrl: lanUrl, tunnelUrl: publicUrl || null });
});

app.delete("/reset-db", async (req, res) => {
  try {
    const department = normalizeDepartment(req.query.department);
    if (department) await Assignment.deleteMany({ department });
    else await Assignment.deleteMany({});
    res.send("reset");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/generate-timetable", async (req, res) => {
  try {
    const department = normalizeDepartment(req.query.department);
    if (!department) return res.status(400).send("Department parameter is required.");

    const assignments = await Assignment.find({ department });

    const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const SLOTS = [
      "08:30-09:30",
      "09:30-10:30",
      "10:30-11:00",
      "11:00-12:00",
      "12:00-01:00",
      "01:00-02:00",
      "02:00-03:00",
      "03:00-04:00"
    ];
    const SCHEDULABLE_SLOTS = SLOTS.filter(s => s !== "10:30-11:00" && s !== "01:00-02:00");
    const THEORY_ROOMS = Array.from({ length: 50 }, (_, i) => 'Room ' + (101 + i));
    const LAB_ROOMS = ["Comp Lab A", "Comp Lab B", "Comp Lab C", "Comp Lab D", "Electronics Lab"];

    const result = [];

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

    // Prevent mixed Theory+Lab on the same day for a teacher
    const teacherHasTheoryOnDay = (teacher, day) =>
      result.some(r => r.teacherName === teacher && r.day === day && r.type === "Theory");

    const teacherHasLabOnDay = (teacher, day) =>
      result.some(r => r.teacherName === teacher && r.day === day && r.type === "Lab");

    // Limit to at most 2 classes per day per teacher.
    // Theory = 1 class, Lab = 1 class (even though it occupies 2 time-slots).
    const teacherClassCountOnDay = (teacher, day) =>
      result.filter(r => r.teacherName === teacher && r.day === day)
        .reduce((sum, r) => {
          if (r.type === "Theory") return sum + 1;
          if (r.type === "Lab") {
            // Count each 3-hour lab as exactly 1 class by counting only the *start* slot(s)
            // for the current 3-hour lab triples.
            const labStartSlots = new Set(["08:30-09:30", "11:00-12:00", "01:00-02:00", "02:00-03:00"]);
            return labStartSlots.has(r.slot) ? sum + 1 : sum;
          }

          return sum;
        }, 0);


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

    function scheduleTheory(teacher, sem, div, subject, sessionCount = 4) {
      sessionCount = Math.min(sessionCount, teacherHourRemaining(teacher));
      if (sessionCount <= 0) return 0;


      let placed = 0;

      const dayOffset = stableIndex(String(sem) + '-' + div + '-' + subject + '-' + teacher, DAYS.length);
      const sortedDays = [...DAYS].sort((a, b) => {
        const aHas = Number(teacherHasSessionOnDay(teacher, a));
        const bHas = Number(teacherHasSessionOnDay(teacher, b));
        if (aHas !== bHas) return aHas - bHas;
        const diff = divDayLoad(a, sem, div) - divDayLoad(b, sem, div);
        return diff || rotate(DAYS, dayOffset).indexOf(a) - rotate(DAYS, dayOffset).indexOf(b);
      });

      for (const day of sortedDays) {
        if (placed >= sessionCount) break;

        const subjectOnDay = result.some(
          r => r.day === day && r.semester === sem && r.division === div && r.subject === subject
        );
        if (subjectOnDay) continue;

        const slotOffset = stableIndex(String(day) + '-' + subject + '-' + teacher + '-' + placed, SCHEDULABLE_SLOTS.length);
        for (const slot of rotate(SCHEDULABLE_SLOTS, slotOffset)) {
          if (placed >= sessionCount) break;
          if (isDivFree(day, slot, sem, div) && isTeacherFree(day, slot, teacher) &&
              // teacher day must not mix Theory+Lab
              // teacher day must not mix Theory+Lab
              !teacherHasLabOnDay(teacher, day) &&
              // max 2 classes/day
              teacherClassCountOnDay(teacher, day) < 2) {


            result.push({
              day, slot, semester: sem, division: div,
              subject, teacherName: teacher, type: "Theory",
              room: pickRoom(day, slot, false)
            });
            placed++;
            break;
          }
        }
      }

      return placed;
    }

    function scheduleLab(teacher, sem, div, subject) {
      // 3-hour lab = 3 consecutive 1-hour slots in the timetable model
      if (teacherHourRemaining(teacher) < 3) return false;

      // Candidate 3-slot blocks (avoid the half-hour gaps that are removed from THEORY scheduling)
      // Using SLOTS indices that correspond to continuous 3 hours:
      // [0,1,3] => 08:30-09:30, 09:30-10:30, 11:00-12:00 (note: there is a gap at 10:30-11:00 in SLOTS)
      // Instead we create 3 consecutive *scheduled* slots from the existing array by selecting indices that are consecutive in time.
      // Since your SLOTS contains half-hour slots (10:30-11:00) and (01:00-02:00), we treat a “3 hour lab” as:
      // - 08:30-09:30 (0)
      // - 09:30-10:30 (1)
      // - 11:00-12:00 (3)
      // - OR 11:00-12:00 (3), 12:00-01:00 (4), 01:00-02:00 (5) is not continuous due to definition
      // For correct 3-hour blocks in your current grid, we schedule exactly 3 *lab sessions* as 3 full hour slots:
      // validTriples refer to hour-sized slots only: 0,1,3,4,6,7 => triples [0,1,3], [1,3,4], [3,4,6], [4,6,7]
      const validTriples = [
        [0, 1, 3],
        [1, 3, 4],
        [3, 4, 6],
        [4, 6, 7]
      ];

      for (const day of DAYS) {
        for (const [i1, i2, i3] of validTriples) {
          const s1 = SLOTS[i1], s2 = SLOTS[i2], s3 = SLOTS[i3];

          if (
            isDivFree(day, s1, sem, div) && isDivFree(day, s2, sem, div) && isDivFree(day, s3, sem, div) &&
            isTeacherFree(day, s1, teacher) && isTeacherFree(day, s2, teacher) && isTeacherFree(day, s3, teacher) &&
            // teacher day must not mix Theory+Lab
            !teacherHasTheoryOnDay(teacher, day) &&
            !teacherHasLabOnDay(teacher, day) &&

            // max 2 classes/day (count lab as 1 class)
            teacherClassCountOnDay(teacher, day) < 2
          ) {
            const room = pickRoom(day, s1, true);
            result.push({ day, slot: s1, semester: sem, division: div, subject, teacherName: teacher, type: "Lab", room });
            result.push({ day, slot: s2, semester: sem, division: div, subject, teacherName: teacher, type: "Lab", room });
            result.push({ day, slot: s3, semester: sem, division: div, subject, teacherName: teacher, type: "Lab", room });
            return true;
          }
        }
      }
      return false;
    }


    const sorted = [...assignments].sort((a, b) => {
      const aa = a._doc || a;
      const bb = b._doc || b;
      const pri = { "Lab+Theory": 0, "Lab": 1, "Theory": 2 };
      return (pri[aa.type] ?? 2) - (pri[bb.type] ?? 2);
    });

    for (const a of sorted) {
      const { teacherName: teacher, semester: sem, division: div, subject, type } = a._doc || a;
      if (type === "Theory") scheduleTheory(teacher, sem, div, subject, 4);
      else if (type === "Lab") scheduleLab(teacher, sem, div, subject);
      else if (type === "Lab+Theory") {
        scheduleLab(teacher, sem, div, subject);
        scheduleTheory(teacher, sem, div, subject, 4);
      }
    }

    const theoryCounts = {};
    result.filter(r => r.type === "Theory").forEach(r => {
      const k = 'Sem' + r.semester + ' Div' + r.division + ' | ' + r.subject;
      theoryCounts[k] = (theoryCounts[k] || 0) + 1;
    });

    console.log("\n[Scheduler] Theory class counts:");
    Object.entries(theoryCounts).forEach(([k, v]) => console.log('  ' + k + ': ' + v));
    console.log('[Scheduler] Days used: ' + [...new Set(result.map(r => r.day))].join(', '));
    // FIX: avoid template literal that broke parsing
    console.log('[Scheduler] Total sessions: ' + result.length);

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
      if (tunnel && tunnel !== tunnelInstance) tunnel.close();
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

