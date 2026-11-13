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
    const allowed = new Set(profile?.service_ids || [profile?.service_id]);
    return tickets.find(ticket => ticket.counter_id === profile.counter_id && allowed.has(ticket.service_id) && ['called', 'serving'].includes(ticket.state)) || null;
  }

  function render() {
    if (!profile) return;
    const active = currentTicket();
    const allowed = new Set(profile.service_ids || [profile.service_id]);
    const waiting = tickets.filter(ticket => ticket.state === 'waiting' && allowed.has(ticket.service_id)).length;
    const serviceNames = (profile.service_names?.length ? profile.service_names : [profile.service_name]).filter(Boolean).join(', ');
    setText('staff-name', profile.full_name);
    setText('staff-assignment', `${serviceNames} · ${profile.counter_name}`);
    setText('current-ticket', active?.caller_name || active?.number || '---');
    element('current-ticket').classList.toggle('caller-name-display', Boolean(active?.caller_name));
    setText('current-service', active?.service_name || 'Não há atendimento em curso.');
    setText('current-status', active ? (active.state === 'serving' ? 'Atendimento em curso.' : 'Aguarda início do atendimento.') : '');
    setText('queue-count', `${waiting} ${waiting === 1 ? 'senha em espera' : 'senhas em espera'} em ${serviceNames}`);

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
        number.textContent = ticket.caller_name || ticket.number;
        const label = document.createElement('span');
        label.textContent = `${ticket.service_name} · ${ticket.state === 'done' ? 'Concluída' : ticket.counter_name || profile.counter_name}`;
        row.append(number, label);
        list.append(row);
      }
    }

    const allTickets = element('all-tickets');
    allTickets.replaceChildren();
    const orderedTickets = [...tickets].sort((a, b) => {
      const priorityDelta = Number(Boolean(b.priority)) - Number(Boolean(a.priority));
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(a.created_at) - new Date(b.created_at) || a.id.localeCompare(b.id);
    });
    for (const ticket of orderedTickets) {
      const row = document.createElement('tr');
      const values = [
        ticket.caller_name ? `${ticket.caller_name} (${ticket.number})` : ticket.number,
        `${ticket.service_name || 'Serviço'}${ticket.priority ? ' · Prioridade' : ''}`,
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
      const actionCell = document.createElement('td');
      if (ticket.state === 'waiting' && allowed.has(ticket.service_id)) {
        const callButton = document.createElement('button');
        callButton.className = 'button button-outline';
        callButton.type = 'button';
        callButton.textContent = 'Chamar';
        callButton.disabled = Boolean(active);
        callButton.addEventListener('click', () => performAction('call-ticket', ticket));
        actionCell.append(callButton);
      }
      row.append(actionCell);
      allTickets.append(row);
    }
    if (!tickets.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'empty-state';
      cell.textContent = 'Ainda não existem senhas.';
      row.append(cell);
      allTickets.append(row);
    }
  }

  async function refreshQueue() {
    if (!profile) return;
    try {
      const links = await request(`/rest/v1/counter_services?select=service_id,services(name)&counter_id=eq.${encodeURIComponent(profile.counter_id)}`);
      profile.service_ids = [...new Set([profile.service_id, ...links.map(link => link.service_id)].filter(Boolean))];
      const linkedNames = links.map(link => Array.isArray(link.services) ? link.services[0]?.name : link.services?.name);
      profile.service_names = [...new Set([profile.service_name, ...linkedNames].filter(Boolean))];
    } catch (error) {
      if (!/counter_services|does not exist|not found|not exist/i.test(error.message || '')) {
        throw error;
      }
      profile.service_ids = [profile.service_id].filter(Boolean);
      profile.service_names = [profile.service_name].filter(Boolean);
    }
    if (!profile.service_ids?.length) {
      profile.service_ids = [profile.service_id].filter(Boolean);
    }
    if (!profile.service_names?.length) {
      profile.service_names = [profile.service_name].filter(Boolean);
    }

    const queryOptions = {
      order: 'created_at.desc',
      limit: '1000'
    };
    let result;
    try {
      const query = new URLSearchParams({
        ...queryOptions,
        select: 'id,number,caller_name,service_id,counter_id,state,created_at,called_at,priority,services(name),counters(name)'
      });
      result = await request(`/rest/v1/tickets?${query}`);
    } catch (error) {
      if (!/priority|caller_name|column.*does not exist|does not exist/i.test(error.message || '')) {
        throw error;
      }
      const query = new URLSearchParams({
        ...queryOptions,
        select: 'id,number,service_id,counter_id,state,created_at,called_at,services(name),counters(name)'
      });
      result = await request(`/rest/v1/tickets?${query}`);
    }
    const allowed = new Set(profile.service_ids || [profile.service_id]);
    tickets = result.map(ticket => ({
      ...ticket,
      service_name: Array.isArray(ticket.services) ? ticket.services[0]?.name : ticket.services?.name,
      counter_name: Array.isArray(ticket.counters) ? ticket.counters[0]?.name : ticket.counters?.name
    })).filter(ticket => (
      (ticket.state === 'waiting' && allowed.has(ticket.service_id))
      || ticket.counter_id === profile.counter_id
    ));
    render();
  }

  async function performAction(action, selectedTicket = null) {
    const active = currentTicket();
    if (!profile) {
      showLogin();
      return;
    }
    setText('action-message', action === 'call-ticket' && selectedTicket
      ? `A chamar ${selectedTicket.caller_name || `senha ${selectedTicket.number}`}…`
      : 'A atualizar atendimento…');
    try {
      if (action === 'call') {
        const result = await rpc('call_next_ticket');
        const ticket = Array.isArray(result) ? result[0] : result;
        setText('action-message', ticket ? `${ticket.caller_name || `Senha ${ticket.number}`} chamada.` : 'Não há senhas em espera neste serviço.');
      } else if (action === 'call-ticket') {
        if (!selectedTicket) return;
        await rpc('call_ticket', { p_ticket_id: selectedTicket.id });
        setText('action-message', `${selectedTicket.caller_name || `Senha ${selectedTicket.number}`} chamada.`);
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
        select: 'id,full_name,role,service_id,counter_id,active,counters(name,service_id,services(name))',
        id: `eq.${auth.user.id}`,
        active: 'eq.true',
        role: 'eq.attendant'
      });
      const profiles = await request(`/rest/v1/profiles?${query}`);
      if (!profiles.length) throw new Error('Esta conta não está autorizada como funcionário ativo.');
      const row = profiles[0];
      const counter = Array.isArray(row.counters) ? row.counters[0] : row.counters;
      const counterService = Array.isArray(counter?.services) ? counter.services[0] : counter?.services;
      const counterServiceName = counterService?.name || null;
      let linkedServiceIds = [counter?.service_id].filter(Boolean);
      let linkedServiceNames = [counterServiceName].filter(Boolean);
      try {
        await request(`/rest/v1/counter_services?select=id&limit=1`);
        const counterLinks = await request(`/rest/v1/counter_services?select=service_id,services(name)&counter_id=eq.${row.counter_id}`);
        linkedServiceIds = [...new Set([...linkedServiceIds, ...counterLinks.map(link => link.service_id)])].filter(Boolean);
        linkedServiceNames = [...new Set([
          ...linkedServiceNames,
          ...counterLinks.map(link => Array.isArray(link.services) ? link.services[0]?.name : link.services?.name)
        ].filter(Boolean))];
      } catch (error) {
        if (!/counter_services|does not exist|not found|not exist/i.test(error.message || '')) {
          throw error;
        }
      }
      const primaryServiceName = linkedServiceNames[0] || counterServiceName || (counter?.service_name || null);
      if (!row.counter_id || !counter || !linkedServiceIds.length || !primaryServiceName) {
        throw new Error('O balcão atribuído precisa de ter uma área válida.');
      }
      profile = {
        ...row,
        service_id: row.service_id || counter.service_id || linkedServiceIds[0],
        service_ids: linkedServiceIds,
        service_name: primaryServiceName,
        service_names: linkedServiceNames,
        counter_name: counter.name
      };
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