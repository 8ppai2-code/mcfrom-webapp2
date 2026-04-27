// ═══════════════════════════════════════════════════
//  MC FROM PRO — Cloudflare Worker v2.0
//  Bot + API + URcoins + Tasks + AdsGram
// ═══════════════════════════════════════════════════

const BOT_TOKEN      = "8651775315:AAEAec6kxUsNl_B7mWSBAAdp5NJgr6-GhQg";
const ADMIN_ID       = 7692551897;
const WEBHOOK_SECRET = "mcfrom_secret_2026";
const WEBAPP_URL     = "https://8ppai2-code.github.io/mcfrom-webapp/";
const API_SECRET     = "mcfrom_api_2026";
const TON_ADDRESS    = "UQDS-hym5d6f4UReh36szpSj4_EmnKuuJJGA2uiwExm2pq0j";
const ADSGRAM_BLOCK  = 28448;

// URcoins rates
const URCOIN_PER_STAR   = 1;       // 1 Star = 1 URcoin
const URCOIN_PER_TON    = 58;      // 1 TON ≈ 12 URcoin per $0.207
const TASK_REWARD       = 5;       // URcoins per task completed
const AD_REWARD         = 5;       // URcoins per ad watched

// ── CORS ───────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-API-Secret",
  "Content-Type": "application/json",
};
const json = (d, s=200) => new Response(JSON.stringify(d), { status:s, headers:CORS });

// ── TELEGRAM API ───────────────────────────────────
const tgAPI = (m, b) => fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${m}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
}).then(r => r.json());

const send      = (id, text, extra={})       => tgAPI("sendMessage",     { chat_id:id, text, parse_mode:"Markdown", ...extra });
const sendPhoto = (id, photo, caption, extra={}) => tgAPI("sendPhoto",   { chat_id:id, photo, caption, parse_mode:"Markdown", ...extra });
const editMsg   = (id, mid, text, extra={})  => tgAPI("editMessageText", { chat_id:id, message_id:mid, text, parse_mode:"Markdown", ...extra });
const answerCB  = (id, text="", alert=false) => tgAPI("answerCallbackQuery", { callback_query_id:id, text, show_alert:alert });
const getName   = u => u.first_name || u.username || "Friend";
const isAdmin   = id => id === ADMIN_ID;

// ── D1 HELPERS ─────────────────────────────────────
const dbRun   = (db, sql, p=[]) => db.prepare(sql).bind(...p).run();
const dbAll   = (db, sql, p=[]) => db.prepare(sql).bind(...p).all();
const dbFirst = (db, sql, p=[]) => db.prepare(sql).bind(...p).first();

// ── INIT DB TABLES ─────────────────────────────────
async function initDB(env) {
  try {
    await dbRun(env.DB, `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      username TEXT,
      lang TEXT DEFAULT 'en',
      urcoins REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(env.DB, `CREATE TABLE IF NOT EXISTS mods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT,
      tag TEXT DEFAULT 'Addon',
      section TEXT DEFAULT 'addons',
      img_url TEXT,
      link TEXT,
      price TEXT,
      likes INTEGER DEFAULT 0,
      featured INTEGER DEFAULT 0,
      created_at TEXT
    )`);
    await dbRun(env.DB, `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      link TEXT,
      reward REAL DEFAULT 5,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(env.DB, `CREATE TABLE IF NOT EXISTS task_completions (
      user_id TEXT,
      task_id TEXT,
      completed_at TEXT,
      PRIMARY KEY (user_id, task_id)
    )`);
    await dbRun(env.DB, `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      amount REAL,
      desc TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch(e) {}
}

// ── URCOINS HELPERS ────────────────────────────────
async function getBalance(env, userId) {
  try {
    const u = await dbFirst(env.DB, "SELECT urcoins FROM users WHERE id=?", [String(userId)]);
    return u?.urcoins || 0;
  } catch(e) { return 0; }
}

async function addCoins(env, userId, amount, desc="reward") {
  try {
    await dbRun(env.DB, "UPDATE users SET urcoins=urcoins+? WHERE id=?", [amount, String(userId)]);
    const txId = "tx_" + Date.now() + "_" + userId;
    await dbRun(env.DB,
      "INSERT OR IGNORE INTO transactions (id,user_id,type,amount,desc) VALUES (?,?,?,?,?)",
      [txId, String(userId), "earn", amount, desc]
    );
  } catch(e) {}
}

// ── KEYBOARDS ──────────────────────────────────────
const langKB = () => ({ inline_keyboard: [
  [{ text: " 🇸🇦   Arabic",  callback_data: "lang_ar" }],
  [{ text: " 🇬🇧   English", callback_data: "lang_en" }],
  [{ text: " 🇷🇺   Русский", callback_data: "lang_ru" }],
]});

const TEXTS = {
  ar: {
    menu:        "🏠 *القائمة الرئيسية*\n\nمرحباً {name}، ماذا تريد؟",
    browse:      " 🎮 تصفح الإضافات",
    tools:       "🔧 الأدوات",
    earn:        "💎 Earn URcoins",
    support:     "💬 تواصل معنا",
    lang:        "🌐 Change Language",
    support_msg: "اكتب مشكلتك هنا رسالة نصية فقط وستصل للمطورين 📥",
    support_ok:  "✅ تم إرسال رسالتك!",
    banned:      "🚫 أنت محظور.",
  },
  en: {
    menu:        "🏠 *Main Menu*\n\nHello {name}, what are you looking for?",
    browse:      " 🎮 Browse Add-ons",
    tools:       "🔧 Tools",
    earn:        "💎 Earn URcoins",
    support:     "💬 Contact Us",
    lang:        "🌐 Change Language",
    support_msg: "Write your issue here (text only) and it will reach the developers 📥",
    support_ok:  "✅ Your message has been sent!",
    banned:      "🚫 You are banned.",
  },
  ru: {
    menu:        "🏠 *Главное меню*\n\nПривет {name}, что вы ищете?",
    browse:      " 🎮 Просмотр дополнений",
    tools:       "🔧 Инструменты",
    earn:        "💎 Earn URcoins",
    support:     "💬 Связаться",
    lang:        "🌐 Change Language",
    support_msg: "Напишите вашу проблему (только текст) и она дойдёт до разработчиков 📥",
    support_ok:  "✅ Сообщение отправлено!",
    banned:      "🚫 Вы заблокированы.",
  },
};

const menuKB = lang => ({ inline_keyboard: [
  [{ text: TEXTS[lang].browse,  web_app: { url: WEBAPP_URL + "?page=addons" } }],
  [{ text: TEXTS[lang].tools,   web_app: { url: WEBAPP_URL + "?page=tools"  } }],
  [
    { text: TEXTS[lang].earn,    web_app: { url: WEBAPP_URL + "?page=earn"   } },
    { text: TEXTS[lang].support, callback_data: "menu_support" },
  ],
  [{ text: TEXTS[lang].lang, callback_data: "menu_lang" }],
]});

// ── HANDLE /start ──────────────────────────────────
async function handleStart(msg, env) {
  const uid  = msg.from.id;
  const name = getName(msg.from);
  const uname = msg.from.username || "";
  try {
    await dbRun(env.DB,
      "INSERT OR IGNORE INTO users (id,name,username,lang,urcoins) VALUES (?,?,?,'en',0)",
      [String(uid), name, uname]
    );
  } catch(e) {}

  const started = await env.BOT_KV.get(`user:${uid}:started`);
  if (!started) {
    await send(uid,
      "🌐  Choose your language\n      اختر لغتك\n      Выберите язык:",
      { reply_markup: langKB() }
    );
  } else {
    const lang = (await env.BOT_KV.get(`user:${uid}:lang`)) || "en";
    await send(uid,
      TEXTS[lang].menu.replace("{name}", name),
      { reply_markup: menuKB(lang) }
    );
  }
}

// ── HANDLE CALLBACKS ───────────────────────────────
async function handleCallback(query, env) {
  const uid  = query.from.id;
  const name = getName(query.from);
  const data = query.data;
  const mid  = query.message.message_id;
  await answerCB(query.id);

  // Language selection
  if (data.startsWith("lang_")) {
    const lang = data.split("_")[1];
    await env.BOT_KV.put(`user:${uid}:lang`, lang);
    await env.BOT_KV.put(`user:${uid}:started`, "1");
    try { await dbRun(env.DB, "UPDATE users SET lang=? WHERE id=?", [lang, String(uid)]); } catch(e){}
    await editMsg(uid, mid, TEXTS[lang].menu.replace("{name}", name), { reply_markup: menuKB(lang) });
    return;
  }

  const lang = (await env.BOT_KV.get(`user:${uid}:lang`)) || "en";

  if (data === "menu_lang") {
    await editMsg(uid, mid,
      "🌐  Choose your language\n      اختر لغتك\n      Выберите язык:",
      { reply_markup: langKB() }
    );

  } else if (data === "menu_support") {
    await env.BOT_KV.put(`user:${uid}:waiting_support`, "1");
    await send(uid, TEXTS[lang].support_msg);

  // ── Task completion confirm ─────────────────────
  } else if (data.startsWith("task_confirm_")) {
    const taskId = data.replace("task_confirm_", "");
    try {
      // Check not already completed
      const done = await dbFirst(env.DB,
        "SELECT 1 FROM task_completions WHERE user_id=? AND task_id=?",
        [String(uid), taskId]
      );
      if (done) {
        await answerCB(query.id, "✅ Already completed!", true);
        return;
      }
      const task = await dbFirst(env.DB, "SELECT * FROM tasks WHERE id=?", [taskId]);
      if (!task) { await answerCB(query.id, "❌ Task not found", true); return; }

      // Mark complete & reward
      await dbRun(env.DB,
        "INSERT OR IGNORE INTO task_completions (user_id,task_id,completed_at) VALUES (?,?,?)",
        [String(uid), taskId, new Date().toISOString()]
      );
      await addCoins(env, uid, task.reward, `Task: ${task.title}`);

      const balance = await getBalance(env, uid);
      await editMsg(uid, mid,
        `✅ *Task Completed!*\n\n💎 +${task.reward} URcoins earned!\n💰 Balance: ${balance.toFixed(1)} URcoins`
      );
    } catch(e) {
      await answerCB(query.id, "❌ Error: " + e.message, true);
    }

  } else if (data === "task_skip") {
    await env.BOT_KV.delete(`user:${uid}:current_task`);
    await showNextTask(uid, env, lang);

  // ── News confirm ────────────────────────────────
  } else if (data === "news_confirm") {
    await broadcastNews(uid, env);

  } else if (data === "news_cancel") {
    await env.BOT_KV.delete("admin:news_pending");
    await send(uid, "❌ News cancelled.");
  }
}

// ── SHOW NEXT TASK ─────────────────────────────────
async function showNextTask(userId, env, lang="en") {
  try {
    // Get tasks not completed by this user
    const tasks = await dbAll(env.DB,
      `SELECT t.* FROM tasks t
       WHERE t.active=1
       AND t.id NOT IN (
         SELECT task_id FROM task_completions WHERE user_id=?
       )
       ORDER BY t.created_at ASC LIMIT 1`,
      [String(userId)]
    );

    if (!tasks.results?.length) {
      await send(userId,
        "⏳ *No tasks available*\n\nAll tasks completed! Check back later for new tasks.\n\n💎 Keep earning URcoins!"
      );
      return;
    }

    const task = tasks.results[0];
    await env.BOT_KV.put(`user:${userId}:current_task`, task.id);

    await send(userId,
      `📝 *New Task*\n\n${task.title}\n\n` +
      `💰 *Reward:* ${task.reward} URcoins\n\n` +
      `Join the link and come back to confirm!`,
      {
        reply_markup: { inline_keyboard: [
          [{ text: `🔗 ${task.title}`, url: task.link }],
          [
            { text: "✅ Confirm 💎",   callback_data: `task_confirm_${task.id}` },
            { text: "⏭️ Skip",         callback_data: "task_skip" },
          ],
        ]},
      }
    );
  } catch(e) {
    await send(userId, "❌ Error loading tasks: " + e.message);
  }
}

// ── BROADCAST NEWS ─────────────────────────────────
async function broadcastNews(adminId, env) {
  const newsRaw = await env.BOT_KV.get("admin:news_pending");
  if (!newsRaw) { await send(adminId, "❌ No pending news."); return; }
  const news = JSON.parse(newsRaw);
  await env.BOT_KV.delete("admin:news_pending");

  await send(adminId, "📢 Broadcasting...");
  let sent = 0, failed = 0;
  try {
    const users = await dbAll(env.DB, "SELECT id FROM users");
    for (const user of users.results || []) {
      try {
        if (news.photo) {
          const extra = news.link ? { reply_markup: { inline_keyboard: [[{ text: "🔗 Click", url: news.link }]] } } : {};
          await sendPhoto(user.id, news.photo, news.text || "", extra);
        } else {
          const extra = news.link ? { reply_markup: { inline_keyboard: [[{ text: "🔗 Click", url: news.link }]] } } : {};
          await send(user.id, news.text, extra);
        }
        sent++;
        // Small delay to avoid rate limits
        if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000));
      } catch(e) { failed++; }
    }
  } catch(e) {}

  await send(adminId, `📢 *News Sent!*\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
}

// ── HANDLE MESSAGES ────────────────────────────────
async function handleMessage(msg, env) {
  const uid  = msg.from.id;
  const text = msg.text || "";

  // Ban check
  if (await env.BOT_KV.get(`ban:${uid}`)) {
    const lang = (await env.BOT_KV.get(`user:${uid}:lang`)) || "en";
    await send(uid, TEXTS[lang].banned);
    return;
  }

  if (text === "/start") { await handleStart(msg, env); return; }

  // Admin commands
  if (isAdmin(uid) && text.startsWith("/")) {
    await handleAdminCmd(msg, env);
    return;
  }

  // Admin photo for news
  if (isAdmin(uid) && msg.photo) {
    const pending = await env.BOT_KV.get("admin:news_pending");
    if (pending) {
      const news = JSON.parse(pending);
      news.photo = msg.photo[msg.photo.length - 1].file_id;
      await env.BOT_KV.put("admin:news_pending", JSON.stringify(news));
      await send(uid, "📸 Photo added!\n\nSend 'تأكيد' or press confirm to broadcast.", {
        reply_markup: { inline_keyboard: [[
          { text: "✅ Confirm & Send", callback_data: "news_confirm" },
          { text: "❌ Cancel",         callback_data: "news_cancel"  },
        ]]}
      });
      return;
    }
  }

  // تأكيد الإرسال نصياً
  if (isAdmin(uid) && (text === "تأكيد" || text.toLowerCase() === "confirm")) {
    const pending = await env.BOT_KV.get("admin:news_pending");
    if (pending) {
      await broadcastNews(uid, env);
      return;
    }
  }

  // Support message (text only)
  const waiting = await env.BOT_KV.get(`user:${uid}:waiting_support`);
  if (waiting) {
    if (msg.photo || msg.video || msg.document || msg.sticker) {
      const lang = (await env.BOT_KV.get(`user:${uid}:lang`)) || "en";
      await send(uid, TEXTS[lang].support_msg);
      return;
    }
    await env.BOT_KV.delete(`user:${uid}:waiting_support`);
    const lang = (await env.BOT_KV.get(`user:${uid}:lang`)) || "en";
    const uname = msg.from.username ? `@${msg.from.username}` : "No username";
    const balance = await getBalance(env, uid);
    await send(ADMIN_ID,
      `📥 *New Support Message*\n` +
      `👤 ${getName(msg.from)} (ID: \`${uid}\`)\n` +
      `🔎 ${uname}\n` +
      `💡 ${balance.toFixed(1)} URcoins\n\n` +
      `${text}`
    );
    await send(uid, TEXTS[lang].support_ok);
  }
}

// ── ADMIN COMMANDS ─────────────────────────────────
async function handleAdminCmd(msg, env) {
  const uid   = msg.from.id;
  const text  = msg.text || "";
  const parts = text.trim().split(/\s+/);
  const cmd   = parts[0];

  // /users
  if (cmd === "/users") {
    try {
      const res = await dbFirst(env.DB, "SELECT COUNT(*) as c FROM users");
      const coins = await dbFirst(env.DB, "SELECT SUM(urcoins) as t FROM users");
      await send(uid, `👥 *Stats*\n\nUsers: ${res?.c || 0}\n💎 Total URcoins: ${(coins?.t || 0).toFixed(1)}`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /ban ID
  } else if (cmd === "/ban" && parts[1]) {
    await env.BOT_KV.put(`ban:${parts[1]}`, "1");
    await send(uid, `🚫 User \`${parts[1]}\` banned.`);

  // /unban ID
  } else if (cmd === "/unban" && parts[1]) {
    await env.BOT_KV.delete(`ban:${parts[1]}`);
    await send(uid, `✅ User \`${parts[1]}\` unbanned.`);

  // /mods
  } else if (cmd === "/mods") {
    try {
      const res = await dbAll(env.DB, "SELECT name, section FROM mods ORDER BY created_at DESC LIMIT 10");
      const list = res.results?.map(m => `• ${m.name} (${m.section})`).join("\n") || "No mods";
      await send(uid, `📦 *Latest Mods:*\n${list}`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /addtask رابط عنوان
  } else if (cmd === "/addtask" && parts[1]) {
    const link  = parts[1];
    const title = parts.slice(2).join(" ") || "Join Channel";
    try {
      const id = "task_" + Date.now();
      await dbRun(env.DB,
        "INSERT INTO tasks (id,title,link,reward,active) VALUES (?,?,?,?,1)",
        [id, title, link, TASK_REWARD]
      );
      await send(uid, `✅ *Task Added!*\n\n📌 ${title}\n🔗 ${link}\n💰 Reward: ${TASK_REWARD} URcoins`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /tasks — list tasks
  } else if (cmd === "/tasks") {
    try {
      const res = await dbAll(env.DB, "SELECT * FROM tasks ORDER BY created_at DESC");
      if (!res.results?.length) { await send(uid, "No tasks yet.\n\nUse: /addtask <link> <title>"); return; }
      const list = res.results.map(t =>
        `• ${t.active ? "✅" : "❌"} ${t.title}\n  🔗 ${t.link}\n  💰 ${t.reward} URcoins | ID: \`${t.id}\``
      ).join("\n\n");
      await send(uid, `📋 *Tasks:*\n\n${list}`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /deltask ID
  } else if (cmd === "/deltask" && parts[1]) {
    try {
      await dbRun(env.DB, "UPDATE tasks SET active=0 WHERE id=?", [parts[1]]);
      await send(uid, `✅ Task \`${parts[1]}\` disabled.`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /givecoins ID amount
  } else if (cmd === "/givecoins" && parts[1] && parts[2]) {
    try {
      await addCoins(env, parts[1], parseFloat(parts[2]), "Admin gift");
      const bal = await getBalance(env, parts[1]);
      await send(uid, `✅ Gave ${parts[2]} URcoins to \`${parts[1]}\`\nNew balance: ${bal.toFixed(1)}`);
      await send(parseInt(parts[1]), `🎁 You received *${parts[2]} URcoins* from admin!\n💰 Balance: ${bal.toFixed(1)} URcoins`);
    } catch(e) { await send(uid, "❌ " + e.message); }

  // /news — improved flow
  } else if (cmd === "/news") {
    await send(uid,
      "📢 *إرسال خبر لجميع المستخدمين*\n\n" +
      "أرسل لي المعلومات بهذا الترتيب:\n\n" +
      "1️⃣ *النص* — نص الخبر\n" +
      "2️⃣ *الرابط* — (اختياري) سيظهر كزر Click\n" +
      "3️⃣ *صورة* — (اختياري) أرسل صورة\n\n" +
      "ابدأ بإرسال نص الخبر الآن 👇",
      { reply_markup: { inline_keyboard: [[{ text: "❌ إلغاء", callback_data: "news_cancel" }]] } }
    );
    await env.BOT_KV.put("admin:news_step", "text", { expirationTtl: 600 });

  } else {
    await send(uid,
      `❓ *Available Commands:*\n\n` +
      `/users — Stats\n` +
      `/ban ID — Ban user\n` +
      `/unban ID — Unban user\n` +
      `/mods — List mods\n` +
      `/addtask <link> <title> — Add task\n` +
      `/tasks — List tasks\n` +
      `/deltask ID — Disable task\n` +
      `/givecoins ID amount — Give URcoins\n` +
      `/news — Broadcast news`
    );
  }
}

// ── NEWS STEP HANDLER ──────────────────────────────
async function handleNewsSteps(msg, env) {
  const uid  = msg.from.id;
  const text = msg.text || "";
  const step = await env.BOT_KV.get("admin:news_step");

  if (step === "text") {
    await env.BOT_KV.put("admin:news_pending", JSON.stringify({ text, link: null, photo: null }));
    await env.BOT_KV.put("admin:news_step", "link", { expirationTtl: 600 });
    await send(uid,
      `✅ النص:\n"${text}"\n\n` +
      `الآن أرسل *رابطاً* (اختياري) أو اضغط تخطي 👇`,
      { reply_markup: { inline_keyboard: [[
        { text: "⏭️ تخطي الرابط", callback_data: "news_skip_link" },
        { text: "❌ إلغاء",        callback_data: "news_cancel"    },
      ]] } }
    );
    return true;
  }

  
  if (step === "link") {
    const pending = JSON.parse(await env.BOT_KV.get("admin:news_pending") || "{}");
    const isUrl = text.startsWith("http");
    if (isUrl) pending.link = text;
    await env.BOT_KV.put("admin:news_pending", JSON.stringify(pending));
    await env.BOT_KV.put("admin:news_step", "photo", { expirationTtl: 600 });
    await send(uid,
      `${isUrl ? `✅ الرابط: ${text}` : "⏭️ بدون رابط"}\n\n` +
      `الآن أرسل *صورة* (اختياري) أو اضغط إرسال 👇`,
      { reply_markup: { inline_keyboard: [[
        { text: "✅ إرسال بدون صورة", callback_data: "news_confirm" },
        { text: "❌ إلغاء",            callback_data: "news_cancel"  },
      ]] } }
    );
    return true;
  }

  return false;
}

// ── API ROUTES ─────────────────────────────────────
async function handleAPI(request, env, path) {
  const method = request.method;
  if (method === "OPTIONS") return new Response("", { headers: CORS });
  const secret = request.headers.get("X-API-Secret");
  const isAuth = secret === API_SECRET;

  // GET /api/mods
  if (path === "/api/mods" && method === "GET") {
    try {
      const addons   = await dbAll(env.DB, "SELECT * FROM mods WHERE section='addons' ORDER BY created_at DESC");
      const pass     = await dbAll(env.DB, "SELECT * FROM mods WHERE section!='addons' ORDER BY created_at DESC");
      const featured = await dbFirst(env.DB, "SELECT id FROM mods WHERE featured=1 LIMIT 1");
      return json({ addons: addons.results||[], pass: pass.results||[], featured: featured?.id||null });
    } catch(e) { return json({ addons:[], pass:[], featured:null }); }
  }

  // GET /api/balance/:userId
  if (path.startsWith("/api/balance/") && method === "GET") {
    const userId = path.split("/")[3];
    const balance = await getBalance(env, userId);
    return json({ balance, urcoins: balance });
  }

  // GET /api/tasks/:userId
  if (path.startsWith("/api/tasks/") && method === "GET") {
    const userId = path.split("/")[3];
    try {
      const tasks = await dbAll(env.DB,
        `SELECT t.* FROM tasks t
         WHERE t.active=1
         AND t.id NOT IN (SELECT task_id FROM task_completions WHERE user_id=?)
         ORDER BY t.created_at ASC`,
        [userId]
      );
      return json({ tasks: tasks.results || [] });
    } catch(e) { return json({ tasks:[] }); }
  }

  // POST /api/tasks/complete
  if (path === "/api/tasks/complete" && method === "POST") {
    const { userId, taskId } = await request.json();
    try {
      const done = await dbFirst(env.DB,
        "SELECT 1 FROM task_completions WHERE user_id=? AND task_id=?",
        [String(userId), taskId]
      );
      if (done) return json({ error: "Already completed" }, 400);
      const task = await dbFirst(env.DB, "SELECT * FROM tasks WHERE id=?", [taskId]);
      if (!task) return json({ error: "Task not found" }, 404);
      await dbRun(env.DB,
        "INSERT OR IGNORE INTO task_completions (user_id,task_id,completed_at) VALUES (?,?,?)",
        [String(userId), taskId, new Date().toISOString()]
      );
      await addCoins(env, userId, task.reward, `Task: ${task.title}`);
      const balance = await getBalance(env, userId);
      return json({ success: true, earned: task.reward, balance });
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // POST /api/ad/reward — AdsGram reward
  if (path === "/api/ad/reward" && method === "POST") {
    const { userId, blockId } = await request.json();
    if (blockId !== ADSGRAM_BLOCK) return json({ error: "Invalid block" }, 400);
    await addCoins(env, userId, AD_REWARD, "Ad watched");
    const balance = await getBalance(env, userId);
    return json({ success: true, earned: AD_REWARD, balance });
  }

  // POST /api/mods
  if (path === "/api/mods" && method === "POST") {
    if (!isAuth) return json({ error: "Unauthorized" }, 401);
    const { name, desc, tag, section, img_url, link, price } = await request.json();
    if (!name || !img_url) return json({ error: "name and img_url required" }, 400);
    const id = "mod_" + Date.now();
    await dbRun(env.DB,
      "INSERT INTO mods (id,name,desc,tag,section,img_url,link,price,likes,featured,created_at) VALUES (?,?,?,?,?,?,?,?,0,0,?)",
      [id, name, desc||"", tag||"Addon", section||"addons", img_url, link||"", price||null, new Date().toISOString()]
    );
    return json({ success: true, id });
  }

  // PUT /api/mods/:id
  if (path.startsWith("/api/mods/") && method === "PUT") {
    if (!isAuth) return json({ error: "Unauthorized" }, 401);
    const id = path.split("/")[3];
    const { name, desc, tag, img_url, link, price } = await request.json();
    await dbRun(env.DB,
      "UPDATE mods SET name=?,desc=?,tag=?,img_url=?,link=?,price=? WHERE id=?",
      [name, desc, tag, img_url, link, price||null, id]
    );
    return json({ success: true });
  }

  // DELETE /api/mods/:id
  if (path.startsWith("/api/mods/") && method === "DELETE") {
    if (!isAuth) return json({ error: "Unauthorized" }, 401);
    const id = path.split("/")[3];
    await dbRun(env.DB, "DELETE FROM mods WHERE id=?", [id]);
    return json({ success: true });
  }

  // POST /api/pin/:id
  if (path.startsWith("/api/pin/") && method === "POST") {
    if (!isAuth) return json({ error: "Unauthorized" }, 401);
    const id = path.split("/")[3];
    await dbRun(env.DB, "UPDATE mods SET featured=0");
    await dbRun(env.DB, "UPDATE mods SET featured=1 WHERE id=?", [id]);
    return json({ success: true });
  }

  // POST /api/unpin
  if (path === "/api/unpin" && method === "POST") {
    if (!isAuth) return json({ error: "Unauthorized" }, 401);
    await dbRun(env.DB, "UPDATE mods SET featured=0");
    return json({ success: true });
  }

  // POST /api/like/:id
  if (path.startsWith("/api/like/") && method === "POST") {
    const id = path.split("/")[3];
    await dbRun(env.DB, "UPDATE mods SET likes=likes+1 WHERE id=?", [id]);
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}

// ── MAIN FETCH ─────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;

    if (path.startsWith("/api/")) {
      await initDB(env);
      return handleAPI(request, env, path);
    }

    if (request.method !== "POST") return new Response("MC From Bot v2 ✅");
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });

    await initDB(env);
    const update = await request.json();

    if (update.message) {
      const msg = update.message;
      const uid = msg.from?.id;

      // Admin news steps
      if (uid && isAdmin(uid)) {
        const step = await env.BOT_KV.get("admin:news_step");
        if (step && !msg.text?.startsWith("/")) {
          if (msg.photo && step === "photo") {
            const pending = JSON.parse(await env.BOT_KV.get("admin:news_pending") || "{}");
            pending.photo = msg.photo[msg.photo.length - 1].file_id;
            await env.BOT_KV.put("admin:news_pending", JSON.stringify(pending));
            await env.BOT_KV.delete("admin:news_step");
            await send(uid, "📸 Photo added!\n\nReady to send!", {
              reply_markup: { inline_keyboard: [[
                { text: "✅ Confirm & Broadcast", callback_data: "news_confirm" },
                { text: "❌ Cancel",               callback_data: "news_cancel"  },
              ]]}
            });
            return new Response("OK");
          }
          const handled = await handleNewsSteps(msg, env);
          if (handled) return new Response("OK");
        }
      }

      await handleMessage(update.message, env);
    } else if (update.callback_query) {
      const data = update.callback_query.data;
      // Handle news link skip
      if (data === "news_skip_link") {
        const pending = JSON.parse(await env.BOT_KV.get("admin:news_pending") || "{}");
        await env.BOT_KV.put("admin:news_step", "photo", { expirationTtl: 600 });
        const uid = update.callback_query.from.id;
        await answerCB(update.callback_query.id);
        await send(uid,
          "⏭️ بدون رابط\n\nالآن أرسل *صورة* (اختياري) أو اضغط إرسال 👇",
          { reply_markup: { inline_keyboard: [[
            { text: "✅ إرسال بدون صورة", callback_data: "news_confirm" },
            { text: "❌ إلغاء",            callback_data: "news_cancel"  },
          ]] } }
        );
        return new Response("OK");
      }
      await handleCallback(update.callback_query, env);
    }

    return new Response("OK");
  },
};
