'use strict';
const $ = id => document.getElementById(id);
const state = {operator: null, users: [], usersPage: 1, messagesPage: 1, selectedUser: null, selectedMessage: null, selectedArgument: null, arguments: [], argumentsPage: 1, settings: {auto_approve_all: false, revision: 0}, defaultReasons: {}};
let usersRequest = 0, messagesRequest = 0, argumentsRequest = 0, resolvingDialog, preparingDialog = false;
const date = value => new Date(value).toLocaleString();
function element(tag, text, className) {
  const node = document.createElement(tag); if (text != null) node.textContent = text;
  if (className) node.className = className; return node;
}
function badge(value) { return element('span', value, 'badge ' + value); }
function notice(text, error = false) {
  $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = false;
}
async function request(path = '', data) {
  const response = await fetch('/api/admin' + path, {cache: 'no-store', credentials: 'same-origin',
    ...(data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Argument-Request': '1'}, body: JSON.stringify(data)})});
  if (response.status === 401) { location.replace('/user/?next=%2Fadmin%2F'); throw new Error('Please log in again.'); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), {status: response.status});
  return result;
}
async function run(work) { try { await work(); } catch (error) { notice(error.message, true); } }
function syncApproval(settings) {
  state.settings = settings;
  $('auto-approve-all').checked = settings.auto_approve_all;
  document.querySelector('.approval-settings').classList.toggle('enabled', settings.auto_approve_all);
  $('approval-mode-status').textContent = settings.auto_approve_all ? 'ON · approved by auto' : 'OFF · default notes are editable before confirmation';
}
function reviewBadge(item) { const node = badge(item.status); if (item.reviewNote) node.textContent = item.reviewNote; return node; }
async function ask(title, description, {password = false, danger = false, reason = 'Approved by administrator.'} = {}) {
  if (preparingDialog || resolvingDialog) return null;
  preparingDialog = true;
  try { syncApproval(await request('/settings')); }
  catch (error) { notice(error.message, true); return null; }
  finally { preparingDialog = false; }
  if (state.settings.auto_approve_all && !password) return {reason: 'approved by auto', password: ''};
  $('confirm-form').reset(); $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('operator-note').value = state.settings.auto_approve_all ? 'approved by auto' : reason;
  $('new-password-label').hidden = !password; $('new-password').required = password;
  $('confirm-submit').className = danger ? 'danger' : '';
  $('confirm-dialog').showModal();
  (password ? $('new-password') : $('confirm-submit')).focus();
  return new Promise(resolve => { resolvingDialog = resolve; });
}
$('confirm-form').onsubmit = event => {
  event.preventDefault();
  if (!$('confirm-form').reportValidity()) return;
  const result = {reason: $('operator-note').value.trim(), password: $('new-password').value};
  if (!result.reason) return;
  const resolve = resolvingDialog; resolvingDialog = null;
  $('confirm-dialog').close(); $('confirm-form').reset(); resolve?.(result);
};
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
$('confirm-dialog').onclose = () => { resolvingDialog?.(null); resolvingDialog = null; $('confirm-form').reset(); };

async function overview() {
  const data = await request(); state.operator = data.user;
  state.defaultReasons = data.defaultReasons; syncApproval(data.settings);
  $('operator').textContent = data.user.username;
  const pending = data.messages.pending || 0;
  const pendingArguments = data.arguments.pending || 0;
  $('pending-count').textContent = pending + pendingArguments; $('nav-pending').textContent = pending; $('nav-arguments').textContent = pendingArguments;
  document.querySelector('.metrics > a').href = pending || !pendingArguments ? '#messages' : '#arguments';
  $('pending-breakdown').textContent = `${pending} messages · ${pendingArguments} arguments`;
  $('user-count').textContent = data.users.total; $('disabled-count').textContent = `${data.users.disabled} disabled · ${data.users.total - data.users.disabled} enabled`;
  $('admin-count').textContent = data.users.admins;
  const activity = $('activity'); activity.replaceChildren();
  for (const event of data.events) {
    const row = element('div', null, 'activity-row');
    const label = element('p'); label.append(element('strong', event.actorName), document.createTextNode(' · ' + event.action));
    const time = element('time', date(event.createdAt)); time.dateTime = new Date(event.createdAt).toISOString();
    const target = event.details.username || event.targetId;
    row.append(label, time, element('small', `${target} — ${event.details.reason || ''}`)); activity.append(row);
  }
  if (!data.events.length) activity.append(element('p', 'No operator activity recorded yet.', 'muted'));
}
function pagination(prefix, data, noun) {
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  $(prefix + '-page').textContent = `${data.total} ${data.total === 1 ? noun.replace(/s$/, '') : noun} · ${data.page} / ${pages}`;
  $(prefix + '-prev').disabled = data.page <= 1;
  $(prefix + '-next').disabled = data.page >= pages;
}
async function users() {
  const token = ++usersRequest;
  const query = new URLSearchParams({page: state.usersPage, search: $('user-search').value});
  const data = await request('/users?' + query);
  if (token !== usersRequest) return;
  state.users = data.users;
  const list = $('user-list'); list.replaceChildren();
  for (const user of data.users) {
    const row = element('tr'), name = element('td');
    name.append(element('strong', user.username), element('small', user.displayName));
    const access = element('td'); access.append(badge(user.disabled ? 'disabled' : user.role));
    const sessions = element('td', user.sessions), actions = element('td');
    const manage = element('button', 'Manage', 'quiet'); manage.setAttribute('aria-label', 'Manage ' + user.username);
    manage.onclick = () => openUser(user); actions.append(manage);
    row.append(name, access, sessions, actions); list.append(row);
  }
  if (!data.users.length) { const row = element('tr'), cell = element('td', 'No matching accounts.', 'muted'); cell.colSpan = 4; row.append(cell); list.append(row); }
  pagination('users', data, 'accounts');
  if (state.selectedUser) {
    const updated = data.users.find(user => user.id === state.selectedUser.id);
    if (updated) openUser(updated); else closeUser();
  }
}
function openUser(user) {
  state.selectedUser = user; $('user-detail').hidden = false;
  $('detail-username').textContent = user.username;
  $('detail-meta').textContent = `${user.role} · ${user.disabled ? 'disabled' : 'enabled'} · joined ${date(user.createdAt)}`;
  $('display-name').value = user.displayName;
  const self = user.id === state.operator?.id;
  $('toggle-access').textContent = user.disabled ? 'Enable account' : 'Disable account'; $('toggle-access').disabled = self;
  $('toggle-role').textContent = user.role === 'admin' ? 'Remove admin access' : 'Grant admin access'; $('toggle-role').disabled = self;
}
function closeUser() { state.selectedUser = null; $('user-detail').hidden = true; }
async function changeUser(action, extra, title, description, options) {
  const target = state.selectedUser; if (!target) return;
  const confirmation = await ask(title + ' — ' + target.username, description, {...options, reason: state.defaultReasons.user?.[action]});
  if (!confirmation) return;
  await run(async () => {
    const result = await request('/users/' + encodeURIComponent(target.id), {action, ...extra, ...confirmation});
    if (result.signedOut) { location.assign('/user/?next=%2Fadmin%2F'); return; }
    notice('Account updated: ' + target.username); await Promise.all([users(), overview()]);
  });
}
$('close-user').onclick = closeUser;
$('display-name-form').onsubmit = event => { event.preventDefault(); changeUser('displayName', {displayName: $('display-name').value}, 'Change display name', 'The new display name applies to future posts.'); };
$('toggle-access').onclick = () => changeUser('access', {disabled: !state.selectedUser.disabled}, state.selectedUser.disabled ? 'Enable account' : 'Disable account', 'Disabling immediately signs out all sessions. Re-enabling requires a fresh login.', {danger: !state.selectedUser.disabled});
$('revoke-sessions').onclick = () => changeUser('sessions', {}, 'Sign out all sessions', 'This account will need to log in again on every device.', {danger: true});
$('reset-password').onclick = () => changeUser('password', {}, 'Set a new password', 'All current sessions will be signed out. Communicate the new password privately.', {password: true, danger: true});
$('toggle-role').onclick = () => changeUser('role', {role: state.selectedUser.role === 'admin' ? 'user' : 'admin'}, state.selectedUser.role === 'admin' ? 'Remove admin access' : 'Grant admin access', 'Administrators can manage accounts and read the private message inbox.', {danger: true});
$('create-user-form').onsubmit = async event => {
  event.preventDefault(); const form = event.target;
  const data = {username: form.elements.username.value, password: form.elements.password.value};
  if (form.elements.displayName.value.trim()) data.displayName = form.elements.displayName.value.trim();
  const confirmation = await ask('Create account — ' + data.username, 'This account will have ordinary user access.', {reason: state.defaultReasons.user?.create});
  if (!confirmation) return;
  await run(async () => {
    await request('/users', {...data, reason: confirmation.reason}); form.reset(); state.usersPage = 1;
    notice('Account created: ' + data.username); await Promise.all([users(), overview()]);
  });
};
$('user-search-form').onsubmit = event => { event.preventDefault(); state.usersPage = 1; run(users); };
$('refresh-users').onclick = () => run(users);
$('users-prev').onclick = () => { state.usersPage--; run(users); };
$('users-next').onclick = () => { state.usersPage++; run(users); };

async function messages() {
  const token = ++messagesRequest;
  const query = new URLSearchParams({page: state.messagesPage, status: $('message-status').value, order: $('message-order').value, search: $('message-search').value});
  const data = await request('/messages?' + query);
  if (token !== messagesRequest) return;
  const list = $('message-list'); list.replaceChildren();
  for (const message of data.messages) {
    const button = element('button', null, 'message-item'); button.type = 'button';
    button.dataset.messageId = message.id; button.setAttribute('aria-pressed', String(message.id === state.selectedMessage?.id));
    const heading = element('span'); heading.append(reviewBadge(message), element('time', date(message.createdAt)));
    button.append(heading, element('span', message.excerpt, 'excerpt'), element('small', `${message.username || (message.senderType === 'account' ? 'Former account' : 'Guest')} · ${message.words} words`));
    button.onclick = () => run(() => openMessage(message.id)); list.append(button);
  }
  if (!data.messages.length) { const empty = element('p', 'No messages match these filters.', 'muted'); empty.classList.add('message-body'); list.append(empty); }
  pagination('messages', data, 'messages');
}
async function openMessage(id) {
  const message = await request('/messages/' + encodeURIComponent(id));
  state.selectedMessage = message; $('message-detail').hidden = false;
  $('message-meta').textContent = `${message.reviewNote || message.status} · ${date(message.createdAt)} · ${message.username || message.senderType} · ${message.words} words`;
  $('message-reference').textContent = 'Reference ' + message.id;
  $('message-body').textContent = message.body;
  for (const button of document.querySelectorAll('[data-decision]')) button.disabled = button.dataset.decision === message.status || (state.settings.auto_approve_all && button.dataset.decision === 'pending');
  for (const button of document.querySelectorAll('[data-message-id]')) {
    const selected = button.dataset.messageId === id; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
}
function closeMessage() { state.selectedMessage = null; $('message-detail').hidden = true; }
$('close-message').onclick = closeMessage;
for (const button of document.querySelectorAll('[data-decision]')) button.onclick = async () => {
  const message = state.selectedMessage; if (!message) return;
  const decision = button.dataset.decision;
  const confirmation = await ask(decision === 'reviewed' ? 'Mark reviewed · keep private' : decision === 'rejected' ? 'Reject message' : 'Return message to pending', 'This decision is recorded and visible in the sender’s private history. It does not publish the message.', {danger: decision === 'rejected', reason: state.defaultReasons.message?.[decision]});
  if (!confirmation) return;
  await run(async () => {
    try {
      await request('/messages/' + encodeURIComponent(message.id) + '/review', {decision, revision: message.revision, reason: confirmation.reason});
      closeMessage(); notice('Decision saved. The message remains private.');
      await Promise.all([messages(), overview()]);
    } catch (error) {
      if (error.status === 409) await openMessage(message.id);
      throw error;
    }
  });
};
$('message-filter-form').onsubmit = event => { event.preventDefault(); state.messagesPage = 1; closeMessage(); run(messages); };
$('refresh-messages').onclick = () => run(async () => { if (state.selectedMessage) await openMessage(state.selectedMessage.id); await messages(); });
$('messages-prev').onclick = () => { state.messagesPage--; closeMessage(); run(messages); };
$('messages-next').onclick = () => { state.messagesPage++; closeMessage(); run(messages); };
$('auto-approve-all').onchange = () => run(async () => {
  const input = $('auto-approve-all'), enabled = input.checked;
  input.disabled = true;
  try {
    const result = await request('/settings', {auto_approve_all: enabled, revision: state.settings.revision});
    syncApproval(result);
    notice(enabled ? `Automatic approval enabled: ${result.approved.messages} ${result.approved.messages === 1 ? 'message' : 'messages'} and ${result.approved.arguments} ${result.approved.arguments === 1 ? 'argument' : 'arguments'} approved by auto.` : 'Automatic approval disabled. New content will await review.');
    await overview();
  } catch (error) { await overview(); throw error; }
  finally { input.disabled = false; }
});
async function argumentsList() {
  const token = ++argumentsRequest;
  const query = new URLSearchParams({page: state.argumentsPage, status: $('argument-status').value, order: $('argument-order').value, search: $('argument-search').value});
  const data = await request('/arguments?' + query); if (token !== argumentsRequest) return;
  state.arguments = data.arguments; $('argument-list').replaceChildren();
  for (const item of data.arguments) {
    const button = element('button', null, 'message-item'); button.type = 'button';
    button.append(reviewBadge(item), element('strong', item.title), element('small', `${item.author} · ${date(item.createdAt)}`));
    button.onclick = () => openArgument(item); $('argument-list').append(button);
  }
  if (!data.arguments.length) $('argument-list').append(element('p', 'No arguments match these filters.', 'message-body muted'));
  pagination('arguments', data, 'arguments');
  if (state.selectedArgument) {
    const current = data.arguments.find(item => item.id === state.selectedArgument.id);
    if (current) openArgument(current); else { state.selectedArgument = null; $('argument-detail').hidden = true; }
  }
}
function openArgument(item) {
  state.selectedArgument = item; $('argument-detail').hidden = false;
  $('argument-title').textContent = item.title; $('argument-body').textContent = item.body;
  $('argument-meta').textContent = `${item.reviewNote || item.status} · ${item.author} · ${date(item.createdAt)}`;
  $('argument-link').href = '/argument/' + encodeURIComponent(item.slug) + '/';
  for (const button of document.querySelectorAll('[data-argument-decision]')) button.disabled = button.dataset.argumentDecision === item.status || (state.settings.auto_approve_all && button.dataset.argumentDecision === 'pending');
}
$('close-argument').onclick = () => { state.selectedArgument = null; $('argument-detail').hidden = true; };
for (const button of document.querySelectorAll('[data-argument-decision]')) button.onclick = async () => {
  const item = state.selectedArgument; if (!item) return;
  const decision = button.dataset.argumentDecision;
  const result = await ask(decision === 'reviewed' ? 'Review argument' : 'Return argument to pending', 'This records a review of the root contribution. The thread remains public.', {reason: state.defaultReasons.argument?.[decision]});
  if (!result) return;
  await run(async () => {
    await request('/arguments/' + item.id + '/review', {decision, revision: item.revision, reason: result.reason});
    $('argument-detail').hidden = true; state.selectedArgument = null;
    notice('Argument review saved.'); await Promise.all([argumentsList(), overview()]);
  });
};
$('argument-filter-form').onsubmit = event => { event.preventDefault(); state.argumentsPage = 1; $('argument-detail').hidden = true; run(argumentsList); };
$('refresh-arguments').onclick = () => run(argumentsList);
$('arguments-prev').onclick = () => { state.argumentsPage--; $('argument-detail').hidden = true; run(argumentsList); };
$('arguments-next').onclick = () => { state.argumentsPage++; $('argument-detail').hidden = true; run(argumentsList); };
$('refresh-overview').onclick = () => run(overview);
$('logout').onclick = () => run(async () => {
  const response = await fetch('/api/user/logout', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Argument-Request': '1'}, body: '{}'});
  if (!response.ok) throw new Error('Could not log out. Try again.'); location.assign('/user/');
});
async function navigate() {
  const tab = ['overview','users','messages','arguments'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
  for (const link of document.querySelectorAll('[data-tab]')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  document.title = `${tab === 'users' ? 'User accounts' : tab === 'messages' ? 'Message review' : tab === 'arguments' ? 'Argument review' : 'Overview'} · SOS Relay Admin`;
  if (tab === 'users') await users(); else if (tab === 'messages') await messages(); else if (tab === 'arguments') await argumentsList();
}
window.addEventListener('hashchange', () => run(navigate));
run(async () => { await overview(); await navigate(); });
