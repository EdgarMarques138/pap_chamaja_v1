(() => {
  const config = window.CHAMAJA_BACKEND || {};
  const backendUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
  const backendKey = String(config.supabaseAnonKey || '');
  let accessToken = '';
  let services = [];
  let counters = [];
  let counterServices = [];
  let employees = [];
  let supportsPriorityFeature = true;

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

  async function hasTable(tableName) {
    try {
      await request(`/rest/v1/${tableName}?select=id&limit=1`);
      return true;
    } catch (error) {
      return !/does not exist|not found|not exist|could not find the table/i.test(error.message || '');
    }
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

  async function syncCounterServices(counter, serviceIds) {
    const selectedIds = [...new Set((serviceIds || []).filter(Boolean))];
    if (!selectedIds.length) {
      throw new Error('Seleciona pelo menos uma área para este balcão.');
    }

    const existingLinks = await request(`/rest/v1/counter_services?select=id,service_id&counter_id=eq.${encodeURIComponent(counter.id)}`);
    const selectedSet = new Set(selectedIds);
    for (const link of existingLinks) {
      if (!selectedSet.has(link.service_id)) {
        await request(`/rest/v1/counter_services?id=eq.${encodeURIComponent(link.id)}`, { method: 'DELETE' });
      }
    }

    const existingIds = new Set(existingLinks.map(link => link.service_id));
    for (const serviceId of selectedIds) {
      if (!existingIds.has(serviceId)) {
        await request('/rest/v1/counter_services', {
          method: 'POST',
          body: { counter_id: counter.id, service_id: serviceId }
        });
      }
    }

    if (counter.service_id !== selectedIds[0]) {
      await request(`/rest/v1/counters?id=eq.${encodeURIComponent(counter.id)}`, {
        method: 'PATCH',
        body: { service_id: selectedIds[0] }
      });
    }
  }

  function renderCounters() {
    const priorityField = document.querySelector('#counter-priority')?.closest('.counter-priority-field');
    if (priorityField) {
      priorityField.hidden = !supportsPriorityFeature;
    }
    const priorityInput = document.getElementById('counter-priority');
    if (priorityInput) {
      priorityInput.disabled = !supportsPriorityFeature;
    }

    const serviceSelect = element('counter-services');
    serviceSelect.replaceChildren();
    for (const service of services.filter(item => item.active)) addOption(serviceSelect, service.id, service.name);
    element('counter-form').querySelector('button[type="submit"]').disabled = !services.some(service => service.active);

    const employeeCounter = element('employee-counter');
    employeeCounter.replaceChildren();
    const activeCounters = counters.filter(counter => counter.active);
    for (const counter of activeCounters) {
      const serviceLabel = (counter.service_ids?.length ? counter.service_ids.map(id => {
        const found = services.find(item => item.id === id);
        return found ? found.name : id;
      }).join(', ') : counter.service_name || 'Sem área');
      addOption(employeeCounter, counter.id, `${counter.name} · ${serviceLabel}`);
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
      const assigned = counter.service_ids?.length ? counter.service_ids.map(id => services.find(service => service.id === id)?.name || 'Área').join(', ') : (counter.service_name || 'Sem área');
      detail.textContent = `${assigned} · ${counter.active ? 'Ativo' : 'Inativo'}${counter.priority_enabled ? ' · Prioridade' : ''}`;
      label.append(name, detail);
      const actions = document.createElement('div');
      actions.className = 'admin-row-actions';
      const area = document.createElement('select');
      area.setAttribute('aria-label', `Áreas do ${counter.name}`);
      area.multiple = true;
      area.size = Math.min(Math.max(3, services.filter(item => item.active).length), 6);

      const activeServices = services.filter(item => item.active);
      for (const service of activeServices) {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name;
        option.selected = Boolean(counter.service_ids?.includes(service.id));
        area.append(option);
      }
      const inactiveAssigned = services.filter(service => counter.service_ids?.includes(service.id) && !service.active);
      for (const service of inactiveAssigned) {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = `${service.name} · Inativa`;
        option.selected = true;
        area.append(option);
      }
      area.addEventListener('change', () => {
        const selectedIds = [...area.selectedOptions].map(option => option.value);
        updateCounter(counter, { service_ids: selectedIds });
      });

      const priorityToggle = document.createElement('label');
      priorityToggle.className = 'counter-priority-field';
      const priorityCheckbox = document.createElement('input');
      priorityCheckbox.type = 'checkbox';
      priorityCheckbox.checked = Boolean(counter.priority_enabled);
      priorityCheckbox.addEventListener('change', () => updateCounter(counter, { priority_enabled: priorityCheckbox.checked }));
      const priorityLabel = document.createElement('span');
      priorityLabel.textContent = 'Prioridade';
      priorityToggle.append(priorityCheckbox, priorityLabel);

      const toggle = document.createElement('button');
      toggle.className = 'button button-outline';
      toggle.type = 'button';
      toggle.textContent = counter.active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', () => updateCounter(counter, { active: !counter.active }));
      actions.append(area, priorityToggle, toggle);
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
      const resetPassword = document.createElement('button');
      resetPassword.className = 'button button-outline';
      resetPassword.type = 'button';
      resetPassword.textContent = 'Senha';
      resetPassword.title = `Alterar palavra-passe de ${employee.full_name}`;
      resetPassword.addEventListener('click', () => resetEmployeePassword(employee));
      const toggle = document.createElement('button');
      toggle.className = 'button button-outline';
      toggle.type = 'button';
      toggle.textContent = employee.active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', () => updateEmployee(employee, { active: !employee.active }));
      const remove = document.createElement('button');
      remove.className = 'button button-outline';
      remove.type = 'button';
      remove.textContent = 'Remover';
      remove.title = `Remover ${employee.full_name}`;
      remove.addEventListener('click', () => deleteEmployee(employee));
      actions.append(counterSelect, resetPassword, toggle, remove);
      row.append(label, actions);
      list.append(row);
    }
  }

  async function loadData() {
    let counterRows = [];
    try {
      counterRows = await request('/rest/v1/counters?select=id,name,service_id,active,priority_enabled,services(name)&order=name.asc');
      supportsPriorityFeature = true;
    } catch (error) {
      if (!/priority_enabled|column.*does not exist|does not exist|not found|not exist/i.test(error.message || '')) {
        throw error;
      }
      supportsPriorityFeature = false;
      counterRows = await request('/rest/v1/counters?select=id,name,service_id,active&order=name.asc');
    }

    let serviceRows = [];
    try {
      serviceRows = await request('/rest/v1/services?select=id,name,prefix,description,active,position&order=position.asc');
    } catch (error) {
      if (!/description|position|column.*does not exist|does not exist/i.test(error.message || '')) {
        throw error;
      }
      serviceRows = await request('/rest/v1/services?select=id,name,prefix,active&order=name.asc');
      serviceRows = serviceRows.map(service => ({ ...service, description: '', position: 0 }));
    }
    const employeeRows = await request('/rest/v1/profiles?select=id,full_name,active,counter_id&role=eq.attendant&order=full_name.asc');
    services = serviceRows;
    counterServices = [];
    let linkRows = [];
    if (await hasTable('counter_services')) {
      try {
        linkRows = await request('/rest/v1/counter_services?select=counter_id,service_id,services(name)&order=counter_id.asc');
      } catch (error) {
        if (!/counter_services|does not exist|not found|not exist/i.test(error.message || '')) {
          throw error;
        }
        linkRows = [];
      }
    }
    counterServices = linkRows.map(link => ({
      counter_id: link.counter_id,
      service_id: link.service_id,
      name: Array.isArray(link.services) ? link.services[0]?.name : link.services?.name
    }));
    const linkedByCounter = new Map();
    for (const link of counterServices) {
      const current = linkedByCounter.get(link.counter_id) || [];
      current.push(link.service_id);
      linkedByCounter.set(link.counter_id, current);
    }
    counters = counterRows.map(counter => {
      const linked = linkedByCounter.get(counter.id) || [];
      const serviceIds = [...new Set([...(counter?.service_id ? [counter.service_id] : []), ...linked])];
      return {
        ...counter,
        service_id: counter.service_id || serviceIds[0] || null,
        service_ids: serviceIds,
        service_name: (Array.isArray(counter.services) ? counter.services[0]?.name : counter.services?.name)
          || services.find(service => service.id === (counter.service_id || serviceIds[0]))?.name,
        priority_enabled: supportsPriorityFeature ? Boolean(counter.priority_enabled) : false
      };
    });
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
    if (changes.priority_enabled !== undefined && !supportsPriorityFeature) {
      setText('counter-message', 'Atendimento prioritário não está disponível nesta base de dados.');
      return;
    }

    try {
      if (Array.isArray(changes.service_ids)) {
        await syncCounterServices(counter, changes.service_ids);
        await loadData();
        return;
      }

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

  async function resetEmployeePassword(employee) {
    const nextPassword = window.prompt(`Nova palavra-passe para ${employee.full_name}:`, '');
    if (nextPassword === null) return;
    const value = nextPassword.trim();
    if (!value || value.length < 8) {
      setText('employee-message', 'A palavra-passe deve ter pelo menos 8 caracteres.');
      return;
    }
    try {
      await request('/rest/v1/rpc/admin_reset_employee_password', {
        method: 'POST',
        body: { p_user_id: employee.id, p_new_password: value }
      });
      setText('employee-message', `Palavra-passe redefinida para ${employee.full_name}.`);
    } catch (error) {
      setText('employee-message', error.message);
    }
  }

  async function deleteEmployee(employee) {
    const accepted = window.confirm(`Remover ${employee.full_name} e a conta de acesso deste funcionário?`);
    if (!accepted) return;
    try {
      await request('/rest/v1/rpc/admin_delete_employee', {
        method: 'POST',
        body: { p_user_id: employee.id }
      });
      setText('employee-message', `${employee.full_name} foi removido.`);
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
    const selectedServices = [...element('counter-services').selectedOptions].map(option => option.value);
    const fields = Object.fromEntries(new FormData(form));
    const trimmedName = String(fields.name || '').trim();
    if (!trimmedName) {
      setText('counter-message', 'Indica um nome para o balcão.');
      return;
    }
    if (!selectedServices.length) {
      setText('counter-message', 'Seleciona pelo menos uma área para este balcão.');
      return;
    }
    try {
      const payload = {
        name: trimmedName,
        service_id: selectedServices[0]
      };
      if (supportsPriorityFeature) {
        payload.priority_enabled = Boolean(form.querySelector('#counter-priority').checked);
      }
      const created = await request('/rest/v1/counters', {
        method: 'POST',
        body: payload
      });
      const createdCounter = Array.isArray(created) ? created[0] : created;
      try {
        for (const serviceId of selectedServices.slice(1)) {
          await request('/rest/v1/counter_services', {
            method: 'POST',
            body: {
              counter_id: createdCounter.id,
              service_id: serviceId
            }
          });
        }
      } catch (error) {
        if (!/counter_services|does not exist|not found|not exist/i.test(error.message || '')) {
          throw error;
        }
      }
      form.reset();
      setText('counter-message', 'Balcão adicionado com as áreas selecionadas.');
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