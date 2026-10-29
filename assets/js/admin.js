(() => {
  const config = window.CHAMAJA_BACKEND || {};
  const backendUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const backendKey = String(config.supabaseAnonKey || '');
  let accessToken = '';
  let services = [];
  let counters = [];
  let employees = [];

  const element = id => document.getElementById(id);
  const setText = (id, value) => { element(id).textContent = value; };

  function headers(token = accessToken) {
    return {
      apikey: backendKey,
      Authorization: `Bearer ${token || backendKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
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

  function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function renderCounters() {
    const serviceSelect = element('counter-service');
    serviceSelect.replaceChildren();
    for (const service of services) addOption(serviceSelect, service.id, service.name);

    const employeeCounter = element('employee-counter');
    employeeCounter.replaceChildren();
    const activeCounters = counters.filter(counter => counter.active);
    for (const counter of activeCounters) {
      addOption(employeeCounter, counter.id, `${counter.name} · ${counter.service_name}`);
    }
    element('employee-submit').disabled = activeCounters.length === 0;

    const list = element('counter-list');
    list.replaceChildren();
    if (!counters.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Ainda não existem balcões.';
      list.append(empty);
      return;
    }
    for (const counter of counters) {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const label = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = counter.name;
      const detail = document.createElement('span');
      detail.textContent = `${counter.service_name} · ${counter.active ? 'Ativo' : 'Inativo'}`;
      label.append(name, detail);
      const actions = document.createElement('div');
      actions.className = 'admin-row-actions';
      const area = document.createElement('select');
      area.setAttribute('aria-label', `Área do ${counter.name}`);
      for (const service of services) addOption(area, service.id, service.name);
      area.value = counter.service_id;
      area.addEventListener('change', () => updateCounter(counter, { service_id: area.value }));
      const toggle = document.createElement('button');
      toggle.className = 'button button-outline';
      toggle.type = 'button';
      toggle.textContent = counter.active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', () => updateCounter(counter, { active: !counter.active }));
      actions.append(area, toggle);
      row.append(label, actions);
      list.append(row);
    }
  }

  function renderEmployees() {
    const list = element('employee-list');
    list.replaceChildren();
    if (!employees.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Ainda não existem funcionários.';
      list.append(empty);
      return;
    }
    for (const employee of employees) {
      const row = document.createElement('div');
      row.className = 'admin-row';
      const label = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = employee.full_name;
      const detail = document.createElement('span');
      const assigned = counters.find(counter => counter.id === employee.counter_id);
      detail.textContent = `${assigned ? `${assigned.name} · ${assigned.service_name}` : 'Sem balcão'} · ${employee.active ? 'Ativo' : 'Inativo'}`;
      label.append(name, detail);
      const actions = document.createElement('div');
      actions.className = 'admin-row-actions';
      const counterSelect = document.createElement('select');
      counterSelect.setAttribute('aria-label', `Balcão de ${employee.full_name}`);
      for (const counter of counters.filter(item => item.active)) {
        addOption(counterSelect, counter.id, `${counter.name} · ${counter.service_name}`);
      }
      counterSelect.value = employee.counter_id || '';
      counterSelect.addEventListener('change', () => updateEmployee(employee, { counter_id: counterSelect.value }));
      const toggle = document.createElement('button');
      toggle.className = 'button button-outline';
      toggle.type = 'button';
      toggle.textContent = employee.active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', () => updateEmployee(employee, { active: !employee.active }));
      actions.append(counterSelect, toggle);
      row.append(label, actions);
      list.append(row);
    }
  }

  async function loadData() {
    const [serviceRows, counterRows, employeeRows] = await Promise.all([
      request('/rest/v1/services?select=id,name&active=eq.true&order=position.asc'),
      request('/rest/v1/counters?select=id,name,service_id,active,services(name)&order=name.asc'),
      request('/rest/v1/profiles?select=id,full_name,active,counter_id&role=eq.attendant&order=full_name.asc')
    ]);
    services = serviceRows;
    counters = counterRows.map(counter => ({
      ...counter,
      service_name: Array.isArray(counter.services) ? counter.services[0]?.name : counter.services?.name
    }));
    employees = employeeRows;
    renderCounters();
    renderEmployees();
  }

  async function updateCounter(counter, changes) {
    try {
      await request(`/rest/v1/counters?id=eq.${encodeURIComponent(counter.id)}`, { method: 'PATCH', body: changes });
      await loadData();
    } catch (error) {
      setText('counter-message', error.message);
    }
  }

  async function updateEmployee(employee, changes) {
    try {
      if (changes.counter_id) {
        const counter = counters.find(item => item.id === changes.counter_id);
        changes.service_id = counter.service_id;
      }
      await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(employee.id)}`, { method: 'PATCH', body: changes });
      await loadData();
    } catch (error) {
      setText('employee-message', error.message);
    }
  }

  element('admin-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!backendUrl || !backendKey) {
      setText('admin-login-message', 'O portal ainda não está configurado.');
      return;
    }
    const submit = element('admin-login-submit');
    submit.disabled = true;
    setText('admin-login-message', 'A validar acesso…');
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
        select: 'id,full_name,active,role',
        id: `eq.${auth.user.id}`,
        active: 'eq.true',
        role: 'eq.admin'
      });
      const profiles = await request(`/rest/v1/profiles?${query}`);
      if (!profiles.length) throw new Error('Esta conta não está autorizada como administrador ativo.');
      setText('admin-name', profiles[0].full_name);
      await loadData();
      element('admin-login-view').hidden = true;
      element('admin-view').hidden = false;
    } catch (error) {
      accessToken = '';
      setText('admin-login-message', error.message);
    } finally {
      submit.disabled = false;
    }
  });

  element('counter-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    try {
      await request('/rest/v1/counters', { method: 'POST', body: fields });
      form.reset();
      setText('counter-message', 'Balcão adicionado.');
      await loadData();
    } catch (error) {
      setText('counter-message', error.message);
    }
  });

  element('employee-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const submit = element('employee-submit');
    submit.disabled = true;
    setText('employee-message', 'A criar conta e perfil…');
    try {
      const signupResponse = await fetch(`${backendUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: backendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fields.email,
          password: fields.password,
          data: { full_name: fields.full_name }
        })
      });
      const signup = await signupResponse.json();
      if (!signupResponse.ok || !signup.user?.id) {
        throw new Error(signup.msg || signup.message || 'Não foi possível criar a conta.');
      }
      const selectedCounter = counters.find(counter => counter.id === fields.counter_id);
      await request('/rest/v1/profiles', {
        method: 'POST',
        body: {
          id: signup.user.id,
          full_name: fields.full_name,
          role: 'attendant',
          service_id: selectedCounter.service_id,
          counter_id: selectedCounter.id
        }
      });
      form.reset();
      setText('employee-message', 'Funcionário criado e associado ao balcão.');
      await loadData();
    } catch (error) {
      setText('employee-message', error.message);
    } finally {
      submit.disabled = counters.every(counter => !counter.active);
    }
  });

  element('admin-logout').addEventListener('click', async () => {
    try { await request('/auth/v1/logout', { method: 'POST' }); } catch { }
    accessToken = '';
    element('admin-view').hidden = true;
    element('admin-login-view').hidden = false;
    element('admin-login-form').reset();
  });

  if (!backendUrl || !backendKey) {
    element('admin-login-submit').disabled = true;
    setText('admin-login-message', 'O portal ainda não está configurado.');
  }
})();