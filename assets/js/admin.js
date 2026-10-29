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

  function renderAreas() {
    const list = element('area-list');
    list.replaceChildren();
    if (!services.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Ainda não existem áreas.';
      list.append(empty);
      return;
    }

    for (const service of services) {
      const row = document.createElement('div');
      row.className = 'admin-row area-row';
      const label = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = service.name;
      const status = document.createElement('span');
      status.textContent = `${service.prefix} · ${service.active ? 'Ativa' : 'Inativa'}`;
      label.append(name, status);

      const actions = document.createElement('div');
      actions.className = 'admin-row-actions area-row-actions';
      const nameInput = document.createElement('input');
      nameInput.value = service.name;
      nameInput.maxLength = 80;
      nameInput.setAttribute('aria-label', `Nome da área ${service.name}`);
      const prefixInput = document.createElement('input');
      prefixInput.value = service.prefix;
      prefixInput.maxLength = 4;
      prefixInput.pattern = '[A-Za-z0-9]{1,4}';
      prefixInput.setAttribute('aria-label', `Prefixo da área ${service.name}`);
      const descriptionInput = document.createElement('input');
      descriptionInput.value = service.description || '';
      descriptionInput.maxLength = 240;
      descriptionInput.setAttribute('aria-label', `Descrição da área ${service.name}`);

      const save = document.createElement('button');
      save.className = 'button button-outline';
      save.type = 'button';
      save.textContent = 'Guardar';
      save.addEventListener('click', () => updateService(service, {
        name: nameInput.value.trim(),
        prefix: prefixInput.value.trim().toUpperCase(),
        description: descriptionInput.value.trim()
      }));

      const toggle = document.createElement('button');
      toggle.className = 'button button-outline';
      toggle.type = 'button';
      toggle.textContent = service.active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', () => updateService(service, { active: !service.active }));
      actions.append(nameInput, prefixInput, descriptionInput, save, toggle);
      row.append(label, actions);
      list.append(row);
    }
  }

  function renderCounters() {
    const serviceSelect = element('counter-service');
    serviceSelect.replaceChildren();
    for (const service of services.filter(item => item.active)) addOption(serviceSelect, service.id, service.name);
    element('counter-form').querySelector('button[type="submit"]').disabled = !services.some(service => service.active);

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
      for (const service of services.filter(item => item.active)) addOption(area, service.id, service.name);
      const assignedService = services.find(service => service.id === counter.service_id);
      if (assignedService && !assignedService.active) {
        addOption(area, assignedService.id, `${assignedService.name} · Inativa`);
      }
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
      request('/rest/v1/services?select=id,name,prefix,description,active,position&order=position.asc'),
      request('/rest/v1/counters?select=id,name,service_id,active,services(name)&order=name.asc'),
      request('/rest/v1/profiles?select=id,full_name,active,counter_id&role=eq.attendant&order=full_name.asc')
    ]);
    services = serviceRows;
    counters = counterRows.map(counter => ({
      ...counter,
      service_name: Array.isArray(counter.services) ? counter.services[0]?.name : counter.services?.name
    }));
    employees = employeeRows;
    renderAreas();
    renderCounters();
    renderEmployees();
  }

  async function updateService(service, changes) {
    if (changes.active === false && counters.some(counter => counter.service_id === service.id && counter.active)) {
      setText('area-message', 'Reatribui ou desativa os balcões desta área antes de a desativar.');
      return;
    }
    try {
      await request(`/rest/v1/services?id=eq.${encodeURIComponent(service.id)}`, { method: 'PATCH', body: changes });
      setText('area-message', 'Área atualizada.');
      await loadData();
    } catch (error) {
      setText('area-message', error.message);
    }
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

  element('area-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    fields.name = fields.name.trim();
    fields.prefix = fields.prefix.trim().toUpperCase();
    fields.description = fields.description.trim();
    fields.position = Math.max(0, ...services.map(service => service.position || 0)) + 1;
    try {
      await request('/rest/v1/services', { method: 'POST', body: fields });
      form.reset();
      setText('area-message', 'Área adicionada. Já está disponível no site.');
      await loadData();
    } catch (error) {
      setText('area-message', error.message);
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
      const signupError = signup.error_description || signup.msg || signup.message || signup.error || signup.error_code || '';
      const emailAlreadyUsed = ['email_exists', 'user_already_exists'].includes(signup.code)
        || ['email_exists', 'user_already_exists'].includes(signup.error_code)
        || /already (registered|exists)|já está registad/i.test(signupError)
        || (Array.isArray(signup.user?.identities) && signup.user.identities.length === 0);
      if (emailAlreadyUsed) {
        throw new Error('Este email já está registado. Usa um endereço diferente do administrador e dos restantes utilizadores.');
      }
      if (!signupResponse.ok || !signup.user?.id) {
        throw new Error(signupError || 'Não foi possível criar a conta. Verifica as definições de registo por email no Supabase.');
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