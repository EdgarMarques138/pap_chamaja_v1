(() => {
  const config = window.CHAMAJA_BACKEND || {};
  const backendUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const backendKey = String(config.supabaseAnonKey || '');
  let accessToken = '';
  let profile = null;
  let tickets = [];
  let refreshTimer = null;

  const element = id => document.getElementById(id);
  const setText = (id, value) => { element(id).textContent = value; };

  function headers(token = accessToken) {
    return {
      apikey: backendKey,
      Authorization: `Bearer ${token || backendKey}`,
      'Content-Type': 'application/json'
    };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${backendUrl}${path}`, {
      method: options.method || 'GET',
      headers: { ...headers(options.token), ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const text = await response.text();
    let result = null;
    try { result = text ? JSON.parse(text) : null; } catch { result = text; }
    if (!response.ok) {
      throw new Error(result?.message || result?.msg || result?.hint || 'Não foi possível contactar o servidor.');
    }
    return result;
  }

  async function rpc(name, parameters = {}) {
    return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: parameters });
  }

  function currentTicket() {
    return tickets.find(ticket => ticket.counter_id === profile.counter_id && ['called', 'serving'].includes(ticket.state)) || null;
  }

  function render() {
    if (!profile) return;
    const active = currentTicket();
    const waiting = tickets.filter(ticket => ticket.state === 'waiting').length;
    setText('staff-name', profile.full_name);
    setText('staff-assignment', `${profile.service_name} · ${profile.counter_name}`);
    setText('current-ticket', active?.number || '---');
    setText('current-service', active?.service_name || 'Não há atendimento em curso.');
    setText('current-status', active ? (active.state === 'serving' ? 'Atendimento em curso.' : 'Aguarda início do atendimento.') : '');
    setText('queue-count', `${waiting} ${waiting === 1 ? 'senha em espera' : 'senhas em espera'} no sistema`);

    element('call-next').disabled = Boolean(active) || waiting === 0;
    element('start-service').disabled = !active || active.state !== 'called';
    element('finish-service').disabled = !active || active.state !== 'serving';
    element('mark-absent').disabled = !active;

    const list = element('recent-tickets');
    list.replaceChildren();
    const recent = tickets.filter(ticket => ticket.called_at).slice(0, 5);
    if (!recent.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Ainda não existem chamadas neste serviço.';
      list.append(empty);
    } else {
      for (const ticket of recent) {
        const row = document.createElement('div');
        row.className = 'recent-row';
        const number = document.createElement('strong');
        number.textContent = ticket.number;
        const label = document.createElement('span');
        label.textContent = `${ticket.service_name} · ${ticket.state === 'done' ? 'Concluída' : ticket.counter_name || profile.counter_name}`;
        row.append(number, label);
        list.append(row);
      }
    }

    const allTickets = element('all-tickets');
    allTickets.replaceChildren();
    for (const ticket of tickets) {
      const row = document.createElement('tr');
      const values = [
        ticket.number,
        ticket.service_name || 'Serviço',
        ({ waiting: 'Em espera', called: 'Chamada', serving: 'Em atendimento', done: 'Concluída', absent: 'Ausente' })[ticket.state] || ticket.state,
        new Date(ticket.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
        ticket.counter_name || '—'
      ];
      for (const [index, value] of values.entries()) {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.textContent = value;
        row.append(cell);
      }
      allTickets.append(row);
    }
    if (!tickets.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'empty-state';
      cell.textContent = 'Ainda não existem senhas.';
      row.append(cell);
      allTickets.append(row);
    }
  }

  async function refreshQueue() {
    if (!profile) return;
    const query = new URLSearchParams({
      select: 'id,number,service_id,counter_id,state,created_at,called_at,services(name),counters(name)',
      order: 'created_at.desc',
      limit: '1000'
    });
    const result = await request(`/rest/v1/tickets?${query}`);
    tickets = result.map(ticket => ({
      ...ticket,
      service_name: Array.isArray(ticket.services) ? ticket.services[0]?.name : ticket.services?.name,
      counter_name: Array.isArray(ticket.counters) ? ticket.counters[0]?.name : ticket.counters?.name
    }));
    render();
  }

  async function performAction(action) {
    const active = currentTicket();
    if (!profile) {
      showLogin();
      return;
    }
    setText('action-message', 'A atualizar atendimento…');
    try {
      if (action === 'call') {
        const result = await rpc('call_next_ticket');
        const ticket = Array.isArray(result) ? result[0] : result;
        setText('action-message', ticket ? `Senha ${ticket.number} chamada.` : 'Não há senhas em espera neste serviço.');
      } else {
        if (!active) return;
        const actionName = action === 'start' ? 'start' : action === 'finish' ? 'done' : 'absent';
        await rpc('advance_ticket', { p_ticket_id: active.id, p_action: actionName });
        setText('action-message', action === 'absent' ? `Senha ${active.number} marcada como ausência.` : action === 'finish' ? `Senha ${active.number} concluída.` : `Atendimento da senha ${active.number} iniciado.`);
      }
      await refreshQueue();
    } catch (error) {
      setText('action-message', error.message);
    }
  }

  function showLogin() {
    element('staff-view').hidden = true;
    element('login-view').hidden = false;
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function showStaff() {
    element('login-view').hidden = true;
    element('staff-view').hidden = false;
    render();
  }

  element('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!backendUrl || !backendKey) {
      setText('login-message', 'O portal ainda não está configurado. Contacta o administrador do sistema.');
      return;
    }
    const submit = element('login-submit');
    submit.disabled = true;
    setText('login-message', 'A validar acesso…');
    try {
      const credentials = Object.fromEntries(new FormData(event.currentTarget));
      const authResponse = await fetch(`${backendUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: backendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.email, password: credentials.password })
      });
      const auth = await authResponse.json();
      if (!authResponse.ok) throw new Error(auth.msg || auth.message || 'Email ou palavra-passe inválidos.');
      accessToken = auth.access_token;
      const query = new URLSearchParams({
        select: 'id,full_name,role,service_id,counter_id,active,services(name),counters(name)',
        id: `eq.${auth.user.id}`,
        active: 'eq.true',
        role: 'eq.attendant'
      });
      const profiles = await request(`/rest/v1/profiles?${query}`);
      if (!profiles.length) throw new Error('Esta conta não está autorizada como funcionário ativo.');
      const row = profiles[0];
      const service = Array.isArray(row.services) ? row.services[0] : row.services;
      const counter = Array.isArray(row.counters) ? row.counters[0] : row.counters;
      if (!row.counter_id || !counter || (row.service_id && !service)) {
        throw new Error('O perfil precisa de ter um balcão atribuído e um serviço válido.');
      }
      profile = { ...row, service_name: service?.name || 'Todos os serviços', counter_name: counter.name };
      setText('login-message', '');
      setText('action-message', 'Sessão iniciada.');
      showStaff();
      await refreshQueue();
      refreshTimer = window.setInterval(() => refreshQueue().catch(error => setText('action-message', error.message)), 5000);
    } catch (error) {
      accessToken = '';
      profile = null;
      setText('login-message', error.message);
    } finally {
      submit.disabled = false;
    }
  });

  element('logout').addEventListener('click', async () => {
    try { await request('/auth/v1/logout', { method: 'POST' }); } catch { }
    accessToken = '';
    profile = null;
    tickets = [];
    showLogin();
  });

  element('call-next').addEventListener('click', () => performAction('call'));
  element('start-service').addEventListener('click', () => performAction('start'));
  element('finish-service').addEventListener('click', () => performAction('finish'));
  element('mark-absent').addEventListener('click', () => performAction('absent'));

  if (!backendUrl || !backendKey) {
    element('login-submit').disabled = true;
    setText('login-message', 'O portal privado ainda não está configurado. Contacta o administrador do sistema.');
  }
})();