// app.js — the browser side. It draws each screen and talks to the server with fetch().
// The address after "#" decides the screen: "#/browse", "#/project/5", "#/record" and so on.

let currentUser = null;                              // the logged-in user, or null
const view = document.getElementById('view');        // the <main> element that screens are drawn into

// ======================= helpers =======================

// Sends a request to the server and returns the JSON answer. Throws an Error with the server's
// message if something went wrong, so every screen can show the reason to the user.
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);             // turn the JavaScript object into JSON text
  }
  const response = await fetch(url, options);        // wait for the server to answer
  const data = await response.json().catch(() => ({}));   // read the JSON body (or {} if there is none)
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

// Makes text safe to put inside HTML. Without this, a project titled "<script>…" would run as code
// in every visitor's browser (a cross-site scripting / XSS attack).
function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch]);
}

// Shows a green (success) or red (error) message at the top of the page for 6 seconds.
let messageTimer;
function showMessage(text, type = 'error') {
  const box = document.getElementById('message');
  box.textContent = text;                            // textContent never interprets HTML — always safe
  box.className = `message ${type}`;
  box.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { box.hidden = true; }, 6000);
}

// Reads every named field of a <form> into an object: { title: '...', hours: '4', ... }.
function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// "2026-10-24" → "24 Oct 2026" (easier to read).
function niceDate(text) {
  return new Date(`${text}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const strandTag = (strand) => `<span class="tag ${esc(strand)}">${esc(strand)}</span>`;

// ======================= navigation =======================

// Which links each role sees in the top bar.
const NAV = {
  student: [['browse', 'Find projects'], ['new', 'Create project'], ['mine', 'My projects'], ['record', 'My CAS record']],
  teacher: [['teacher', 'Approvals & progress'], ['browse', 'Browse projects']],
  principal: [['members', 'Students & teachers'], ['browse', 'Browse projects']],
  admin: [['schools', 'Schools']],
};

function renderTopbar() {
  const nav = document.getElementById('nav');
  const who = document.getElementById('who');
  if (!currentUser) { nav.innerHTML = ''; who.innerHTML = ''; return; }
  const page = location.hash.split('/')[1];
  nav.innerHTML = NAV[currentUser.role]
    .map(([hash, label]) => `<a href="#/${hash}" class="${hash === page ? 'active' : ''}">${label}</a>`).join('');
  who.innerHTML = `${esc(currentUser.name)} (${esc(currentUser.role)}) <button id="logout">Log out</button>`;
  document.getElementById('logout').onclick = async () => {
    await api('POST', '/api/auth/logout');
    currentUser = null;
    location.hash = '#/login';
  };
}

// Picks the right screen for the current address and draws it.
async function router() {
  const [, page, id] = location.hash.split('/');      // "#/project/5" → ["#", "project", "5"]
  renderTopbar();
  if (!currentUser) return page === 'activate' ? showActivate() : showLogin();

  const screens = {
    browse: showBrowse, project: showProject, new: showCreate, mine: showMine, record: showRecord,
    teacher: showTeacher, members: showMembers, schools: showSchools,
  };
  const allowed = NAV[currentUser.role].map(([hash]) => hash).concat('project');
  if (!allowed.includes(page)) {                     // unknown page or not for this role → home screen
    location.hash = `#/${NAV[currentUser.role][0][0]}`;
    return;
  }
  try {
    await screens[page](id);
  } catch (err) {
    showMessage(err.message);
  }
}

// ======================= login & activation =======================

async function schoolOptions(includeAdmin) {
  const schools = await api('GET', '/api/auth/schools');
  const options = schools.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  return includeAdmin ? `${options}<option value="">Service provider (platform admin)</option>` : options;
}

async function showLogin() {
  view.innerHTML = `
    <section class="panel narrow">
      <h1>Log in</h1>
      <form class="stack" id="login-form">
        <label>School <select name="schoolId" required>${await schoolOptions(true)}</select></label>
        <label>School ID <input name="loginId" required maxlength="12" placeholder="e.g. S1001" autocomplete="username"></label>
        <label>Password <input name="password" type="password" required autocomplete="current-password"></label>
        <button>Log in</button>
      </form>
      <p class="meta">First time here? <a href="#/activate">Activate your account</a> with the ID your school gave you.</p>
    </section>`;
  document.getElementById('login-form').onsubmit = async (event) => {
    event.preventDefault();                          // stop the browser reloading the page
    try {
      const data = await api('POST', '/api/auth/login', formData(event.target));
      currentUser = data.user;
      location.hash = `#/${NAV[currentUser.role][0][0]}`;
      router();                                      // the hash may not change, so draw the screen directly
    } catch (err) {
      showMessage(err.message);
    }
  };
}

async function showActivate() {
  view.innerHTML = `
    <section class="panel narrow">
      <h1>Activate your account</h1>
      <form class="stack" id="activate-form">
        <label>School <select name="schoolId" required>${await schoolOptions(false)}</select></label>
        <label>School ID <input name="loginId" required maxlength="12"></label>
        <label>New password (8+ characters, a letter and a number)
          <input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>Repeat password <input name="confirm" type="password" required autocomplete="new-password"></label>
        <button>Activate</button>
      </form>
      <p class="meta"><a href="#/login">Back to log in</a></p>
    </section>`;
  document.getElementById('activate-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = formData(event.target);
    if (data.password !== data.confirm) return showMessage('The two passwords do not match.');
    try {
      const result = await api('POST', '/api/auth/activate', data);
      showMessage(result.message, 'success');
      location.hash = '#/login';
    } catch (err) {
      showMessage(err.message);
    }
  };
}

// ======================= student: search =======================

function placesText(places) {
  return ['participant', 'volunteer', 'organizer']
    .filter((role) => places[role].total > 0)
    .map((role) => `${places[role].total - places[role].taken} ${role}`)
    .join(' · ') + ' places left';
}

function projectCard(p) {
  return `
    <article class="card">
      <div>${strandTag(p.strand)}${p.interschool ? '<span class="tag light">Interschool</span>' : ''}
           ${p.status === 'ongoing' ? '<span class="tag light">Ongoing</span>' : ''}</div>
      <h3><a href="#/project/${p.id}">${esc(p.title)}</a></h3>
      <div class="meta">${esc(p.schoolName)} · ${esc(p.location)}</div>
      <div class="meta">${niceDate(p.startDate)} – ${niceDate(p.endDate)} · ${p.hours} CAS hours${p.fee ? ` · ₹${p.fee}` : ''}</div>
      <div class="meta">Apply by ${niceDate(p.applyDeadline)} · ${placesText(p.places)}</div>
    </article>`;
}

async function showBrowse() {
  view.innerHTML = `
    <h1>Find CAS projects</h1>
    <form class="panel grid" id="search-form">
      <label>Keywords <input name="q" placeholder="e.g. beach, football, painting"></label>
      <label>Strand
        <select name="strand"><option value="">All strands</option>
          <option>Creativity</option><option>Activity</option><option>Service</option></select></label>
      <label>Schools
        <select name="scope"><option value="all">My school + interschool</option>
          <option value="mine">My school only</option><option value="other">Other schools only</option></select></label>
      <label class="check"><input type="checkbox" name="openOnly" value="1" checked> Still accepting sign-ups</label>
      <button>Search</button>
    </form>
    <p class="meta" id="result-count"></p>
    <div class="cards" id="results"></div>`;
  const form = document.getElementById('search-form');
  const search = async () => {
    const params = new URLSearchParams(formData(form));   // { q: 'beach' } → "q=beach"
    const projects = await api('GET', `/api/projects?${params}`);
    document.getElementById('result-count').textContent = `${projects.length} project(s) found`;
    document.getElementById('results').innerHTML = projects.length
      ? projects.map(projectCard).join('')
      : '<p>No projects match. Try fewer or shorter keywords.</p>';
  };
  form.onsubmit = (event) => { event.preventDefault(); search().catch((err) => showMessage(err.message)); };
  await search();                                         // show all projects straight away
}

// ======================= project details =======================

async function showProject(id) {
  const p = await api('GET', `/api/projects/${id}`);
  const canJoin = currentUser.role === 'student' && !p.isCreator && !p.myRequest && ['approved', 'ongoing'].includes(p.status);

  let joinHtml = '';
  if (canJoin) {
    joinHtml = `<div class="actions">${['participant', 'volunteer', 'organizer']
      .filter((role) => p.places[role].total > 0)
      .map((role) => `<button data-role="${role}" ${p.places[role].taken >= p.places[role].total ? 'disabled' : ''}>
          Join as ${role}</button>`).join('')}</div>`;
  } else if (p.myRequest) {
    joinHtml = `<p>Your request to join as <b>${esc(p.myRequest.role)}</b> is <b>${esc(p.myRequest.status)}</b>.</p>`;
  }

  let requestsHtml = '';
  if (p.requests) {
    const rows = p.requests.map((r) => `
      <tr><td>${esc(r.name)} <span class="meta">${esc(r.loginId)}, ${esc(r.schoolName)}</span></td>
          <td>${esc(r.role)}</td><td>${esc(r.status)}</td>
          <td>${p.isCreator && r.status === 'pending' ? `<div class="actions">
              <button data-request="${r.id}" data-decision="accepted">Accept</button>
              <button class="secondary" data-request="${r.id}" data-decision="rejected">Reject</button></div>` : ''}</td></tr>`).join('');
    requestsHtml = `<h2>Requests to join</h2>
      <div class="table-wrap"><table><tr><th>Student</th><th>Role</th><th>Status</th><th></th></tr>
      ${rows || '<tr><td colspan="4">No requests yet.</td></tr>'}</table></div>`;
  }

  view.innerHTML = `
    <section class="panel">
      <div>${strandTag(p.strand)}<span class="tag light">${esc(p.status)}</span>${p.interschool ? '<span class="tag light">Interschool</span>' : ''}</div>
      <h1>${esc(p.title)}</h1>
      <p>${esc(p.description)}</p>
      <p class="meta">Organised by ${esc(p.creatorName)}, ${esc(p.schoolName)} · ${esc(p.location)}<br>
        ${niceDate(p.startDate)} – ${niceDate(p.endDate)} · ${p.hours} CAS hours · ${p.fee ? `Fee ₹${p.fee}` : 'Free'}<br>
        Apply by ${niceDate(p.applyDeadline)} · ${placesText(p.places)}</p>
      ${p.teacherComment ? `<p class="meta">Coordinator's comment: ${esc(p.teacherComment)}</p>` : ''}
      ${joinHtml}
    </section>
    ${requestsHtml}`;

  // "Join as …" buttons
  view.querySelectorAll('button[data-role]').forEach((button) => {
    button.onclick = async () => {
      try {
        const result = await api('POST', `/api/projects/${id}/join`, { role: button.dataset.role });
        showMessage(result.message, 'success');
        showProject(id);                                  // redraw with the new status
      } catch (err) { showMessage(err.message); }
    };
  });
  // "Accept" / "Reject" buttons (creator only)
  view.querySelectorAll('button[data-request]').forEach((button) => {
    button.onclick = async () => {
      try {
        const result = await api('POST', `/api/memberships/${button.dataset.request}/decision`, { decision: button.dataset.decision });
        showMessage(result.message, 'success');
        showProject(id);
      } catch (err) { showMessage(err.message); }
    };
  });
}

// ======================= student: create project =======================

function showCreate() {
  const today = new Date().toISOString().slice(0, 10);
  view.innerHTML = `
    <h1>Create a CAS project</h1>
    <form class="panel grid" id="create-form">
      <label class="full">Title <input name="title" required minlength="5" maxlength="80"></label>
      <label class="full">Description <textarea name="description" required minlength="20" maxlength="1000"></textarea></label>
      <label>Strand <select name="strand" required><option>Creativity</option><option>Activity</option><option>Service</option></select></label>
      <label>Location <input name="location" required maxlength="100"></label>
      <label>Start date <input type="date" name="startDate" required min="${today}"></label>
      <label>End date <input type="date" name="endDate" required min="${today}"></label>
      <label>Apply by <input type="date" name="applyDeadline" required min="${today}"></label>
      <label>CAS hours <input type="number" name="hours" required min="1" max="200" value="4"></label>
      <label>Fee (₹, 0 = free) <input type="number" name="fee" min="0" max="100000" value="0"></label>
      <label>Participant places <input type="number" name="capParticipant" min="0" max="500" value="10"></label>
      <label>Volunteer places <input type="number" name="capVolunteer" min="0" max="100" value="2"></label>
      <label>Organizer places <input type="number" name="capOrganizer" min="0" max="20" value="1"></label>
      <label class="check full"><input type="checkbox" name="interschool" value="true"> Open to students from other IBDP schools</label>
      <div class="full"><button>Send for approval</button></div>
    </form>`;
  document.getElementById('create-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api('POST', '/api/projects', formData(event.target));
      showMessage(result.message, 'success');
      location.hash = '#/mine';
    } catch (err) { showMessage(err.message); }
  };
}

// ======================= student: my projects =======================

async function showMine() {
  const { created, joined } = await api('GET', '/api/my/projects');
  const createdRows = created.map((p) => `
    <tr><td><a href="#/project/${p.id}">${esc(p.title)}</a></td><td>${strandTag(p.strand)}</td><td>${esc(p.status)}
      ${p.teacherComment ? `<div class="meta">${esc(p.teacherComment)}</div>` : ''}</td>
      <td>${p.members}</td><td>${p.pendingRequests ? `<b>${p.pendingRequests} waiting</b>` : '0'}</td></tr>`).join('');
  const joinedRows = joined.map((p) => `
    <tr><td><a href="#/project/${p.id}">${esc(p.title)}</a></td><td>${strandTag(p.strand)}</td>
      <td>${esc(p.role)}</td><td>${esc(p.status)}</td><td>${esc(p.projectStatus)}</td></tr>`).join('');
  view.innerHTML = `
    <h1>My projects</h1>
    <h2>Projects I created</h2>
    <div class="table-wrap"><table><tr><th>Title</th><th>Strand</th><th>Status</th><th>Members</th><th>Requests</th></tr>
      ${createdRows || '<tr><td colspan="5">None yet — <a href="#/new">create one</a>.</td></tr>'}</table></div>
    <h2>Projects I asked to join</h2>
    <div class="table-wrap"><table><tr><th>Title</th><th>Strand</th><th>My role</th><th>My request</th><th>Project</th></tr>
      ${joinedRows || '<tr><td colspan="5">None yet — <a href="#/browse">find one</a>.</td></tr>'}</table></div>`;
}

// ======================= student: CAS record =======================

async function showRecord() {
  const record = await api('GET', '/api/my/cas-record');
  const rows = record.entries.map((e) => `
    <tr><td>${esc(e.title)}</td><td>${strandTag(e.strand)}</td><td>${esc(e.role)}</td><td>${esc(e.school_name)}</td>
      <td>${niceDate(e.start_date)}</td><td>${esc(e.status)}</td><td>${e.status === 'completed' ? e.hours : '–'}</td></tr>`).join('');
  view.innerHTML = `
    <h1>CAS record — ${esc(record.student.name)}</h1>
    <p class="meta">${esc(record.student.loginId)} · ${esc(record.student.school)} · ${record.completed} completed project(s)</p>
    <div class="totals">
      ${['Creativity', 'Activity', 'Service'].map((s) => `<div class="total">${strandTag(s)}<strong>${record.totals[s]} h</strong></div>`).join('')}
      <div class="total">Total<strong>${record.totals.all} h</strong></div>
    </div>
    <h2>Activities</h2>
    <div class="table-wrap"><table><tr><th>Project</th><th>Strand</th><th>Role</th><th>School</th><th>Start</th><th>Status</th><th>Hours</th></tr>
      ${rows || '<tr><td colspan="7">No activities yet.</td></tr>'}</table></div>
    <p class="meta">Hours count only after the CAS coordinator marks a project completed.</p>
    <p class="no-print"><button onclick="window.print()">Print / save as PDF</button></p>`;
}

// ======================= teacher =======================

async function showTeacher() {
  const projects = await api('GET', '/api/teacher/projects');
  const nextStep = { pending: ['approved', 'Approve'], approved: ['ongoing', 'Mark started'], ongoing: ['completed', 'Mark completed'] };
  const rows = projects.map((p) => {
    const step = nextStep[p.status];
    const buttons = step ? `<button data-id="${p.id}" data-status="${step[0]}">${step[1]}</button>` : '';
    const reject = p.status === 'pending' ? `<button class="secondary" data-id="${p.id}" data-status="rejected">Reject</button>` : '';
    const deadline = ['pending', 'approved', 'ongoing'].includes(p.status)
      ? `<input type="date" value="${p.applyDeadline}" data-deadline="${p.id}"> <button class="secondary" data-save="${p.id}">Save</button>`
      : niceDate(p.applyDeadline);
    return `<tr><td><a href="#/project/${p.id}">${esc(p.title)}</a><div class="meta">by ${esc(p.creatorName)}</div></td>
      <td>${strandTag(p.strand)}</td><td>${esc(p.status)}</td><td>${niceDate(p.startDate)} – ${niceDate(p.endDate)}</td>
      <td>${p.members}</td><td>${deadline}</td><td><div class="actions">${buttons}${reject}</div></td></tr>`;
  }).join('');
  view.innerHTML = `
    <h1>Approvals & project progress</h1>
    <div class="table-wrap"><table>
      <tr><th>Project</th><th>Strand</th><th>Status</th><th>Dates</th><th>Members</th><th>Apply by</th><th>Action</th></tr>
      ${rows || '<tr><td colspan="7">No projects yet.</td></tr>'}</table></div>`;

  view.querySelectorAll('button[data-status]').forEach((button) => {
    button.onclick = async () => {
      let comment = '';
      if (button.dataset.status === 'rejected') {
        comment = prompt('Reason for rejecting (the student will see this):');
        if (comment === null) return;                         // teacher pressed Cancel
      }
      try {
        const result = await api('POST', `/api/teacher/projects/${button.dataset.id}/status`, { status: button.dataset.status, comment });
        showMessage(result.message, 'success');
        showTeacher();
      } catch (err) { showMessage(err.message); }
    };
  });
  view.querySelectorAll('button[data-save]').forEach((button) => {
    button.onclick = async () => {
      const input = view.querySelector(`input[data-deadline="${button.dataset.save}"]`);
      try {
        const result = await api('POST', `/api/teacher/projects/${button.dataset.save}/deadline`, { applyDeadline: input.value });
        showMessage(result.message, 'success');
        showTeacher();
      } catch (err) { showMessage(err.message); }
    };
  });
}

// ======================= principal =======================

async function showMembers() {
  const members = await api('GET', '/api/principal/members');
  const rows = members.map((m) => `
    <tr><td>${esc(m.loginId)}</td><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td>${m.activated ? 'Yes' : 'Not yet'}</td>
      <td><button class="danger" data-remove="${m.id}" data-name="${esc(m.name)}">Remove</button></td></tr>`).join('');
  view.innerHTML = `
    <h1>Students & teachers — ${esc(currentUser.schoolName)}</h1>
    <form class="panel grid" id="member-form">
      <label>School ID <input name="loginId" required minlength="3" maxlength="12" placeholder="S1005"></label>
      <label>Full name <input name="name" required minlength="2" maxlength="60"></label>
      <label>Role <select name="role"><option value="student">Student</option><option value="teacher">Teacher (CAS coordinator)</option></select></label>
      <button>Add</button>
    </form>
    <div class="table-wrap"><table><tr><th>ID</th><th>Name</th><th>Role</th><th>Activated</th><th></th></tr>
      ${rows || '<tr><td colspan="5">Nobody added yet.</td></tr>'}</table></div>`;

  document.getElementById('member-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api('POST', '/api/principal/members', formData(event.target));
      showMessage(result.message, 'success');
      showMembers();
    } catch (err) { showMessage(err.message); }
  };
  view.querySelectorAll('button[data-remove]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm(`Remove ${button.dataset.name}? They will no longer be able to log in.`)) return;
      try {
        const result = await api('DELETE', `/api/principal/members/${button.dataset.remove}`);
        showMessage(result.message, 'success');
        showMembers();
      } catch (err) { showMessage(err.message); }
    };
  });
}

// ======================= service provider (admin) =======================

async function showSchools() {
  const schools = await api('GET', '/api/admin/schools');
  const rows = schools.map((s) => `
    <tr><td>${esc(s.name)}</td><td>${esc(s.city)}</td><td>${esc(s.principal || '— none —')}</td><td>${s.students}</td>
      <td><form class="actions" data-principal="${s.id}">
            <input name="loginId" placeholder="Principal ID" required size="8">
            <input name="name" placeholder="Principal name" required size="14">
            <button class="secondary">Assign principal</button></form></td>
      <td><button class="danger" data-remove="${s.id}" data-name="${esc(s.name)}">Remove</button></td></tr>`).join('');
  view.innerHTML = `
    <h1>Schools on the platform</h1>
    <form class="panel grid" id="school-form">
      <label>School name <input name="name" required minlength="3" maxlength="80"></label>
      <label>City <input name="city" required minlength="2" maxlength="40"></label>
      <button>Add school</button>
    </form>
    <div class="table-wrap"><table><tr><th>School</th><th>City</th><th>Principal</th><th>Students</th><th>Assign principal</th><th></th></tr>
      ${rows || '<tr><td colspan="6">No schools yet.</td></tr>'}</table></div>`;

  document.getElementById('school-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api('POST', '/api/admin/schools', formData(event.target));
      showMessage(result.message, 'success');
      showSchools();
    } catch (err) { showMessage(err.message); }
  };
  view.querySelectorAll('form[data-principal]').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        const result = await api('POST', `/api/admin/schools/${form.dataset.principal}/principal`, formData(form));
        showMessage(result.message, 'success');
        showSchools();
      } catch (err) { showMessage(err.message); }
    };
  });
  view.querySelectorAll('button[data-remove]').forEach((button) => {
    button.onclick = async () => {
      if (!confirm(`Remove ${button.dataset.name} and log out all of its users?`)) return;
      try {
        const result = await api('DELETE', `/api/admin/schools/${button.dataset.remove}`);
        showMessage(result.message, 'success');
        showSchools();
      } catch (err) { showMessage(err.message); }
    };
  });
}

// ======================= start-up =======================

window.addEventListener('hashchange', router);       // redraw whenever the address after "#" changes

// Ask the server whether we are already logged in (the session cookie may still be valid), then draw.
api('GET', '/api/auth/me')
  .then((data) => { currentUser = data.user; })
  .catch(() => { currentUser = null; })
  .finally(router);
