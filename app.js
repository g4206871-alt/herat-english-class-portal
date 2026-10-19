(() => {
  const $ = (s) => document.querySelector(s);
  const config = window.PORTAL_CONFIG || {};
  const configured = config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR-PROJECT")
    && config.SUPABASE_ANON_KEY && !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  const db = configured && window.supabase ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
  const toast = (message) => { const el = $("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 3200); };
  const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const dateFmt = v => v ? new Date(v + "T00:00:00").toLocaleDateString("fa-AF", {year:"numeric",month:"short",day:"numeric"}) : "تاریخ تعیین نشده";
  const fallback = {
    announcements: [
      {id:"demo-a1",title:"به تابلوی آنلاین صنف خوش آمدید",body:"این نسخهٔ نمایشی است. پس از اتصال دیتابیس، اطلاعیه‌های واقعی از پنل مدیریت نشر می‌شوند.",category:"اطلاعیه",created_at:new Date().toISOString()},
      {id:"demo-a2",title:"تأیید تقسیم اوقات",body:"تقسیم اوقات و تاریخ امتحانات را پیش از نشر عمومی با استادان مربوطه تأیید کنید.",category:"یادآوری",created_at:new Date().toISOString()}
    ],
    assignments: [{id:"demo-task",title:"نمونهٔ وظیفهٔ درسی",description:"این مورد نمونه است و تاریخ رسمی نیست.",kind:"assignment",due_date:null}],
    timetable: [{id:"demo-time",day:"شنبه",time:"—",subject:"پس از تأیید درج شود",teacher_room:"—"}],
    files: [], groups: [{id:"demo-group",name:"گروپ نمونه",members:["پس از تأیید فهرست رسمی درج شود"]}]
  };
  let state = {...fallback};
  let currentUser = null;
  let userRole = null;
  const isDemo = !db;

  function showConfigWarning() {
    if (!db) {
      const note = document.createElement("div");
      note.className = "config-warning";
      note.innerHTML = "<strong>حالت پیش‌نمایش:</strong> سایت اجرا می‌شود، اما دیتابیس هنوز وصل نیست. برای ذخیرهٔ واقعی و ورود مدیر، مقدارهای Supabase را در <code>config.js</code> تنظیم کنید.";
      $("main")?.prepend(note);
      // main is queried by tag below if needed
      document.querySelector("main").prepend(note);
    }
  }
  function renderAnnouncements() {
    $("#announcement-list").innerHTML = state.announcements.length ? state.announcements.map(a => `<article class="content-card"><div class="card-meta"><span class="tag">${esc(a.category || "اطلاعیه")}</span><span>${dateFmt((a.created_at||"").slice(0,10))}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></article>`).join("") : `<div class="empty-state">فعلاً اطلاعیه‌ای نشر نشده است.</div>`;
    $("#stat-announcements").textContent = state.announcements.length;
  }
  function renderAssignments() {
    $("#assignment-list").innerHTML = state.assignments.length ? state.assignments.map(a => `<article class="content-card"><div class="card-meta"><span class="tag ${a.kind==="exam"?"tag-warm":""}">${a.kind==="exam"?"امتحان":"وظیفه"}</span><span>${dateFmt(a.due_date)}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.description || "توضیحات ثبت نشده است.")}</p></article>`).join("") : `<div class="empty-state">وظیفه یا امتحانی ثبت نشده است.</div>`;
    $("#stat-assignments").textContent = state.assignments.length;
  }
  function renderTimetable() {
    $("#timetable-body").innerHTML = state.timetable.length ? state.timetable.map(t => `<tr><td>${esc(t.day)}</td><td>${esc(t.time)}</td><td><strong>${esc(t.subject)}</strong></td><td>${esc(t.teacher_room || "—")}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">تقسیم اوقات ثبت نشده است.</td></tr>`;
  }
  function renderFiles() {
    $("#file-list").innerHTML = state.files.length ? state.files.map(f => `<article class="file-row"><div class="file-icon">PDF</div><div class="file-details"><strong>${esc(f.title)}</strong><small>${esc(f.file_name || "فایل درسی")}</small></div>${f.url ? `<a class="button button-light" href="${esc(f.url)}" target="_blank" rel="noopener">بازکردن فایل</a>` : ""}</article>`).join("") : `<div class="empty-state">هنوز فایلی بارگذاری نشده است.</div>`;
    $("#stat-files").textContent = state.files.length;
  }
  function renderGroups() {
    $("#group-list").innerHTML = state.groups.length ? state.groups.map(g => {
      let members = Array.isArray(g.members) ? g.members : [];
      return `<article class="group-card"><span class="group-number">${esc(g.name)}</span><h3>${esc(g.name)}</h3><ul>${members.map(m => `<li>${esc(m)}</li>`).join("")}</ul></article>`;
    }).join("") : `<div class="empty-state">گروپی ثبت نشده است.</div>`;
  }
  function renderAll() { renderAnnouncements(); renderAssignments(); renderTimetable(); renderFiles(); renderGroups(); renderManageList(); }
  async function loadData() {
    if (!db) { renderAll(); return; }
    const specs = [
      ["announcements","announcements","created_at"],
      ["assignments","assignments","due_date"],
      ["timetable","timetable","id"],
      ["files","course_files","created_at"],
      ["groups","class_groups","name"]
    ];
    for (const [key, table, order] of specs) {
      const {data,error} = await db.from(table).select("*").order(order,{ascending:key==="timetable"||key==="groups"});
      if (!error && data) state[key] = data;
      else console.warn(`Could not load ${table}`, error?.message);
    }
    renderAll();
  }
  function openAdmin() { $("#admin-panel").hidden = false; $("#admin-panel").scrollIntoView({behavior:"smooth",block:"start"}); }
  async function refreshAuth() {
    if (!db) { $("#auth-message").textContent = "ابتدا Supabase را در فایل config.js تنظیم کنید."; return; }
    const {data:{session}} = await db.auth.getSession();
    currentUser = session?.user || null;
    if (currentUser) {
      const {data:profile} = await db.from("profiles").select("display_name,role").eq("id",currentUser.id).maybeSingle();
      userRole = profile?.role || "student";
    } else { userRole = null; }
    const allowed = ["admin","editor"].includes(userRole);
    $("#auth-area").hidden = allowed;
    $("#editor-area").hidden = !allowed;
    if (allowed) {
      $("#signed-in-as").textContent = `${profileName()} — دسترسی: ${userRole==="admin"?"مدیر اصلی":"ویرایشگر"}`;
      $("#auth-message").textContent = "";
      renderManageList();
    } else if (currentUser) {
      $("#auth-message").textContent = "این حساب اجازهٔ مدیریت محتوا ندارد. با مدیر اصلی تماس بگیرید.";
    }
  }
  function profileName() { return currentUser?.email || "مدیر"; }
  async function requireEditor() {
    if (!db || !currentUser || !["admin","editor"].includes(userRole)) throw new Error("برای این کار باید با حساب مدیر یا ویرایشگر وارد شوید.");
  }
  async function insertRecord(table, record) {
    await requireEditor();
    const {error} = await db.from(table).insert(record);
    if (error) throw error;
    toast("با موفقیت ثبت شد.");
    await loadData();
  }
  function renderManageList() {
    const el = $("#manage-list");
    if (!el) return;
    const all = [
      ...state.announcements.map(x=>({...x,_table:"announcements",_label:"اطلاعیه"})),
      ...state.assignments.map(x=>({...x,_table:"assignments",_label:"وظیفه/امتحان"})),
      ...state.timetable.map(x=>({...x,_table:"timetable",_label:"تقسیم اوقات"})),
      ...state.groups.map(x=>({...x,_table:"class_groups",_label:"گروپ"})),
      ...state.files.map(x=>({...x,_table:"course_files",_label:"فایل"}))
    ];
    if (!currentUser || !["admin","editor"].includes(userRole)) { el.innerHTML=""; return; }
    el.innerHTML = all.length ? all.map(x=>`<div class="manage-row"><div><small>${esc(x._label)}</small><strong>${esc(x.title || x.subject || x.name || "بدون عنوان")}</strong></div><button class="button button-danger" data-delete-table="${esc(x._table)}" data-delete-id="${esc(x.id)}">حذف</button></div>`).join("") : `<div class="empty-state">محتوایی برای مدیریت وجود ندارد.</div>`;
  }
  async function handleForm(form, table, mapper) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit],button:not([type])");
      if (btn) {btn.disabled=true;btn.dataset.old=btn.textContent;btn.textContent="لطفاً صبر کنید…";}
      try { const fd = new FormData(form); await insertRecord(table, mapper(fd)); form.reset(); }
      catch(err) { toast(err.message || "خطا هنگام ثبت اطلاعات."); }
      finally { if(btn){btn.disabled=false;btn.textContent=btn.dataset.old||"ثبت";} }
    });
  }
  $("#admin-open").addEventListener("click", () => { openAdmin(); refreshAuth(); });
  $("#admin-close").addEventListener("click", () => { $("#admin-panel").hidden = true; });
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!db) return toast("ابتدا اتصال Supabase را تنظیم کنید.");
    $("#auth-message").textContent = "در حال ورود…";
    const {error} = await db.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});
    if (error) { $("#auth-message").textContent = "ورود انجام نشد: ایمیل و رمز عبور را بررسی کنید."; return; }
    await refreshAuth(); await loadData();
  });
  $("#logout").addEventListener("click", async () => { if(db) await db.auth.signOut(); currentUser=null;userRole=null; await refreshAuth();toast("از حساب خارج شدید."); });
  handleForm($("#announcement-form"),"announcements",fd=>({title:fd.get("title").trim(),body:fd.get("body").trim(),category:fd.get("category"),created_by:currentUser.id}));
  handleForm($("#assignment-form"),"assignments",fd=>({title:fd.get("title").trim(),description:fd.get("description").trim(),kind:fd.get("kind"),due_date:fd.get("due_date")||null,created_by:currentUser.id}));
  handleForm($("#timetable-form"),"timetable",fd=>({day:fd.get("day").trim(),time:fd.get("time").trim(),subject:fd.get("subject").trim(),teacher_room:fd.get("teacher_room").trim(),created_by:currentUser.id}));
  handleForm($("#group-form"),"class_groups",fd=>({name:fd.get("name").trim(),members:fd.get("members").split("\n").map(x=>x.trim()).filter(Boolean),created_by:currentUser.id}));
  $("#file-form").addEventListener("submit", async e => {
    e.preventDefault(); const form=e.currentTarget; const btn=form.querySelector("button");
    try {
      await requireEditor();
      const fd=new FormData(form), file=fd.get("file"), title=fd.get("title").trim();
      if(!file || !file.size) throw new Error("یک فایل انتخاب کنید.");
      if(file.size > 15*1024*1024) throw new Error("حداکثر اندازهٔ فایل ۱۵ مگابایت است.");
      btn.disabled=true;btn.textContent="در حال بارگذاری…";
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`${Date.now()}-${safeName}`;
      const up=await db.storage.from("course-files").upload(path,file,{upsert:false});
      if(up.error) throw up.error;
      const {data:urlData}=db.storage.from("course-files").getPublicUrl(path);
      const {error}=await db.from("course_files").insert({title,file_name:file.name,storage_path:path,url:urlData.publicUrl,created_by:currentUser.id});
      if(error) throw error;
      form.reset();toast("فایل بارگذاری و نشر شد.");await loadData();
    } catch(err) { toast(err.message || "بارگذاری انجام نشد."); }
    finally {btn.disabled=false;btn.textContent="بارگذاری و نشر";}
  });
  $("#manage-list").addEventListener("click", async e => {
    const btn=e.target.closest("[data-delete-table]");
    if(!btn || !confirm("آیا مطمئن هستید که این مورد حذف شود؟")) return;
    try {
      await requireEditor();
      const table=btn.dataset.deleteTable,id=btn.dataset.deleteId;
      const {error}=await db.from(table).delete().eq("id",id);
      if(error) throw error;
      toast("مورد حذف شد."); await loadData();
    } catch(err) {toast(err.message||"حذف انجام نشد.");}
  });
  $("#year").textContent = new Date().getFullYear();
  if (!db) {
    const note = document.createElement("div");
    note.className = "config-warning";
    note.innerHTML = "<strong>حالت پیش‌نمایش:</strong> سایت فعال است، اما دیتابیس هنوز وصل نشده. برای ذخیرهٔ واقعی و ورود مدیر، فایل <code>config.js</code> را تنظیم کنید.";
    document.querySelector("main").prepend(note);
  }
  loadData();
  if (db) { refreshAuth(); db.auth.onAuthStateChange(()=>refreshAuth()); }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
})();
